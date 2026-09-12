/**
 * Diagnostic : deroule le chemin de demarrage complet du gestionnaire
 * (verifications, lancement, attente de disponibilite, RCON), puis arrete.
 *
 *   npm run start:check
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { bus } from '../server/src/services/events.js';
import { listPlayers, snapshot, start, stop } from '../server/src/services/serverProcess.js';
import type { ServerProfile } from '../shared/types.js';

const READY_TIMEOUT_MS = 5 * 60_000;

async function main(): Promise<void> {
  const file = path.resolve(process.cwd(), 'data', 'profiles.json');
  const { profiles } = JSON.parse(await readFile(file, 'utf8')) as { profiles: ServerProfile[] };
  const profile = profiles[0]!;

  bus.on('event', (event) => {
    if (event.type === 'log' && event.line.source === 'manager') {
      console.log(`  [journal] ${event.line.text}`);
    }
  });

  console.log(`Profil : ${profile.name}`);

  const at = Date.now();
  await start(profile);
  console.log(`lancement rendu en ${Date.now() - at} ms — statut ${snapshot(profile.id).status}`);

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    const state = snapshot(profile.id);
    if (state.status === 'running') {
      console.log(`serveur pret apres ${Math.round((Date.now() - at) / 1000)} s`);
      break;
    }
    if (state.status === 'error' || state.status === 'stopped') {
      console.error(`echec : statut ${state.status} — ${state.lastError ?? 'sans detail'}`);
      return;
    }
  }

  if (snapshot(profile.id).status !== 'running') {
    console.error('le serveur n a pas atteint l etat "en ligne" dans le delai imparti');
    return;
  }

  const players = await listPlayers(profile).catch((error: Error) => error.message);
  console.log(`RCON ListPlayers : ${JSON.stringify(players)}`);

  console.log('arret immediat...');
  await stop(profile, { immediate: true });
  console.log(`statut final : ${snapshot(profile.id).status}`);
}

void main();
