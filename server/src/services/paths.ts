import path from 'node:path';
import { existsSync } from 'node:fs';

import type { ServerProfile } from '../../../shared/types.js';

/** AppID Steam du serveur dedie ARK: Survival Ascended (application gratuite et distincte du jeu) */
export const ASA_APP_ID = '2430930';

/** Racine des donnees du gestionnaire : profils, journaux, copie de steamcmd */
export function dataDir(): string {
  return process.env.ASA_MANAGER_DATA ?? path.resolve(process.cwd(), 'data');
}

export function profilesFile(): string {
  return path.join(dataDir(), 'profiles.json');
}

export function steamcmdDir(): string {
  return path.join(dataDir(), 'steamcmd');
}

export function steamcmdExe(): string {
  return path.join(steamcmdDir(), 'steamcmd.exe');
}

export function serverExe(profile: ServerProfile): string {
  return path.join(profile.installDir, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
}

/** Lanceur installe par AsaApi, present uniquement si l'API a ete deployee */
export function asaApiLoaderExe(profile: ServerProfile): string {
  return path.join(profile.installDir, 'ShooterGame', 'Binaries', 'Win64', 'AsaApiLoader.exe');
}

/**
 * Executable a lancer reellement.
 *
 * AsaApi s'installe a cote du serveur et fournit son propre lanceur, qui injecte
 * l'API puis demarre le jeu avec les memes arguments. Quand il est present, c'est
 * lui qu'il faut lancer : demarrer ArkAscendedServer.exe directement priverait le
 * serveur de tous ses plugins.
 */
export function launcherExe(profile: ServerProfile): string {
  return existsSync(asaApiLoaderExe(profile)) ? asaApiLoaderExe(profile) : serverExe(profile);
}

export function hasAsaApi(profile: ServerProfile): boolean {
  return existsSync(asaApiLoaderExe(profile));
}

/**
 * Configuration du plugin AsaQoL.
 *
 * Elle ne vit pas avec les .ini du jeu : AsaApi loge chaque plugin dans son
 * propre dossier, et le jeu reecrit ses .ini a l'arret, ce qui effacerait tout
 * reglage qu'on y ajouterait.
 */
export function pluginConfigFile(profile: ServerProfile, plugin = 'AsaQoL'): string {
  return path.join(
    profile.installDir,
    'ShooterGame',
    'Binaries',
    'Win64',
    'ArkApi',
    'Plugins',
    plugin,
    'config.json',
  );
}

export function configDir(profile: ServerProfile): string {
  return path.join(profile.installDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
}

/** Journal ecrit par le jeu lui-meme, quel que soit le lanceur utilise */
export function shooterGameLog(profile: ServerProfile): string {
  return path.join(profile.installDir, 'ShooterGame', 'Saved', 'Logs', 'ShooterGame.log');
}

/** Dossier ou AsaApi depose ses journaux, un fichier horodate par lancement */
export function apiLogsDir(profile: ServerProfile): string {
  return path.join(profile.installDir, 'ShooterGame', 'Binaries', 'Win64', 'logs');
}

export function savedArksDir(profile: ServerProfile): string {
  return path.join(profile.installDir, 'ShooterGame', 'Saved', 'SavedArks');
}

export function backupDir(profile: ServerProfile): string {
  return profile.backup.targetDir.trim() !== ''
    ? profile.backup.targetDir
    : path.join(profile.installDir, 'Backups');
}

/** Fichier ecrit par SteamCMD, d'ou est lu le numero de build installe */
export function appManifest(profile: ServerProfile): string {
  return path.join(profile.installDir, 'steamapps', `appmanifest_${ASA_APP_ID}.acf`);
}

export function clusterDir(profile: ServerProfile): string {
  return path.join(dataDir(), 'clusters', profile.clusterId);
}
