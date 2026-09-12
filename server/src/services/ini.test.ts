import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addEntry,
  applyChanges,
  getValue,
  getValues,
  parseIni,
  removeEntry,
  serializeIni,
  setValue,
  toDocument,
} from './ini.js';

const SAMPLE = [
  '[/Script/ShooterGame.ShooterGameMode]',
  '; Multiplicateurs de recolte (commentaire = avec un signe egal)',
  'HarvestAmountMultiplier=3.0',
  'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramHidden=false)',
  'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_StoneHatchet_C",EngramHidden=true)',
  'PerLevelStatsMultiplier_Player[0]=1.5',
  '',
  '[/Script/Engine.GameSession]',
  'MaxPlayers=70',
  '',
].join('\r\n');

test('un aller-retour sans modification restitue le texte a l identique', () => {
  const file = parseIni(SAMPLE);
  assert.equal(serializeIni(file), SAMPLE);
});

test('les fins de ligne LF sont preservees', () => {
  const text = '[A]\nKey=1\n';
  const file = parseIni(text);
  assert.equal(file.eol, '\n');
  assert.equal(serializeIni(file), text);
});

test('un fichier sans fin de ligne finale le reste', () => {
  const text = '[A]\nKey=1';
  assert.equal(serializeIni(parseIni(text)), text);
});

test('les cles dupliquees sont toutes conservees', () => {
  const file = parseIni(SAMPLE);
  const values = getValues(file, '/Script/ShooterGame.ShooterGameMode', 'OverrideNamedEngramEntries');

  assert.equal(values.length, 2);
  assert.match(values[0]!, /Campfire/);
  assert.match(values[1]!, /StoneHatchet/);
});

test('un commentaire contenant un signe egal n est pas lu comme une entree', () => {
  const file = parseIni(SAMPLE);
  const doc = toDocument(file, 'Game.ini', false);
  const section = doc.sections.find((s) => s.name === '/Script/ShooterGame.ShooterGameMode')!;

  assert.ok(!section.entries.some((entry) => entry.key.startsWith(';')));
  assert.equal(section.entries.length, 4);
});

test('les valeurs contenant des signes egal ne sont pas tronquees', () => {
  const file = parseIni(SAMPLE);
  const value = getValue(file, '/Script/ShooterGame.ShooterGameMode', 'OverrideNamedEngramEntries', 0);

  assert.equal(value, '(EngramClassName="EngramEntry_Campfire_C",EngramHidden=false)');
});

test('setValue ne modifie que l occurrence visee', () => {
  const file = parseIni(SAMPLE);
  setValue(file, '/Script/ShooterGame.ShooterGameMode', 'OverrideNamedEngramEntries', 1, '(Modifie)');

  const values = getValues(file, '/Script/ShooterGame.ShooterGameMode', 'OverrideNamedEngramEntries');
  assert.match(values[0]!, /Campfire/);
  assert.equal(values[1], '(Modifie)');
});

test('une cle indicee est adressable', () => {
  const file = parseIni(SAMPLE);
  assert.equal(getValue(file, '/Script/ShooterGame.ShooterGameMode', 'PerLevelStatsMultiplier_Player[0]'), '1.5');
});

test('removeEntry retire la bonne ligne et laisse le reste intact', () => {
  const file = parseIni(SAMPLE);
  removeEntry(file, '/Script/ShooterGame.ShooterGameMode', 'OverrideNamedEngramEntries', 0);

  const values = getValues(file, '/Script/ShooterGame.ShooterGameMode', 'OverrideNamedEngramEntries');
  assert.equal(values.length, 1);
  assert.match(values[0]!, /StoneHatchet/);
  assert.match(serializeIni(file), /HarvestAmountMultiplier=3\.0/);
});

test('addEntry insere dans la section existante, avant la section suivante', () => {
  const file = parseIni(SAMPLE);
  addEntry(file, '/Script/ShooterGame.ShooterGameMode', 'TamingSpeedMultiplier', '5.0');

  const text = serializeIni(file);
  const inserted = text.indexOf('TamingSpeedMultiplier');
  const nextSection = text.indexOf('[/Script/Engine.GameSession]');

  assert.ok(inserted > 0 && inserted < nextSection);
  // La ligne vide qui separait les deux sections doit rester une separation
  assert.match(text, /PerLevelStatsMultiplier_Player\[0\]=1\.5\r\nTamingSpeedMultiplier=5\.0\r\n\r\n\[/);
});

test('addEntry cree la section absente', () => {
  const file = parseIni(SAMPLE);
  addEntry(file, '/Script/ShooterGame.ShooterGameUserSettings', 'NewKey', '1');

  const text = serializeIni(file);
  assert.match(text, /\[\/Script\/ShooterGame\.ShooterGameUserSettings\]\r\nNewKey=1/);
});

test('applyChanges combine mise a jour, suppression et ajout', () => {
  const file = parseIni(SAMPLE);

  applyChanges(
    file,
    [
      { section: '/Script/Engine.GameSession', key: 'MaxPlayers', occurrence: 0, value: '100' },
      { section: '/Script/ShooterGame.ShooterGameMode', key: 'OverrideNamedEngramEntries', occurrence: 0, value: null },
    ],
    [{ section: '/Script/ShooterGame.ShooterGameMode', key: 'XPMultiplier', value: '2.0' }],
  );

  assert.equal(getValue(file, '/Script/Engine.GameSession', 'MaxPlayers'), '100');
  assert.equal(getValues(file, '/Script/ShooterGame.ShooterGameMode', 'OverrideNamedEngramEntries').length, 1);
  assert.equal(getValue(file, '/Script/ShooterGame.ShooterGameMode', 'XPMultiplier'), '2.0');
});

test('applyChanges supprime les occurrences hautes sans decaler les basses', () => {
  const text = ['[S]', 'K=a', 'K=b', 'K=c', ''].join('\r\n');
  const file = parseIni(text);

  applyChanges(file, [
    { section: 'S', key: 'K', occurrence: 0, value: null },
    { section: 'S', key: 'K', occurrence: 2, value: null },
  ]);

  assert.deepEqual(getValues(file, 'S', 'K'), ['b']);
});

test('modifier une cle absente l ajoute au lieu d echouer en silence', () => {
  const file = parseIni(SAMPLE);
  applyChanges(file, [
    { section: '/Script/Engine.GameSession', key: 'AbsenteJusquIci', occurrence: 0, value: '42' },
  ]);

  assert.equal(getValue(file, '/Script/Engine.GameSession', 'AbsenteJusquIci'), '42');
});

test('toDocument numerote les occurrences par section', () => {
  const file = parseIni(SAMPLE);
  const doc = toDocument(file, 'Game.ini', true);
  const section = doc.sections.find((s) => s.name === '/Script/ShooterGame.ShooterGameMode')!;
  const engrams = section.entries.filter((entry) => entry.key === 'OverrideNamedEngramEntries');

  assert.deepEqual(engrams.map((entry) => entry.occurrence), [0, 1]);
  assert.equal(doc.pendingChanges, true);
});

test('une entree placee avant toute section est rattachee a la section vide', () => {
  const file = parseIni('Orpheline=1\r\n[S]\r\nK=2\r\n');
  assert.equal(getValue(file, '', 'Orpheline'), '1');
  assert.equal(serializeIni(file), 'Orpheline=1\r\n[S]\r\nK=2\r\n');
});
