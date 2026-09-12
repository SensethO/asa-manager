/**
 * Diagnostic RCON.
 *
 *   npm run rcon:check              -> premier profil enregistre
 *   npm run rcon:check -- "Test1"   -> profil designe par son nom
 *
 * Distingue les trois pannes qui se ressemblent depuis l'interface :
 * port ferme, mot de passe refuse, et commandes sans reponse.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { RconClient } from '../server/src/services/rcon.js';
import type { ServerProfile } from '../shared/types.js';

const COMMANDS = ['ListPlayers', 'GetChat'];

async function main(): Promise<void> {
  const wanted = process.argv[2];
  const file = path.resolve(process.cwd(), process.env.ASA_MANAGER_DATA ?? 'data', 'profiles.json');

  let profiles: ServerProfile[];
  try {
    profiles = (JSON.parse(await readFile(file, 'utf8')) as { profiles: ServerProfile[] }).profiles;
  } catch {
    console.error(`Impossible de lire ${file}. Lancez le gestionnaire au moins une fois.`);
    process.exitCode = 1;
    return;
  }

  const profile = wanted
    ? profiles.find((entry) => entry.name.toLowerCase() === wanted.toLowerCase())
    : profiles[0];

  if (!profile) {
    console.error(wanted ? `Profil "${wanted}" introuvable.` : 'Aucun profil enregistre.');
    process.exitCode = 1;
    return;
  }

  console.log(`Profil "${profile.name}" — RCON 127.0.0.1:${profile.rconPort}`);

  if (!profile.rconEnabled) {
    console.error('Le RCON est desactive dans les parametres de ce profil.');
    process.exitCode = 1;
    return;
  }
  if (!profile.adminPassword) {
    console.error("Aucun mot de passe administrateur : le RCON ne peut pas s'authentifier.");
    process.exitCode = 1;
    return;
  }

  const client = new RconClient({
    host: '127.0.0.1',
    port: profile.rconPort,
    password: profile.adminPassword,
    timeoutMs: 15_000,
  });

  const started = Date.now();
  try {
    await client.connect();
    console.log(`  authentification : OK (${Date.now() - started} ms)`);
  } catch (error) {
    console.error(`  authentification : ECHEC — ${(error as Error).message}`);
    console.error('  Verifiez que le serveur est demarre et que le mot de passe administrateur correspond.');
    process.exitCode = 1;
    client.close();
    return;
  }

  let failures = 0;
  for (const command of COMMANDS) {
    const at = Date.now();
    try {
      const response = await client.exec(command);
      console.log(`  ${command} : OK (${Date.now() - at} ms) — ${JSON.stringify(response.trim().slice(0, 100))}`);
    } catch (error) {
      failures++;
      console.error(`  ${command} : ECHEC — ${(error as Error).message}`);
    }
  }

  client.close();

  if (failures > 0) {
    console.error(
      "\nL'authentification passe mais les commandes restent sans reponse. " +
        "C'est la signature d'un paquet supplementaire envoye derriere la commande, qu'ARK ne supporte pas.",
    );
    process.exitCode = 1;
  } else {
    console.log('\nRCON pleinement fonctionnel.');
  }
}

void main();
