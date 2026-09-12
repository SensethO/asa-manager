import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evenBands, normalizedShares, sanitize } from './wildLevels.js';

test('le maximum est remonte au minimum plutot que la saisie refusee', () => {
  const settings = sanitize({ minLevel: 120, maxLevel: 50 });
  assert.equal(settings.minLevel, 120);
  assert.equal(settings.maxLevel, 120);
});

test('les niveaux sont bornes a 1 au minimum', () => {
  assert.equal(sanitize({ minLevel: 0, maxLevel: -5 }).minLevel, 1);
});

test('les bornes d une tranche sont remises dans l ordre', () => {
  const [band] = sanitize({ bands: [{ from: 130, to: 100, percent: 10 }] }).bands;
  assert.deepEqual(band, { from: 100, to: 130, percent: 10 });
});

test('une tranche de part nulle est ecartee : elle ne serait jamais tiree', () => {
  const settings = sanitize({
    bands: [
      { from: 100, to: 109, percent: 40 },
      { from: 110, to: 119, percent: 0 },
    ],
  });

  assert.equal(settings.bands.length, 1);
});

test('une tranche entierement hors des bornes est ecartee', () => {
  const settings = sanitize({
    minLevel: 100,
    maxLevel: 150,
    bands: [
      { from: 10, to: 19, percent: 50 },
      { from: 100, to: 109, percent: 50 },
    ],
  });

  assert.deepEqual(settings.bands, [{ from: 100, to: 109, percent: 50 }]);
});

test('les tranches sont triees par niveau croissant', () => {
  const settings = sanitize({
    bands: [
      { from: 120, to: 129, percent: 10 },
      { from: 100, to: 109, percent: 10 },
    ],
  });

  assert.deepEqual(
    settings.bands.map((band) => band.from),
    [100, 120],
  );
});

test('l intervalle est decoupe en tranches de 10 alignees sur les dizaines', () => {
  const bands = evenBands(100, 150);
  assert.partialDeepStrictEqual(bands[0], { from: 100, to: 109 });
  assert.partialDeepStrictEqual(bands.at(-1), { from: 150, to: 150 });
});

test('les parts generees sont egales', () => {
  const bands = evenBands(100, 139);
  assert.equal(bands.length, 4);
  assert.ok(bands.every((band) => band.percent === 25));
});

test('la premiere tranche est recalee sur le minimum demande', () => {
  const [band] = evenBands(105, 120);
  assert.partialDeepStrictEqual(band, { from: 105, to: 109 });
});

test('des parts qui ne totalisent pas 100 sont ramenees a 100', () => {
  const shares = normalizedShares([
    { from: 1, to: 10, percent: 1 },
    { from: 11, to: 20, percent: 3 },
  ]);

  assert.deepEqual(shares, [25, 75]);
});

test('aucune division par zero quand aucune part n est renseignee', () => {
  assert.deepEqual(normalizedShares([{ from: 1, to: 10, percent: 0 }]), [0]);
});
