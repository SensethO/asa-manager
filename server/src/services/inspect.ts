import type {
  ContainerInfo,
  DinoCensus,
  DinoFilter,
  PlayerContainers,
  PlayerDetail,
  PlayerInventory,
  PlayerStructures,
  ServerProfile,
  WorldPosition,
} from '../../../shared/types.js';
import { hasAsaApi } from './paths.js';
import { exec } from './serverProcess.js';

/**
 * Inspection detaillee des joueurs.
 *
 * Le RCON natif d'ARK ne sait que lister les joueurs connectes : ni position,
 * ni inventaire, ni constructions. Ces informations viennent donc du plugin
 * AsaQoL, qui les renvoie en JSON. Sans le plugin, les fonctions ci-dessous
 * l'indiquent explicitement plutot que de renvoyer des donnees vides.
 */

export class InspectUnavailable extends Error {
  constructor(message = "Le plugin AsaQoL n'est pas disponible sur ce serveur") {
    super(message);
  }
}

/**
 * Execute une commande du plugin et analyse sa reponse JSON.
 *
 * ARK repond « Server received, But no response!! » aux commandes qu'il ne
 * connait pas : cette phrase n'etant pas du JSON, l'analyse echoue et signale
 * l'absence du plugin sans laisser croire a un serveur vide.
 */
export async function pluginJson<T>(profile: ServerProfile, command: string): Promise<T> {
  if (!hasAsaApi(profile)) throw new InspectUnavailable();

  return parsePluginResponse<T>((await exec(profile, command)).trim());
}

/**
 * rief Analyse la reponse d'une commande du plugin.
 *
 * Isolee pour etre eprouvee : c'est ici qu'un defaut a fait passer des remises
 * reussies pour des echecs.
 */
export function parsePluginResponse<T>(response: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    throw new InspectUnavailable(
      "Le plugin AsaQoL n'a pas repondu. Verifiez son chargement dans le journal d'AsaApi.",
    );
  }

  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    // C'est la valeur qui fait foi, jamais la seule presence de la cle :
    // certaines reponses la portent systematiquement, vide en cas de succes.
    // Se fier a sa presence transformait chaque remise reussie en erreur au
    // message vide, donc en « Erreur HTTP 400 » sans explication.
    const detail = String((parsed as { error: unknown }).error ?? '').trim();
    if (detail) throw new Error(detail);
  }

  return parsed as T;
}

interface RawPosition {
  x?: number;
  y?: number;
  z?: number;
  lat?: number;
  lon?: number;
}

function toPosition(raw: RawPosition | undefined): WorldPosition | null {
  if (!raw || raw.x === undefined || raw.lat === undefined) return null;

  return {
    x: raw.x,
    y: raw.y ?? 0,
    z: raw.z ?? 0,
    lat: raw.lat,
    lon: raw.lon ?? 0,
  };
}

export async function listPlayerDetails(profile: ServerProfile): Promise<PlayerDetail[]> {
  const payload = await pluginJson<{ players: (PlayerDetail & RawPosition)[] }>(profile, 'qol.players');

  return (payload.players ?? []).map((player) => ({
    index: player.index,
    name: player.name,
    platformName: player.platformName,
    eosId: player.eosId,
    playerId: player.playerId,
    tribeId: player.tribeId,
    dead: player.dead,
    riding: player.riding,
    position: toPosition(player),
  }));
}

/** Les identifiants EOS sont hexadecimaux : tout le reste est refuse avant d'atteindre le RCON */
function assertEosId(eosId: string): void {
  if (!/^[0-9a-f]{16,64}$/i.test(eosId)) {
    throw new Error('Identifiant EOS invalide');
  }
}

export async function playerInventory(profile: ServerProfile, eosId: string): Promise<PlayerInventory> {
  assertEosId(eosId);
  return pluginJson<PlayerInventory>(profile, `qol.inventory ${eosId}`);
}

export interface DinoQuery {
  filter: DinoFilter;
  species: string;
  minLevel: number;
  radius: number;
  offset: number;
  limit: number;
}

/**
 * Recense les creatures de la carte.
 *
 * Le filtrage par espece et par niveau est fait cote serveur de jeu : une carte
 * peuplee compte plusieurs dizaines de milliers de creatures, et tout rapatrier
 * pour filtrer ici prendrait plusieurs minutes.
 */
export async function listDinos(profile: ServerProfile, query: DinoQuery): Promise<DinoCensus> {
  const parts = [
    `filter=${query.filter}`,
    `radius=${Math.round(query.radius)}`,
    `offset=${Math.max(0, Math.round(query.offset))}`,
    `limit=${Math.max(1, Math.round(query.limit))}`,
  ];

  if (query.minLevel > 0) parts.push(`minlevel=${Math.round(query.minLevel)}`);

  // Les arguments sont separes par des espaces : un critere en contenant
  // casserait l'analyse cote plugin
  const species = query.species.trim().replace(/\s+/g, '');
  if (species) parts.push(`species=${species}`);

  const payload = await pluginJson<{
    filter: DinoFilter;
    radius: number;
    matched: number;
    offset: number;
    returned: number;
    truncated: boolean;
    dinos: { s: string; n: string; t: boolean; l: number; lb: number; f: boolean; g: number; lat: number; lon: number }[];
  }>(profile, `qol.dinos ${parts.join(' ')}`);

  return {
    filter: payload.filter,
    radius: payload.radius,
    matched: payload.matched,
    offset: payload.offset,
    returned: payload.returned,
    truncated: payload.truncated,
    dinos: (payload.dinos ?? []).map((raw) => ({
      species: raw.s,
      name: raw.n,
      tamed: raw.t,
      level: raw.l,
      baseLevel: raw.lb,
      female: raw.f,
      tribeId: raw.g,
      lat: raw.lat,
      lon: raw.lon,
    })),
  };
}

export async function playerContainers(
  profile: ServerProfile,
  eosId: string,
  radius: number,
): Promise<PlayerContainers> {
  assertEosId(eosId);

  const safeRadius = Number.isFinite(radius) && radius > 0 ? Math.min(radius, 500_000) : 30_000;
  const payload = await pluginJson<
    Omit<PlayerContainers, 'containers' | 'center'> & {
      center: RawPosition;
      containers: (RawPosition & Omit<ContainerInfo, 'position'>)[];
    }
  >(profile, `qol.containers ${eosId} ${Math.round(safeRadius)}`);

  return {
    ...payload,
    center: toPosition(payload.center) ?? { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
    containers: (payload.containers ?? []).map((container) => ({
      kind: container.kind,
      name: container.name,
      itemCount: container.itemCount,
      returned: container.returned,
      items: container.items,
      position: toPosition(container) ?? { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
    })),
  };
}

export async function playerStructures(
  profile: ServerProfile,
  eosId: string,
  radius: number,
): Promise<PlayerStructures> {
  assertEosId(eosId);

  const safeRadius = Number.isFinite(radius) && radius > 0 ? Math.min(radius, 500_000) : 30_000;
  const payload = await pluginJson<
    Omit<PlayerStructures, 'structures' | 'center'> & {
      center: RawPosition;
      structures: (RawPosition & { name: string })[];
    }
  >(profile, `qol.structures ${eosId} ${Math.round(safeRadius)}`);

  return {
    ...payload,
    center: toPosition(payload.center) ?? { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
    structures: (payload.structures ?? []).map((structure) => ({
      name: structure.name,
      position: toPosition(structure) ?? { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
    })),
  };
}

/**
 * Valeurs reellement appliquees par le serveur.
 *
 * Une cle ecrite dans la mauvaise section d'un .ini est ignoree sans message :
 * la configuration parait juste et n'a aucun effet. Lire la valeur vivante
 * transforme cette supposition en fait observable — c'est la seule facon de
 * savoir si un reglage a pris.
 */
export async function readGameModeSettings(
  profile: ServerProfile,
): Promise<Record<string, number | boolean>> {
  const payload = await pluginJson<{ settings: Record<string, number | boolean> }>(
    profile,
    'qol.gamemode',
  );
  return payload.settings ?? {};
}
