import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { findLatestApiLog, isNoise, tailFiles } from './logTail.js';

const ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'asa-tail-'));

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Laisse au suivi le temps de plusieurs tours de scrutation */
async function settle(): Promise<void> {
  await delay(180);
}

test('les lignes ajoutees apres le demarrage sont remontees', async () => {
  const file = path.join(ROOT, 'append.log');
  await fs.writeFile(file, 'ancienne ligne\n', 'utf8');

  const seen: string[] = [];
  const stop = tailFiles([{ file, source: 'server', onLine: (text) => seen.push(text), intervalMs: 30 }]);
  await delay(60);

  await fs.appendFile(file, 'nouvelle ligne\n', 'utf8');
  await settle();
  stop();

  // L'historique anterieur n'est pas rejoue
  assert.deepEqual(seen, ['nouvelle ligne']);
});

test('une ligne incomplete attend sa fin avant d etre remontee', async () => {
  const file = path.join(ROOT, 'partial.log');
  await fs.writeFile(file, '', 'utf8');

  const seen: string[] = [];
  const stop = tailFiles([{ file, source: 'server', onLine: (text) => seen.push(text), intervalMs: 30 }]);
  await delay(60);

  await fs.appendFile(file, 'debut de ligne', 'utf8');
  await settle();
  assert.deepEqual(seen, [], 'une ligne sans fin de ligne ne doit pas etre emise');

  await fs.appendFile(file, ' et sa fin\n', 'utf8');
  await settle();
  stop();

  assert.deepEqual(seen, ['debut de ligne et sa fin']);
});

test('un fichier tronque ou recree est relu depuis le debut', async () => {
  const file = path.join(ROOT, 'rotate.log');
  await fs.writeFile(file, 'contenu initial assez long pour depasser\n', 'utf8');

  const seen: string[] = [];
  const stop = tailFiles([{ file, source: 'server', onLine: (text) => seen.push(text), intervalMs: 30 }]);
  await delay(60);

  // Nouveau demarrage du serveur : le fichier repart a zero
  await fs.writeFile(file, 'apres redemarrage\n', 'utf8');
  await settle();
  stop();

  assert.deepEqual(seen, ['apres redemarrage']);
});

test('les lignes de bruit repetitif sont ecartees', async () => {
  const file = path.join(ROOT, 'noise.log');
  await fs.writeFile(file, '', 'utf8');

  const seen: string[] = [];
  const stop = tailFiles([{ file, source: 'server', onLine: (text) => seen.push(text), intervalMs: 30 }]);
  await delay(60);

  await fs.appendFile(
    file,
    [
      'I Info/GameAnalytics : Event queue: No events to send',
      'Attempted GC & Defrag: Start: 9.93 GB',
      'Added Explorer Note Entry: DEARJANE_EXP_NOTE_1',
      'Server has completed startup and is now advertising for join.',
      '',
    ].join('\n'),
    'utf8',
  );
  await settle();
  stop();

  assert.deepEqual(seen, ['Server has completed startup and is now advertising for join.']);
});

test('isNoise reconnait le bruit sans ecarter les lignes utiles', () => {
  assert.equal(isNoise('I Info/GameAnalytics : Event queue: No events to send'), true);
  assert.equal(isNoise('Attempted GC & Defrag: Start: 1 GB'), true);
  assert.equal(isNoise('[AsaQoL][info] AsaQoL loaded'), false);
  assert.equal(isNoise('Server: "Test" has successfully started!'), false);
});

test('un fichier resolu tardivement est suivi des son apparition', async () => {
  const dir = path.join(ROOT, 'differe');
  await fs.mkdir(dir, { recursive: true });

  const seen: string[] = [];
  const stop = tailFiles([
    {
      file: () => findLatestApiLog(dir),
      source: 'plugin',
      onLine: (text) => seen.push(text),
      intervalMs: 30,
    },
  ]);

  await delay(60);
  assert.deepEqual(seen, [], 'rien a suivre tant que le fichier n existe pas');

  // Le journal d'AsaApi n'apparait qu'au lancement du serveur
  await fs.writeFile(path.join(dir, 'ArkApi_123_2026-08-12_16-06.log'), '[API][info] Loaded all plugins\n', 'utf8');
  await settle();
  stop();

  assert.deepEqual(seen, ['[API][info] Loaded all plugins']);
});

test('findLatestApiLog retient le fichier le plus recent', async () => {
  const dir = path.join(ROOT, 'plusieurs');
  await fs.mkdir(dir, { recursive: true });

  await fs.writeFile(path.join(dir, 'ArkApi_1_ancien.log'), 'a', 'utf8');
  await delay(20);
  await fs.writeFile(path.join(dir, 'ArkApi_2_recent.log'), 'b', 'utf8');
  await fs.writeFile(path.join(dir, 'autre-fichier.txt'), 'c', 'utf8');

  const found = await findLatestApiLog(dir);
  assert.equal(path.basename(found!), 'ArkApi_2_recent.log');
});

test('un dossier inexistant ne fait pas echouer la resolution', async () => {
  assert.equal(await findLatestApiLog(path.join(ROOT, 'absent')), null);
});
