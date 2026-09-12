import type {
  GameItem,
  GiveItemRequest,
  GiveItemResult,
  ItemCatalog,
  ServerProfile,
} from '../../../shared/types.js';
import { asCatalogEntries, listCustomItems } from './customItems.js';
import { listModItems } from './modItems.js';
import { InspectUnavailable, pluginJson } from './inspect.js';

/**
 * Catalogue des objets et remise en jeu.
 *
 * La liste vient du `MasterItemList` du jeu, lu par le plugin : elle suit donc
 * la version installee et inclut les objets des mods, ce qu'une liste ecrite a
 * la main ne saurait faire.
 */

/** Une page plus large echouerait au transport RCON, les chemins etant longs */
const MAX_PAGE = 300;

/**
 * Catalogue complet, garde en memoire par profil.
 *
 * Le contenu ne change qu'au redemarrage du serveur — c'est alors que le jeu et
 * ses mods sont recharges — mais chaque lecture coute plusieurs allers-retours
 * RCON, et ARK recopie ces reponses dans son journal : une centaine de
 * kilo-octets noyaient les lignes utiles a chaque ouverture d'un joueur.
 */
const catalogs = new Map<string, GameItem[]>();

/** Appele au demarrage d'un serveur : le catalogue peut avoir change */
export function forgetItemCatalog(profileId: string): void {
  catalogs.delete(profileId);
}

/** Lit une page aupres du plugin */
async function fetchPage(
  profile: ServerProfile,
  offset: number,
  limit: number,
): Promise<{ items: GameItem[]; matched: number; source: string }> {
  const payload = await pluginJson<{
    source?: string;
    total?: number;
    matched?: number;
    offset?: number;
    returned?: number;
    truncated?: boolean;
    error?: string;
    items?: { i: number; n: string; p: string; t?: number }[];
  }>(profile, `qol.items offset=${offset} limit=${limit}`);

  if (payload.error) throw new InspectUnavailable(payload.error);

  return {
    matched: payload.matched ?? 0,
    source: payload.source ?? '',
    items: (payload.items ?? []).map((item) => ({
      index: item.i,
      name: item.n,
      blueprint: item.p,
      type: item.t ?? -1,
    })),
  };
}

/**
 * Charge le catalogue entier, une seule fois par demarrage de serveur.
 *
 * Trois sources sont fusionnees : les objets saisis a la main, ceux deduits des
 * mods installes, et le `MasterItemList` du jeu. Les deux premieres existent
 * parce que ce dernier ne contient que le contenu de base.
 */
async function loadCatalog(profile: ServerProfile): Promise<GameItem[]> {
  const cached = catalogs.get(profile.id);
  if (cached) return cached;

  const collected: GameItem[] = [];
  let offset = 0;

  // Borne dure : un plugin qui renverrait toujours des pages pleines ne doit
  // pas faire tourner cette boucle indefiniment
  for (let page = 0; page < 40; page++) {
    const batch = await fetchPage(profile, offset, MAX_PAGE);
    collected.push(...batch.items);

    offset += batch.items.length;
    if (batch.items.length === 0 || offset >= batch.matched) break;
  }

  const merged = [
    ...asCatalogEntries(await listCustomItems(profile.id)),
    ...(await listModItems(profile)),
    ...collected,
  ];

  catalogs.set(profile.id, merged);
  return merged;
}

export async function listItems(
  profile: ServerProfile,
  query: { search: string; offset: number; limit: number; refresh?: boolean },
): Promise<ItemCatalog> {
  if (query.refresh) forgetItemCatalog(profile.id);

  const all = await loadCatalog(profile);

  // La recherche est appliquee ici, sur le catalogue deja en memoire : elle ne
  // coute plus aucun aller-retour vers le serveur de jeu
  const term = query.search.trim().toLowerCase();
  const matching = term
    ? all.filter(
        (item) =>
          item.name.toLowerCase().includes(term) || item.blueprint.toLowerCase().includes(term),
      )
    : all;

  const offset = Math.max(0, Math.round(query.offset));
  const limit = Math.min(MAX_PAGE, Math.max(1, Math.round(query.limit)));
  const page = matching.slice(offset, offset + limit);

  return {
    source: 'MasterItemList',
    total: all.length,
    matched: matching.length,
    offset,
    returned: page.length,
    truncated: offset + page.length < matching.length,
    items: page,
  };
}

/**
 * Remet un objet a un joueur connecte.
 *
 * Un echec est renvoye tel quel plutot que leve : « inventaire plein » ou
 * « chemin invalide » sont des reponses normales du jeu, pas des pannes du
 * gestionnaire, et l'interface doit pouvoir les afficher sans alarmer.
 */
export async function giveItem(
  profile: ServerProfile,
  eosId: string,
  request: GiveItemRequest,
): Promise<GiveItemResult> {
  if (!/^[0-9a-f]{16,64}$/i.test(eosId)) throw new Error('Identifiant EOS invalide');

  const blueprint = request.blueprint.trim();
  if (!blueprint || /\s/.test(blueprint)) {
    throw new Error("Chemin d'objet invalide : il ne doit contenir aucune espace");
  }

  const quantity = Math.min(10_000, Math.max(1, Math.round(request.quantity)));
  const quality = Math.min(100, Math.max(0, Number(request.quality) || 0));
  const asBlueprint = request.asBlueprint ? 1 : 0;

  const payload = await pluginJson<{
    given: boolean;
    eosId: string;
    blueprint: string;
    quantity: number;
    quality: number;
    blueprintItem: boolean;
    error?: string;
  }>(profile, `qol.give ${eosId} ${blueprint} ${quantity} ${quality} ${asBlueprint}`);

  return {
    given: payload.given,
    eosId: payload.eosId,
    blueprint: payload.blueprint,
    quantity: payload.quantity,
    quality: payload.quality,
    asBlueprint: payload.blueprintItem,
    error: payload.error ?? '',
  };
}
