import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

import { registerJsonBodyParser } from './jsonBody.js';

async function buildApp(withParser: boolean) {
  const app = Fastify();
  if (withParser) registerJsonBodyParser(app);

  app.post('/action', async (request) => ({ recu: request.body ?? null }));
  await app.ready();

  return app;
}

test('sans le parseur, un corps vide annonce en JSON echoue en 400', async () => {
  // Comportement par defaut de Fastify, a l'origine du "Bad Request" cote interface
  const app = await buildApp(false);

  const response = await app.inject({
    method: 'POST',
    url: '/action',
    headers: { 'content-type': 'application/json' },
  });

  assert.equal(response.statusCode, 400);
  await app.close();
});

test('avec le parseur, un corps vide devient un objet vide', async () => {
  const app = await buildApp(true);

  const response = await app.inject({
    method: 'POST',
    url: '/action',
    headers: { 'content-type': 'application/json' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { recu: {} });
  await app.close();
});

test('un corps compose uniquement d espaces est traite comme vide', async () => {
  const app = await buildApp(true);

  const response = await app.inject({
    method: 'POST',
    url: '/action',
    headers: { 'content-type': 'application/json' },
    payload: '   ',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { recu: {} });
  await app.close();
});

test('un corps JSON valide reste correctement analyse', async () => {
  const app = await buildApp(true);

  const response = await app.inject({
    method: 'POST',
    url: '/action',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ immediate: true, reason: 'test' }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { recu: { immediate: true, reason: 'test' } });
  await app.close();
});

test('un corps JSON invalide est toujours rejete en 400', async () => {
  const app = await buildApp(true);

  const response = await app.inject({
    method: 'POST',
    url: '/action',
    headers: { 'content-type': 'application/json' },
    payload: '{ ceci nest pas du json',
  });

  assert.equal(response.statusCode, 400);
  await app.close();
});

test('une requete sans en-tete de type reste acceptee', async () => {
  const app = await buildApp(true);

  const response = await app.inject({ method: 'POST', url: '/action' });

  assert.equal(response.statusCode, 200);
  await app.close();
});
