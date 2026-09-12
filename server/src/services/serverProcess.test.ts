import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeServerLogIssue, shouldGiveUpWaiting } from './serverProcess.js';

const OPTIONS = { quietMs: 90_000, maxMs: 900_000 };

/**
 * Regression mesuree sur un serveur reel : apres « Closing by request »,
 * l'extinction d'ARK a mis 1 min 43 rien que pour atteindre la fermeture de son
 * rapporteur d'erreurs. Le plafond fixe de 2 minutes tuait donc le processus a
 * quelques secondes de la fin, alors qu'il ecrivait encore dans son journal.
 */
test('un serveur lent mais actif depuis 3 minutes continue d etre attendu', () => {
  const started = 0;
  const now = 180_000;
  const lastActivity = 178_000; // le journal vient de s ecrire

  assert.equal(shouldGiveUpWaiting(now, started, lastActivity, OPTIONS), false);
});

test('un serveur silencieux au-dela du delai est abandonne', () => {
  assert.equal(shouldGiveUpWaiting(200_000, 0, 100_000, OPTIONS), true);
});

test('le silence se compte depuis la derniere activite, pas depuis le debut', () => {
  // Trois minutes ecoulees, mais une ecriture il y a dix secondes
  assert.equal(shouldGiveUpWaiting(180_000, 0, 170_000, OPTIONS), false);
});

test('le plafond absolu prime sur une activite continue', () => {
  // Un journal bavard ne doit pas faire attendre indefiniment
  assert.equal(shouldGiveUpWaiting(1_000_000, 0, 999_000, OPTIONS), true);
});

test('sans plafond, seule l inactivite decide', () => {
  const noCeiling = { quietMs: 90_000 };
  assert.equal(shouldGiveUpWaiting(10_000_000, 0, 9_999_000, noCeiling), false);
});

test('le delai exact n est pas encore un abandon', () => {
  assert.equal(shouldGiveUpWaiting(90_000, 0, 0, OPTIONS), false);
  assert.equal(shouldGiveUpWaiting(90_001, 0, 0, OPTIONS), true);
});

/**
 * Lignes relevees telles quelles dans le journal du serveur de test, lors des
 * deux refus successifs : un identifiant absent du catalogue, puis un projet
 * existant mais sans fichier publie.
 */
test('un mod sans fichier publie est annonce avec son nom et son numero', () => {
  const ligne =
    '[2026.08.13-11.35.09:973][ 13]LogCFCore: Error: Detected an unavailable mod: AsaQoL UI (1650813)! Ensuring mod is deleted ...';

  const message = describeServerLogIssue(ligne);
  assert.ok(message);
  assert.match(message, /AsaQoL UI/);
  assert.match(message, /1650813/);
  assert.match(message, /CurseForge/);
});

test('un identifiant inconnu du catalogue est annonce', () => {
  const ligne =
    '[2026.08.13-08.52.54:910][  8]LogCFCore: Error: Error querying server mods: Failed to send request to server with error: 404';

  const message = describeServerLogIssue(ligne);
  assert.ok(message);
  assert.match(message, /catalogue/);
});

test('une ligne de journal ordinaire ne declenche aucune annonce', () => {
  assert.equal(describeServerLogIssue('[2026.08.13-08.52.54:631][  0]LogCFCore: SetSettings called:'), null);
  assert.equal(describeServerLogIssue('LogCFCore: Warning: Couldn t load mods library from disk'), null);
  assert.equal(describeServerLogIssue(''), null);
});

test('un nom de mod contenant des espaces et des parentheses reste lisible', () => {
  const message = describeServerLogIssue('LogCFCore: Error: Detected an unavailable mod: Super Structures (V3) (731604)!');
  assert.ok(message);
  assert.match(message, /Super Structures \(V3\)/);
  assert.match(message, /731604/);
});
