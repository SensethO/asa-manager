import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  GiveItemRequest,
  KnownPlayer,
  PendingDelivery,
  PlayerInfo,
  ServerProfile,
} from '../../../shared/types.js';
import { bus } from './events.js';
import { dataDir } from './paths.js';

/**
 * Registre des joueurs et remises differees.
 *
 * Le plugin ne connait que les joueurs presents : des qu'un joueur se
 * deconnecte, il disparait. Ce registre garde leur trace, et permet de leur
 * destiner des objets qu'ils recevront a leur retour.
 */

interface StoredPlayer {
  eosId: string;
  name: string;
  firstSeen: string;
  lastSeen: string;
  sessions: number;
}

interface ProfileRoster {
  players: Record<string, StoredPlayer>;
  pending: Record<string, PendingDelivery[]>;
}

type Store = Record<string, ProfileRoster>;

let cache: Store | null = null;

function rosterFile(): string {
  return path.join(dataDir(), 'roster.json');
}

async function readAll(): Promise<Store> {
  if (cache) return cache;

  try {
    cache = JSON.parse(await fs.readFile(rosterFile(), 'utf8')) as Store;
  } catch {
    // Absent ou illisible : on repart d'un registre vide plutot que d'empecher
    // le gestionnaire de demarrer pour un fichier accessoire
    cache = {};
  }

  return cache;
}

/** Ecriture par fichier temporaire : une coupure ne peut pas tronquer le registre */
async function persist(): Promise<void> {
  if (!cache) return;

  const target = rosterFile();
  const temp = `${target}.tmp`;

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temp, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  await fs.rename(temp, target);
}

function rosterOf(store: Store, profileId: string): ProfileRoster {
  const existing = store[profileId];
  if (existing) return existing;

  const created: ProfileRoster = { players: {}, pending: {} };
  store[profileId] = created;
  return created;
}

/** Identifiants actuellement en ligne, par profil */
const online = new Map<string, Set<string>>();

/**
 * \brief Enregistre les joueurs vus, et signale ceux qui viennent d'arriver.
 * \return les identifiants EOS apparus depuis le dernier passage.
 */
export async function recordSeen(profileId: string, players: PlayerInfo[]): Promise<string[]> {
  const store = await readAll();
  const roster = rosterOf(store, profileId);
  const now = new Date().toISOString();

  const previous = online.get(profileId) ?? new Set<string>();
  const current = new Set(players.map((player) => player.id).filter(Boolean));
  const arrived: string[] = [];

  for (const player of players) {
    if (!player.id) continue;

    const known = roster.players[player.id];
    if (known) {
      known.lastSeen = now;
      // Le nom peut changer : c'est le dernier connu qui compte
      if (player.name) known.name = player.name;
      if (!previous.has(player.id)) known.sessions += 1;
    } else {
      roster.players[player.id] = {
        eosId: player.id,
        name: player.name,
        firstSeen: now,
        lastSeen: now,
        sessions: 1,
      };
    }

    if (!previous.has(player.id)) arrived.push(player.id);
  }

  online.set(profileId, current);
  await persist();

  return arrived;
}

/** Registre complet d'un profil, joueurs en ligne signales comme tels */
export async function listKnownPlayers(profileId: string): Promise<KnownPlayer[]> {
  const store = await readAll();
  const roster = rosterOf(store, profileId);
  const connected = online.get(profileId) ?? new Set<string>();

  return Object.values(roster.players)
    .map((player) => ({
      ...player,
      online: connected.has(player.eosId),
      pending: roster.pending[player.eosId]?.length ?? 0,
    }))
    .sort((left, right) => right.lastSeen.localeCompare(left.lastSeen));
}

export async function listPending(profileId: string, eosId: string): Promise<PendingDelivery[]> {
  const store = await readAll();
  return rosterOf(store, profileId).pending[eosId] ?? [];
}

/** Ajoute des objets a remettre a la prochaine connexion */
export async function queueDeliveries(
  profileId: string,
  eosId: string,
  items: (GiveItemRequest & { name: string })[],
): Promise<PendingDelivery[]> {
  const store = await readAll();
  const roster = rosterOf(store, profileId);
  const queuedAt = new Date().toISOString();

  const queue = roster.pending[eosId] ?? [];
  queue.push(...items.map((item) => ({ ...item, queuedAt })));
  roster.pending[eosId] = queue;

  await persist();
  return queue;
}

export async function clearPending(profileId: string, eosId: string): Promise<void> {
  const store = await readAll();
  delete rosterOf(store, profileId).pending[eosId];
  await persist();
}

/**
 * \brief Remet les objets en attente a un joueur qui vient de se connecter.
 *
 * Les echecs restent en file : un inventaire plein a l'arrivee ne doit pas
 * faire disparaitre ce qui etait promis. Seul ce qui a effectivement ete remis
 * est retire.
 */
export async function deliverPending(profile: ServerProfile, eosId: string): Promise<void> {
  const store = await readAll();
  const roster = rosterOf(store, profile.id);
  const queue = roster.pending[eosId];
  if (!queue || queue.length === 0) return;

  // Import differe : items.ts passe par serverProcess.ts, qui appelle ce
  // module. Le charger a la demande evite un cycle au chargement.
  const { giveItem } = await import('./items.js');

  const remaining: PendingDelivery[] = [];
  let delivered = 0;

  for (const item of queue) {
    try {
      const result = await giveItem(profile, eosId, item);
      if (result.given) delivered += 1;
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }

  if (remaining.length > 0) roster.pending[eosId] = remaining;
  else delete roster.pending[eosId];

  await persist();

  const who = roster.players[eosId]?.name ?? eosId;
  if (delivered > 0) {
    bus.log(profile.id, 'manager', `${delivered} objet(s) en attente remis a ${who} a sa connexion.`);
  }
  if (remaining.length > 0) {
    bus.log(
      profile.id,
      'manager',
      `${remaining.length} objet(s) n'ont pu etre remis a ${who} et restent en attente.`,
      'warn',
    );
  }
}
