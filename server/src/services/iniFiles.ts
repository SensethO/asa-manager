import fs from 'node:fs/promises';
import path from 'node:path';

import type { IniDocument, IniFileName, ServerProfile } from '../../../shared/types.js';
import { bus } from './events.js';
import { configDir, dataDir } from './paths.js';
import {
  addEntry,
  applyChanges,
  getValue,
  type IniAddition,
  type IniChange,
  parseIni,
  serializeIni,
  setValue,
  toDocument,
} from './ini.js';
import { isRunning } from './serverProcess.js';

export const INI_FILES: IniFileName[] = ['Game.ini', 'GameUserSettings.ini'];

export function isIniFileName(value: string): value is IniFileName {
  return (INI_FILES as string[]).includes(value);
}

function livePath(profile: ServerProfile, file: IniFileName): string {
  return path.join(configDir(profile), file);
}

/**
 * ARK reecrit GameUserSettings.ini quand le serveur s'arrete : toute edition
 * faite pendant qu'il tourne serait perdue. Les modifications sont donc mises
 * en attente ici et recopiees au demarrage suivant.
 */
function pendingPath(profile: ServerProfile, file: IniFileName): string {
  return path.join(dataDir(), 'pending', `${profile.id}-${file}`);
}

async function readFileOrEmpty(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function hasPending(profile: ServerProfile, file: IniFileName): Promise<boolean> {
  return (await readFileOrEmpty(pendingPath(profile, file))) !== null;
}

/**
 * Retourne le contenu qui fait foi pour l'utilisateur : le tampon en attente
 * s'il existe, sinon le fichier reellement lu par le serveur.
 */
export async function readIniText(profile: ServerProfile, file: IniFileName): Promise<string> {
  const pending = await readFileOrEmpty(pendingPath(profile, file));
  if (pending !== null) return pending;

  return (await readFileOrEmpty(livePath(profile, file))) ?? '';
}

export async function readIniDocument(profile: ServerProfile, file: IniFileName): Promise<IniDocument> {
  const text = await readIniText(profile, file);
  return toDocument(parseIni(text), file, await hasPending(profile, file));
}

async function persist(profile: ServerProfile, file: IniFileName, text: string): Promise<{ pending: boolean }> {
  if (isRunning(profile.id)) {
    const target = pendingPath(profile, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text, 'utf8');

    bus.log(profile.id, 'manager', `${file} : modifications en attente du prochain redemarrage.`);
    return { pending: true };
  }

  const target = livePath(profile, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, text, 'utf8');

  // Le tampon devient caduc des lors que le fichier reel est ecrit
  await fs.unlink(pendingPath(profile, file)).catch(() => undefined);

  bus.log(profile.id, 'manager', `${file} enregistre.`);
  return { pending: false };
}

export async function writeIniChanges(
  profile: ServerProfile,
  file: IniFileName,
  changes: IniChange[],
  additions: IniAddition[] = [],
): Promise<IniDocument> {
  const parsed = parseIni(await readIniText(profile, file));
  applyChanges(parsed, changes, additions);

  const { pending } = await persist(profile, file, serializeIni(parsed));
  return toDocument(parsed, file, pending);
}

/** Ecriture directe du texte, pour l'edition brute proposee dans l'interface */
export async function writeIniText(
  profile: ServerProfile,
  file: IniFileName,
  text: string,
): Promise<IniDocument> {
  const { pending } = await persist(profile, file, text);
  return toDocument(parseIni(text), file, pending);
}

/**
 * Bascule les tampons vers les fichiers reels. Appele juste avant le lancement,
 * quand ARK ne detient plus les fichiers.
 */
export async function applyPendingIni(profile: ServerProfile): Promise<IniFileName[]> {
  const applied: IniFileName[] = [];

  for (const file of INI_FILES) {
    const text = await readFileOrEmpty(pendingPath(profile, file));
    if (text === null) continue;

    const target = livePath(profile, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text, 'utf8');
    await fs.unlink(pendingPath(profile, file)).catch(() => undefined);

    applied.push(file);
  }

  if (applied.length > 0) {
    bus.log(profile.id, 'manager', `Configuration appliquee : ${applied.join(', ')}.`);
  }

  return applied;
}

/**
 * Reglages que l'onglet Parametres du gestionnaire pilote, et qui existent aussi
 * dans GameUserSettings.ini.
 */
function managedSettings(profile: ServerProfile): { section: string; key: string; value: string }[] {
  return [
    { section: 'SessionSettings', key: 'SessionName', value: profile.sessionName },
    { section: 'ServerSettings', key: 'ServerPassword', value: profile.serverPassword },
    { section: 'ServerSettings', key: 'ServerAdminPassword', value: profile.adminPassword },
    { section: 'ServerSettings', key: 'RCONEnabled', value: profile.rconEnabled ? 'True' : 'False' },
    { section: 'ServerSettings', key: 'RCONPort', value: String(profile.rconPort) },
  ];
}

/**
 * Reporte les reglages du profil dans GameUserSettings.ini juste avant le lancement.
 *
 * Sans cela, ces valeurs ont deux sources de verite qui divergent : la ligne de
 * commande, construite depuis le profil, et le fichier INI, que le serveur
 * reecrit a chaque arret. Vider le mot de passe de connexion dans l'interface
 * le retirait de la ligne de commande, mais ARK continuait de lire l'ancienne
 * valeur restee dans le fichier — le serveur restait protege par un mot de passe
 * que l'interface affichait comme absent.
 *
 * Le profil fait donc autorite sur ces cles precises. Les autres reglages du
 * fichier ne sont pas touches.
 */
export async function syncProfileToIni(profile: ServerProfile): Promise<string[]> {
  const target = livePath(profile, 'GameUserSettings.ini');
  const parsed = parseIni((await readFileOrEmpty(target)) ?? '');

  const reconciled: string[] = [];

  for (const setting of managedSettings(profile)) {
    const current = getValue(parsed, setting.section, setting.key, 0);
    if (current === setting.value) continue;

    if (current === null) addEntry(parsed, setting.section, setting.key, setting.value);
    else setValue(parsed, setting.section, setting.key, 0, setting.value);

    reconciled.push(setting.key);
  }

  if (reconciled.length === 0) return [];

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, serializeIni(parsed), 'utf8');

  bus.log(profile.id, 'manager', `Configuration alignee sur le profil : ${reconciled.join(', ')}.`);
  return reconciled;
}

export async function discardPendingIni(profile: ServerProfile, file: IniFileName): Promise<void> {
  await fs.unlink(pendingPath(profile, file)).catch(() => undefined);
  bus.log(profile.id, 'manager', `${file} : modifications en attente annulees.`);
}
