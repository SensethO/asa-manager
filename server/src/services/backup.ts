import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

import archiver from 'archiver';

import type { BackupInfo, ServerProfile } from '../../../shared/types.js';
import { bus } from './events.js';
import { backupDir, configDir, savedArksDir } from './paths.js';
import { exec, isRunning } from './serverProcess.js';

function timestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

/**
 * Archive les sauvegardes de monde et les fichiers de configuration.
 * Si le serveur tourne, un SaveWorld est demande au prealable pour que
 * l'archive ne contienne pas un etat plus ancien que la derniere session.
 */
export async function createBackup(profile: ServerProfile): Promise<BackupInfo> {
  if (isRunning(profile.id)) {
    bus.log(profile.id, 'manager', 'Sauvegarde du monde avant archivage...');
    await exec(profile, 'SaveWorld').catch(() => {
      bus.log(profile.id, 'manager', "SaveWorld a echoue, l'archive peut precede la session en cours.", 'warn');
    });
  }

  const dir = backupDir(profile);
  await fs.mkdir(dir, { recursive: true });

  const name = `${profile.map}-${timestamp()}.zip`;
  const target = path.join(dir, name);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(target);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (warning) => {
      bus.log(profile.id, 'manager', `Archivage : ${warning.message}`, 'warn');
    });

    archive.pipe(output);
    archive.directory(savedArksDir(profile), 'SavedArks');
    archive.directory(configDir(profile), 'Config');
    void archive.finalize();
  });

  const stat = await fs.stat(target);
  bus.log(profile.id, 'manager', `Sauvegarde creee : ${name} (${formatSize(stat.size)})`);

  await pruneBackups(profile);

  return {
    name,
    path: target,
    sizeBytes: stat.size,
    createdAt: stat.mtime.toISOString(),
  };
}

export async function listBackups(profile: ServerProfile): Promise<BackupInfo[]> {
  const dir = backupDir(profile);

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const backups: BackupInfo[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.zip')) continue;

    const full = path.join(dir, entry);
    const stat = await fs.stat(full);
    backups.push({ name: entry, path: full, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() });
  }

  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Supprime les archives excedentaires, de la plus ancienne a la plus recente */
export async function pruneBackups(profile: ServerProfile): Promise<number> {
  const retain = profile.backup.retain;
  if (retain <= 0) return 0;

  const backups = await listBackups(profile);
  const excess = backups.slice(retain);

  for (const backup of excess) {
    await fs.unlink(backup.path).catch(() => undefined);
    bus.log(profile.id, 'manager', `Ancienne sauvegarde supprimee : ${backup.name}`);
  }

  return excess.length;
}

export async function deleteBackup(profile: ServerProfile, name: string): Promise<void> {
  const dir = backupDir(profile);
  const target = path.join(dir, name);

  // Empeche un nom fabrique de sortir du dossier de sauvegardes
  if (path.dirname(path.resolve(target)) !== path.resolve(dir)) {
    throw new Error('Nom de sauvegarde invalide');
  }

  await fs.unlink(target);
}

/**
 * Restaure une archive. Refuse d'ecraser les donnees d'un serveur en marche :
 * ARK reecrit ses fichiers a l'arret et annulerait la restauration.
 */
export async function restoreBackup(profile: ServerProfile, name: string): Promise<void> {
  if (isRunning(profile.id)) {
    throw new Error('Arretez le serveur avant de restaurer une sauvegarde');
  }

  const dir = backupDir(profile);
  const source = path.join(dir, name);

  if (path.dirname(path.resolve(source)) !== path.resolve(dir)) {
    throw new Error('Nom de sauvegarde invalide');
  }

  await fs.access(source);

  // L'etat courant est archive avant ecrasement, pour rendre la restauration reversible
  const safety = path.join(dir, `avant-restauration-${timestamp()}.zip`);
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(safety);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(savedArksDir(profile), 'SavedArks');
    archive.directory(configDir(profile), 'Config');
    void archive.finalize();
  });

  const staging = path.join(dir, `.restore-${Date.now()}`);
  await fs.mkdir(staging, { recursive: true });

  try {
    await extractZip(source, staging);

    await replaceDir(path.join(staging, 'SavedArks'), savedArksDir(profile));
    await replaceDir(path.join(staging, 'Config'), configDir(profile));

    bus.log(profile.id, 'manager', `Sauvegarde restauree : ${name}`);
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function replaceDir(from: string, to: string): Promise<void> {
  try {
    await fs.access(from);
  } catch {
    return; // L'archive ne contenait pas cette partie
  }

  await fs.rm(to, { recursive: true, force: true });
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
}

function extractZip(zipPath: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destination}' -Force`,
      ],
      { windowsHide: true },
    );

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Extraction impossible : ${stderr.trim() || `code ${code}`}`));
    });
  });
}

export function formatSize(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
