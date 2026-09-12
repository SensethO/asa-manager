import fs from 'node:fs/promises';
import path from 'node:path';

import type { AppSettings } from '../../../shared/types.js';
import { dataDir } from './paths.js';

/**
 * Emplacement par defaut des serveurs. Choisi hors du dossier du gestionnaire :
 * une installation ASA pese une dizaine de gigaoctets et n'a rien a faire dans
 * l'arborescence de l'application.
 */
export const DEFAULT_SERVER_DIR = 'E:\\ServersASA';

function defaults(): AppSettings {
  return {
    defaultServerDir: DEFAULT_SERVER_DIR,
    sessionHours: 12,
    defaultBackupDir: '',
  };
}

function settingsFile(): string {
  return path.join(dataDir(), 'settings.json');
}

let cache: AppSettings | null = null;

export async function loadSettings(): Promise<AppSettings> {
  if (cache) return cache;

  try {
    const raw = await fs.readFile(settingsFile(), 'utf8');
    // Les cles absentes retombent sur les valeurs par defaut : un fichier ecrit
    // par une version anterieure reste exploitable
    cache = { ...defaults(), ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    cache = defaults();
  }

  return cache;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next: AppSettings = { ...current, ...patch };

  next.defaultServerDir = next.defaultServerDir.trim() || DEFAULT_SERVER_DIR;
  next.defaultBackupDir = next.defaultBackupDir.trim();
  next.sessionHours = clamp(next.sessionHours, 1, 24 * 30);

  await fs.mkdir(dataDir(), { recursive: true });

  const target = settingsFile();
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, JSON.stringify(next, null, 2), 'utf8');
  await fs.rename(temp, target);

  cache = next;
  return next;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Transforme un nom de profil en segment de dossier utilisable sous Windows :
 * accents retires, caracteres interdits remplaces.
 */
export function slugForDirectory(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();

  return slug || 'serveur';
}

/** Dossier propose pour un nouveau profil, sous le dossier par defaut configure */
export async function suggestInstallDir(name: string): Promise<string> {
  const settings = await loadSettings();
  return path.join(settings.defaultServerDir, slugForDirectory(name));
}

export function resetSettingsCache(): void {
  cache = null;
}
