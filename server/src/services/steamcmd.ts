import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { ServerProfile } from '../../../shared/types.js';
import { bus } from './events.js';
import { ASA_APP_ID, appManifest, steamcmdDir, steamcmdExe } from './paths.js';

const STEAMCMD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';

/** Silence tolere avant d'abandonner : une mise a jour parle regulierement */
const QUIET_LIMIT_MS = 10 * 60 * 1000;

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Telecharge et extrait SteamCMD si absent. Declenche par une action explicite
 * de l'utilisateur, jamais automatiquement au demarrage du gestionnaire.
 */
export async function ensureSteamCmd(profileId: string): Promise<string> {
  const exe = steamcmdExe();
  if (await exists(exe)) return exe;

  const dir = steamcmdDir();
  await fs.mkdir(dir, { recursive: true });

  bus.log(profileId, 'steamcmd', 'SteamCMD absent, telechargement en cours...');

  const response = await fetch(STEAMCMD_URL);
  if (!response.ok) {
    throw new Error(`Telechargement de SteamCMD impossible (HTTP ${response.status})`);
  }

  const zipPath = path.join(dir, 'steamcmd.zip');
  await fs.writeFile(zipPath, Buffer.from(await response.arrayBuffer()));

  // Windows n'expose pas d'extracteur ZIP a Node ; Expand-Archive est present
  // sur toutes les versions supportees et evite une dependance supplementaire
  await run('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${dir}' -Force`], profileId, 'steamcmd');

  await fs.unlink(zipPath).catch(() => undefined);

  if (!(await exists(exe))) {
    throw new Error("L'archive SteamCMD ne contient pas steamcmd.exe");
  }

  bus.log(profileId, 'steamcmd', 'SteamCMD installe.');
  return exe;
}

function run(
  command: string,
  args: string[],
  profileId: string,
  source: 'steamcmd' | 'manager',
  onLine?: (line: string) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });

    // Une mise a jour d'ARK dure parfois vingt minutes : c'est le *silence* qui
    // est suspect, pas la duree. Sans ce garde, un processus qui ne se ferme
    // jamais laisse la promesse en suspens, et le profil reste bloque sur
    // « installation en cours » avec toutes ses actions grisees.
    let idle: NodeJS.Timeout;
    const rearm = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        bus.log(profileId, 'manager', `${command} : aucune sortie depuis ${QUIET_LIMIT_MS / 60000} minutes, abandon`, 'error');
        child.kill();
        reject(new Error(`${command} ne repond plus`));
      }, QUIET_LIMIT_MS);
    };

    const handle = (chunk: Buffer) => {
      rearm();
      const text = chunk.toString('utf8');
      bus.logChunk(profileId, source, text);
      if (onLine) {
        for (const line of text.split(/\r?\n/)) if (line.trim()) onLine(line);
      }
    };

    child.stdout.on('data', handle);
    child.stderr.on('data', handle);

    child.on('error', (error) => {
      clearTimeout(idle);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(idle);
      resolve(code ?? -1);
    });

    rearm();
  });
}

export interface UpdateResult {
  /** True si SteamCMD a effectivement telecharge quelque chose */
  changed: boolean;
  buildId: string | null;
  alreadyUpToDate: boolean;
}

/**
 * Installe ou met a jour le serveur ASA. La meme commande couvre les deux cas :
 * SteamCMD telecharge ce qui manque et signale "already up to date" sinon.
 */
export async function installOrUpdate(profile: ServerProfile): Promise<UpdateResult> {
  const exe = await ensureSteamCmd(profile.id);
  await fs.mkdir(profile.installDir, { recursive: true });

  let alreadyUpToDate = false;
  let success = false;

  const code = await run(
    exe,
    [
      '+force_install_dir',
      profile.installDir,
      '+login',
      'anonymous',
      '+app_update',
      ASA_APP_ID,
      'validate',
      '+quit',
    ],
    profile.id,
    'steamcmd',
    (line) => {
      if (/already up to date/i.test(line)) alreadyUpToDate = true;
      if (/Success! App '\d+' fully installed|fully installed|update complete/i.test(line)) success = true;
    },
  );

  if (code !== 0 && !success) {
    throw new Error(`SteamCMD s'est termine avec le code ${code}`);
  }

  return {
    changed: !alreadyUpToDate,
    buildId: await readInstalledBuildId(profile),
    alreadyUpToDate,
  };
}

/**
 * Lit le buildid dans le manifeste ecrit par SteamCMD.
 * Le fichier est au format VDF : "buildid" "1234567".
 */
export async function readInstalledBuildId(profile: ServerProfile): Promise<string | null> {
  try {
    const raw = await fs.readFile(appManifest(profile), 'utf8');
    const match = /"buildid"\s+"(\d+)"/i.exec(raw);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Interroge Steam pour connaitre le build publie sur la branche publique.
 * Retourne null si la sortie n'est pas exploitable : l'appelant doit alors
 * considerer l'etat comme inconnu plutot que comme "a jour".
 */
export async function readLatestBuildId(profileId: string): Promise<string | null> {
  const exe = await ensureSteamCmd(profileId);

  let output = '';
  await run(
    exe,
    ['+login', 'anonymous', '+app_info_update', '1', '+app_info_print', ASA_APP_ID, '+quit'],
    profileId,
    'steamcmd',
    (line) => {
      output += `${line}\n`;
    },
  );

  // On cible le bloc "public" a l'interieur de "branches"
  const branches = output.slice(output.search(/"branches"/i));
  const publicBlock = branches.slice(branches.search(/"public"/i));
  const match = /"buildid"\s+"(\d+)"/i.exec(publicBlock);

  return match?.[1] ?? null;
}

export async function isServerInstalled(profile: ServerProfile): Promise<boolean> {
  return exists(appManifest(profile));
}
