import fs from 'node:fs/promises';
import path from 'node:path';

import type { CustomItem, GameItem } from '../../../shared/types.js';
import { dataDir } from './paths.js';

/**
 * Objets ajoutes a la main, par profil.
 *
 * Le catalogue du jeu ne connait que le `MasterItemList` de base : un mod qui
 * remplace les donnees de jeu y reste invisible. Ces entrees comblent ce
 * manque, et se comportent ensuite comme n'importe quel objet du catalogue.
 */

type Store = Record<string, CustomItem[]>;

let cache: Store | null = null;

function storeFile(): string {
  return path.join(dataDir(), 'custom-items.json');
}

async function readAll(): Promise<Store> {
  if (cache) return cache;

  try {
    cache = JSON.parse(await fs.readFile(storeFile(), 'utf8')) as Store;
  } catch {
    cache = {};
  }

  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;

  const target = storeFile();
  const temp = `${target}.tmp`;

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temp, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  await fs.rename(temp, target);
}

export async function listCustomItems(profileId: string): Promise<CustomItem[]> {
  return (await readAll())[profileId] ?? [];
}

/**
 * \brief Ajoute un objet, en refusant ce que la remise ne saurait traiter.
 *
 * Les arguments de la commande du plugin sont separes par des espaces : un
 * chemin en contenant casserait l'analyse cote serveur de jeu.
 */
export async function addCustomItem(profileId: string, input: Partial<CustomItem>): Promise<CustomItem[]> {
  const blueprint = String(input.blueprint ?? '').trim();
  if (!blueprint) throw new Error("Le chemin de l'objet est obligatoire");
  if (/\s/.test(blueprint)) throw new Error("Le chemin ne doit contenir aucune espace");

  const store = await readAll();
  const items = store[profileId] ?? [];

  if (items.some((item) => item.blueprint === blueprint)) {
    throw new Error('Cet objet est deja dans la liste');
  }

  const name = String(input.name ?? '').trim() || shortClass(blueprint);
  const type = Number.isFinite(Number(input.type)) ? Number(input.type) : -1;

  items.push({ name, blueprint, type });
  store[profileId] = items;

  await persist();
  return items;
}

export async function removeCustomItem(profileId: string, blueprint: string): Promise<CustomItem[]> {
  const store = await readAll();
  const items = (store[profileId] ?? []).filter((item) => item.blueprint !== blueprint);
  store[profileId] = items;

  await persist();
  return items;
}

/**
 * Convertit en entrees de catalogue.
 *
 * Les index sont negatifs : ceux du `MasterItemList` sont des positions reelles
 * dans la liste du jeu, et les faire se croiser melangerait les selections.
 */
export function asCatalogEntries(items: CustomItem[]): GameItem[] {
  return items.map((item, index) => ({
    index: -(index + 1),
    name: item.name,
    blueprint: item.blueprint,
    type: item.type,
  }));
}

function shortClass(blueprint: string): string {
  const dot = blueprint.lastIndexOf('.');
  if (dot === -1) return blueprint;
  return blueprint.slice(dot + 1).replace(/'$/, '');
}
