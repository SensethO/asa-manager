import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SerialQueue } from './serialQueue.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('deux taches de meme cle ne se chevauchent jamais', async () => {
  const queue = new SerialQueue();
  let running = 0;
  let overlaps = 0;

  const task = async () => {
    running++;
    if (running > 1) overlaps++;
    await delay(20);
    running--;
  };

  await Promise.all(Array.from({ length: 5 }, () => queue.run('serveur', task)));

  assert.equal(overlaps, 0);
});

test('des cles differentes s executent en parallele', async () => {
  const queue = new SerialQueue();
  let concurrent = 0;
  let peak = 0;

  const task = async () => {
    concurrent++;
    peak = Math.max(peak, concurrent);
    await delay(30);
    concurrent--;
  };

  await Promise.all([queue.run('a', task), queue.run('b', task), queue.run('c', task)]);

  assert.equal(peak, 3);
});

test("l'ordre d'entree est respecte", async () => {
  const queue = new SerialQueue();
  const order: number[] = [];

  await Promise.all(
    [1, 2, 3].map((n) =>
      queue.run('serveur', async () => {
        // La premiere tache est la plus lente : sans file, elle finirait derniere
        await delay(n === 1 ? 40 : 5);
        order.push(n);
      }),
    ),
  );

  assert.deepEqual(order, [1, 2, 3]);
});

test('une tache en echec ne bloque pas les suivantes', async () => {
  const queue = new SerialQueue();

  const failing = queue.run('serveur', () => Promise.reject(new Error('panne')));
  await assert.rejects(() => failing, /panne/);

  assert.equal(await queue.run('serveur', () => Promise.resolve('ok')), 'ok');
});

test('le resultat de chaque tache revient a son appelant', async () => {
  const queue = new SerialQueue();

  const results = await Promise.all([
    queue.run('serveur', async () => 'un'),
    queue.run('serveur', async () => 'deux'),
  ]);

  assert.deepEqual(results, ['un', 'deux']);
});
