import type { GameItem } from '../../shared/types.js';

/**
 * Classement des objets du jeu, partage par les ecrans qui en manipulent.
 *
 * Extrait pour que la remise d'objets et les plafonds de pile parlent le meme
 * langage : deux copies de ces regles auraient diverge des la premiere retouche,
 * et un objet aurait pu changer de categorie selon l'ecran.
 */

/** EPrimalItemType, la classification du jeu lui-meme */
export const TYPE_LABELS: Record<number, string> = {
  0: 'Consommables',
  1: 'Equipement',
  2: 'Armes',
  3: 'Munitions',
  4: 'Structures',
  5: 'Ressources',
  6: 'Cosmetiques',
  7: "Accessoires d'arme",
  8: 'Artefacts',
};

/** Dernier segment du chemin de blueprint, sans l'apostrophe finale */
export function shortClass(blueprint: string): string {
  const dot = blueprint.lastIndexOf('.');
  if (dot === -1) return blueprint;
  return blueprint.slice(dot + 1).replace(/'$/, '');
}

/**
 * Le nom de classe qu'attend ARK dans ses fichiers de configuration.
 *
 * `Blueprint'/Game/.../PrimalItemResource_Wood.PrimalItemResource_Wood'` devient
 * `PrimalItemResource_Wood_C`.
 */
export function classNameFromBlueprint(blueprint: string): string {
  const tail = shortClass(blueprint);
  return tail.endsWith('_C') ? tail : `${tail}_C`;
}

/**
 * Categorie affichee.
 *
 * Le type du jeu sert de base, mais il est grossier : selles, oeufs et
 * teintures y tombent dans les memes cases. Le nom de classe permet de les
 * distinguer, et il ne depend pas de la langue du serveur contrairement au nom
 * affiche.
 */
export function categoryOf(item: GameItem): string {
  // Les objets d'un mod forment leur propre categorie : les noyer parmi ceux du
  // jeu rendrait impossible de retrouver ce qu'un mod apporte
  if (item.mod) return `Mod — ${item.mod}`;

  const cls = shortClass(item.blueprint);

  if (/Saddle/i.test(cls)) return 'Selles';
  if (/Costume|Skin_/i.test(cls)) return 'Cosmetiques';
  if (/Dye/i.test(cls)) return 'Teintures';
  if (/Egg/i.test(cls)) return 'Oeufs';
  if (/Artifact/i.test(cls)) return 'Artefacts';
  if (/Trophy/i.test(cls)) return 'Trophees';
  if (/Armor/i.test(cls)) return 'Armures';

  return TYPE_LABELS[item.type] ?? 'Divers';
}
