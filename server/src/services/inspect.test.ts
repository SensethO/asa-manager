import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InspectUnavailable, parsePluginResponse } from './inspect.js';

/**
 * Regression constatee en jeu : les objets etaient bien remis, mais chaque
 * remise reussie remontait « Erreur HTTP 400 ». Le plugin joignait une cle
 * `error` vide a ses reponses de succes, et l'analyse se fiait a la presence de
 * la cle plutot qu'a sa valeur.
 */
test('une cle error vide n est pas une erreur', () => {
  const reponse = '{"given":true,"quantity":3,"error":""}';
  const parsed = parsePluginResponse<{ given: boolean; quantity: number }>(reponse);

  assert.equal(parsed.given, true);
  assert.equal(parsed.quantity, 3);
});

test('une cle error faite d espaces n est pas une erreur', () => {
  assert.doesNotThrow(() => parsePluginResponse('{"given":true,"error":"   "}'));
});

test('une cle error renseignee est bien levee, avec son texte', () => {
  assert.throws(
    () => parsePluginResponse('{"given":false,"error":"Inventaire plein"}'),
    /Inventaire plein/,
  );
});

test('une reponse absente du plugin est signalee comme telle', () => {
  // Ce que repond ARK a une commande qu'il ne connait pas
  assert.throws(
    () => parsePluginResponse('Server received, But no response!!'),
    InspectUnavailable,
  );
});

test('une reponse valide sans cle error passe telle quelle', () => {
  const parsed = parsePluginResponse<{ count: number }>('{"count":42}');
  assert.equal(parsed.count, 42);
});
