import fs from 'node:fs/promises';
import path from 'node:path';

import type { GameItem, ServerProfile } from '../../../shared/types.js';

/**
 * Objets apportes par les mods installes.
 *
 * Le `MasterItemList` lu dans le jeu ne contient que le contenu de base : les
 * objets d'un mod y sont invisibles. Ils sont donc deduits des manifestes que
 * chaque mod depose a l'installation — de simples fichiers texte listant ses
 * assets.
 */

/** Identifiant du jeu chez CurseForge, nom du dossier ou atterrissent les mods */
const GAME_FOLDER = '83374';

function modsRoot(profile: ServerProfile): string {
  return path.join(profile.installDir, 'ShooterGame', 'Binaries', 'Win64', 'ShooterGame', 'Mods', GAME_FOLDER);
}

/**
 * \brief Traduit une ligne de manifeste en chemin de blueprint.
 *
 * Un mod est monte comme un plugin : son dossier `Content` correspond a la
 * racine `/<NomDuMod>/`. Verifie sur notre propre mod, dont le singleton
 * `Content/AsaQoLSingleton.uasset` se charge bien par
 * `Blueprint'/AsaQoLUI/AsaQoLSingleton.AsaQoLSingleton'`.
 *
 * \return null si la ligne ne designe pas un objet jouable.
 */
export function blueprintFromManifestLine(line: string): { mod: string; blueprint: string; name: string } | null {
  const file = line.split('\t')[0]?.trim();
  if (!file || !file.endsWith('.uasset')) return null;

  // Les manifestes utilisent la barre oblique, mais un separateur Windows ne
  // doit pas faire echouer la lecture
  const normalised = file.split('\\').join('/');
  const match = /^ShooterGame\/Mods\/([^/]+)\/Content\/(.+)\.uasset$/.exec(normalised);
  if (!match) return null;

  const mod = match[1];
  const relative = match[2];
  if (!mod || !relative) return null;

  const asset = relative.slice(relative.lastIndexOf('/') + 1);

  // Seuls les objets d'inventaire nous interessent. Le prefixe doit etre en
  // tete : une icone nommee « MonMod_PrimalItem_Icon » n'est pas un objet.
  if (!/^PrimalItem/i.test(asset)) return null;

  return { mod, blueprint: `Blueprint'/${mod}/${relative}.${asset}'`, name: asset };
}

/** Nom lisible du mod, lu dans son descripteur */
async function friendlyName(pluginFile: string, fallback: string): Promise<string> {
  try {
    const parsed = JSON.parse(await fs.readFile(pluginFile, 'utf8')) as { FriendlyName?: string };
    return parsed.FriendlyName?.trim() || fallback;
  } catch {
    return fallback;
  }
}

/**
 * \brief Recense les objets de tous les mods installes sur ce serveur.
 *
 * Ne lit que des fichiers deja presents sur le disque : aucune requete vers le
 * serveur de jeu, donc utilisable meme a l'arret.
 */
export async function listModItems(profile: ServerProfile): Promise<GameItem[]> {
  const root = modsRoot(profile);

  let installed: string[];
  try {
    installed = (await fs.readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const items: GameItem[] = [];
  let index = -1;

  for (const folder of installed) {
    // Chaque dossier de mod contient un dossier par plugin, du nom du mod
    const modDir = path.join(root, folder);

    let inner: string[];
    try {
      inner = (await fs.readdir(modDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      continue;
    }

    for (const pluginName of inner) {
      const manifest = path.join(modDir, pluginName, 'Manifest_UFSFiles_Win64.txt');

      let content: string;
      try {
        content = await fs.readFile(manifest, 'utf8');
      } catch {
        continue;
      }

      const label = await friendlyName(path.join(modDir, pluginName, `${pluginName}.uplugin`), pluginName);
      const seen = new Set<string>();

      for (const line of content.split(/\r?\n/)) {
        const parsed = blueprintFromManifestLine(line);
        if (!parsed || seen.has(parsed.blueprint)) continue;

        seen.add(parsed.blueprint);
        items.push({
          // Index negatif : ceux du MasterItemList sont des positions reelles
          // dans la liste du jeu, les faire se croiser melangerait les selections
          index: index--,
          name: parsed.name,
          blueprint: parsed.blueprint,
          type: -1,
          mod: label,
        });
      }
    }
  }

  return items;
}
