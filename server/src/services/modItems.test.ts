import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blueprintFromManifestLine } from './modItems.js';

/**
 * Lignes relevees telles quelles dans le manifeste du mod « Awesome Spyglass! »
 * installe sur le serveur de test.
 */
test('un objet de mod devient un chemin de blueprint utilisable', () => {
  const parsed = blueprintFromManifestLine(
    'ShooterGame/Mods/AwesomeSpyglass/Content/PrimalItem_AwesomeSpyGlass.uasset\t2025-09-01T01:53:03.551Z',
  );

  assert.ok(parsed);
  assert.equal(parsed.mod, 'AwesomeSpyglass');
  assert.equal(parsed.name, 'PrimalItem_AwesomeSpyGlass');
  assert.equal(
    parsed.blueprint,
    "Blueprint'/AwesomeSpyglass/PrimalItem_AwesomeSpyGlass.PrimalItem_AwesomeSpyGlass'",
  );
});

test('un objet range dans un sous-dossier conserve son chemin', () => {
  const parsed = blueprintFromManifestLine(
    'ShooterGame/Mods/MonMod/Content/Items/Armes/PrimalItem_Epee.uasset\t2025-01-01T00:00:00.000Z',
  );

  assert.ok(parsed);
  assert.equal(parsed.blueprint, "Blueprint'/MonMod/Items/Armes/PrimalItem_Epee.PrimalItem_Epee'");
});

/**
 * Le prefixe doit etre en tete du nom : ce fichier est l'icone de l'objet, pas
 * l'objet. Le confondre remplirait le catalogue d'entrees inutilisables.
 */
test('une icone contenant PrimalItem dans son nom est ecartee', () => {
  assert.equal(
    blueprintFromManifestLine(
      'ShooterGame/Mods/AwesomeSpyglass/Content/Textures/AwesomeSpyGlass_PrimalItem_Icon.uasset\t2025-09-01T01:52:08.161Z',
    ),
    null,
  );
});

test('les assets qui ne sont pas des objets sont ecartes', () => {
  const lignes = [
    'ShooterGame/Mods/AwesomeSpyglass/Content/AwesomeSpyGlass_Buff.uasset\t2025-09-01T01:53:03.619Z',
    'ShooterGame/Mods/AwesomeSpyglass/AssetRegistry.bin\t2025-09-01T01:53:08.858Z',
    'ShooterGame/Mods/AwesomeSpyglass/Content/PrimalItem_AwesomeSpyGlass.uexp\t2025-09-01T01:53:03.551Z',
    '',
  ];

  for (const ligne of lignes) assert.equal(blueprintFromManifestLine(ligne), null);
});

test('un separateur Windows ne fait pas echouer la lecture', () => {
  // Chaine brute : une barre oblique inverse echappee dans un litteral ordinaire
  // disparaitrait, et le test ne verifierait plus rien
  const parsed = blueprintFromManifestLine(
    String.raw`ShooterGame\Mods\MonMod\Content\PrimalItem_Test.uasset` + '\t2025-01-01T00:00:00.000Z',
  );

  assert.ok(parsed);
  assert.equal(parsed.mod, 'MonMod');
});
