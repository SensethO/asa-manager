/**
 * Envoie une commande RCON arbitraire au serveur d'un profil.
 *
 *   npm run rcon -- "ListPlayers"
 *   npm run rcon -- "Broadcast Bonjour" --profil "Test1"
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { RconClient } from '../server/src/services/rcon.js';
import type { ServerProfile } from '../shared/types.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const profileFlag = args.indexOf('--profil');
  const wanted = profileFlag === -1 ? undefined : args[profileFlag + 1];
  const command = (profileFlag === -1 ? args : args.slice(0, profileFlag)).join(' ').trim();

  if (!command) {
    console.error('Usage : npm run rcon -- "<commande>" [--profil "<nom>"]');
    process.exitCode = 1;
    return;
  }

  const file = path.resolve(process.cwd(), process.env.ASA_MANAGER_DATA ?? 'data', 'profiles.json');
  const { profiles } = JSON.parse(await readFile(file, 'utf8')) as { profiles: ServerProfile[] };

  const profile = wanted
    ? profiles.find((entry) => entry.name.toLowerCase() === wanted.toLowerCase())
    : profiles[0];

  if (!profile) {
    console.error(wanted ? `Profil "${wanted}" introuvable.` : 'Aucun profil enregistre.');
    process.exitCode = 1;
    return;
  }

  const client = new RconClient({
    host: '127.0.0.1',
    port: profile.rconPort,
    password: profile.adminPassword,
    timeoutMs: 15_000,
  });

  try {
    await client.connect();
    const at = Date.now();
    const response = await client.exec(command);
    console.log(`${command} -> ${Date.now() - at} ms`);
    console.log(response.trim() || '(reponse vide)');
  } catch (error) {
    console.error(`ECHEC : ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

void main();
