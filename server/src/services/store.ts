import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { ServerProfile } from '../../../shared/types.js';
import { bus } from './events.js';
import { dataDir, profilesFile } from './paths.js';
import { loadSettings, suggestInstallDir } from './settings.js';

export interface ProfileInput extends Partial<Omit<ServerProfile, 'id' | 'createdAt'>> {
  name: string;
  /** Facultatif : deduit du dossier par defaut de l'application si absent */
  installDir?: string;
}

function defaults(): Omit<ServerProfile, 'id' | 'name' | 'installDir' | 'createdAt'> {
  return {
    map: 'TheIsland_WP',
    sessionName: 'Serveur ASA',
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    maxPlayers: 70,
    adminPassword: '',
    serverPassword: '',
    rconEnabled: true,
    clusterId: '',
    mods: [],
    extraArgs: [],
    restart: { enabled: false, dailyTimes: ['06:00'], warningMinutes: [15, 5, 1] },
    update: { enabled: false, checkIntervalMinutes: 60, onlyOnScheduledRestart: true },
    backup: { enabled: false, intervalMinutes: 60, retain: 24, targetDir: '' },
  };
}

let cache: ServerProfile[] | null = null;

async function readAll(): Promise<ServerProfile[]> {
  if (cache) return cache;

  try {
    const raw = await fs.readFile(profilesFile(), 'utf8');
    const parsed = JSON.parse(raw) as { profiles?: unknown };

    if (!Array.isArray(parsed.profiles)) {
      cache = [];
      return cache;
    }

    // Les profils ecrits par une version anterieure peuvent manquer de champs :
    // les valeurs par defaut comblent les trous sans perdre ce qui est present
    cache = parsed.profiles.map((entry) => ({
      ...defaults(),
      ...(entry as ServerProfile),
    }));
    return cache;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      cache = [];
      return cache;
    }
    throw error;
  }
}

async function writeAll(profiles: ServerProfile[]): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });

  // Ecriture via un fichier temporaire : une coupure ne doit pas laisser
  // profiles.json tronque, ce qui ferait perdre toute la configuration
  const target = profilesFile();
  const temp = `${target}.tmp`;

  await fs.writeFile(temp, JSON.stringify({ profiles }, null, 2), 'utf8');
  await fs.rename(temp, target);

  cache = profiles;
  bus.emitProfilesChanged();
}

export async function listProfiles(): Promise<ServerProfile[]> {
  return [...(await readAll())];
}

export async function getProfile(id: string): Promise<ServerProfile | null> {
  const profiles = await readAll();
  return profiles.find((profile) => profile.id === id) ?? null;
}

/** Comme getProfile, mais leve une erreur exploitable par les routes */
export async function requireProfile(id: string): Promise<ServerProfile> {
  const profile = await getProfile(id);
  if (!profile) throw new Error(`Profil introuvable : ${id}`);
  return profile;
}

export async function createProfile(input: ProfileInput): Promise<ServerProfile> {
  const profiles = await readAll();
  const settings = await loadSettings();

  const installDir = input.installDir?.trim() || (await suggestInstallDir(input.name));

  const base = defaults();
  const profile: ServerProfile = {
    ...base,
    ...input,
    // Le dossier de sauvegarde global sert de point de depart, modifiable ensuite par profil
    backup: { ...base.backup, targetDir: settings.defaultBackupDir },
    installDir: path.resolve(installDir),
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  await writeAll([...profiles, profile]);
  return profile;
}

export async function updateProfile(id: string, patch: Partial<ServerProfile>): Promise<ServerProfile> {
  const profiles = await readAll();
  const index = profiles.findIndex((profile) => profile.id === id);
  if (index === -1) throw new Error(`Profil introuvable : ${id}`);

  const updated: ServerProfile = {
    ...profiles[index]!,
    ...patch,
    // L'identite et la date de creation ne sont jamais modifiables par un client
    id: profiles[index]!.id,
    createdAt: profiles[index]!.createdAt,
  };

  if (patch.installDir) updated.installDir = path.resolve(patch.installDir);

  const next = [...profiles];
  next[index] = updated;
  await writeAll(next);

  return updated;
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = await readAll();
  await writeAll(profiles.filter((profile) => profile.id !== id));
}

/** Vide le cache memoire, utilise par les tests */
export function resetStoreCache(): void {
  cache = null;
}
