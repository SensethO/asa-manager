import type { ServerProfile } from '../../../shared/types.js';
import { createBackup } from './backup.js';
import { bus } from './events.js';
import { listProfiles } from './store.js';
import {
  ensureLogTailing,
  isBusy,
  isRunning,
  reattach,
  refreshInstalledBuild,
  restart,
  setStatus,
  snapshot,
  start,
} from './serverProcess.js';
import { installOrUpdate, readInstalledBuildId, readLatestBuildId } from './steamcmd.js';

const TICK_MS = 30_000;

/** Marqueurs "deja execute", pour ne pas declencher deux fois dans la meme minute */
const lastRestartKey = new Map<string, string>();
const lastBackupAt = new Map<string, number>();
const lastUpdateCheckAt = new Map<string, number>();
/** Profils pour lesquels une mise a jour attend le prochain redemarrage planifie */
const pendingUpdate = new Set<string>();

let timer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), TICK_MS);
  // Un premier passage immediat evite d'attendre 30 s au demarrage
  void tick();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function hasPendingUpdate(profileId: string): boolean {
  return pendingUpdate.has(profileId);
}

async function tick(): Promise<void> {
  let profiles: ServerProfile[];
  try {
    profiles = await listProfiles();
  } catch {
    return;
  }

  for (const profile of profiles) {
    try {
      // Journaux suivis en permanence, meme pour un serveur lance hors gestionnaire
      ensureLogTailing(profile);
      // Et reprise du suivi si un serveur a survecu a un redemarrage du gestionnaire
      await reattach(profile);

      await handleRestart(profile);
      await handleBackup(profile);
      await handleUpdate(profile);
    } catch (error) {
      bus.log(profile.id, 'manager', `Planificateur : ${(error as Error).message}`, 'error');
    }
  }
}

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * Declenche la sequence d'arret suffisamment tot pour que le dernier preavis
 * tombe pile a l'heure configuree : l'heure indiquee est celle du redemarrage,
 * pas celle du premier avertissement.
 */
async function handleRestart(profile: ServerProfile): Promise<void> {
  if (!profile.restart.enabled || !isRunning(profile.id) || isBusy(profile.id)) return;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const lead = Math.max(0, ...profile.restart.warningMinutes.filter((m) => m > 0));

  for (const time of profile.restart.dailyTimes) {
    const target = minutesOf(time);
    if (target === null) continue;

    // Modulo 1440 pour qu'un preavis puisse enjamber minuit
    const trigger = (target - lead + 1440) % 1440;
    if (trigger !== nowMinutes) continue;

    const key = `${now.toDateString()} ${time}`;
    if (lastRestartKey.get(profile.id) === key) continue;
    lastRestartKey.set(profile.id, key);

    bus.log(profile.id, 'manager', `Redemarrage planifie de ${time} : debut des preavis.`);

    void (async () => {
      try {
        if (pendingUpdate.has(profile.id)) {
          await restart(profile, { reason: 'Mise a jour du serveur dans {0} minute(s)' });
          pendingUpdate.delete(profile.id);
        } else {
          await restart(profile);
        }
      } catch (error) {
        bus.log(profile.id, 'manager', `Redemarrage planifie echoue : ${(error as Error).message}`, 'error');
      }
    })();

    return;
  }
}

async function handleBackup(profile: ServerProfile): Promise<void> {
  if (!profile.backup.enabled || profile.backup.intervalMinutes <= 0) return;
  if (isBusy(profile.id)) return;

  const last = lastBackupAt.get(profile.id) ?? 0;
  if (Date.now() - last < profile.backup.intervalMinutes * 60_000) return;

  lastBackupAt.set(profile.id, Date.now());
  await createBackup(profile);
}

async function handleUpdate(profile: ServerProfile): Promise<void> {
  if (!profile.update.enabled || profile.update.checkIntervalMinutes <= 0) return;
  if (isBusy(profile.id) || pendingUpdate.has(profile.id)) return;

  const last = lastUpdateCheckAt.get(profile.id) ?? 0;
  if (Date.now() - last < profile.update.checkIntervalMinutes * 60_000) return;
  lastUpdateCheckAt.set(profile.id, Date.now());

  const [installed, latest] = await Promise.all([
    readInstalledBuildId(profile),
    readLatestBuildId(profile.id),
  ]);

  // Un build inconnu ne doit jamais passer pour "a jour" ni declencher une MAJ
  if (!installed || !latest || installed === latest) return;

  bus.log(profile.id, 'manager', `Mise a jour disponible : build ${installed} -> ${latest}.`);

  if (profile.update.onlyOnScheduledRestart && isRunning(profile.id)) {
    pendingUpdate.add(profile.id);
    bus.log(profile.id, 'manager', 'Application prevue au prochain redemarrage planifie.');
    return;
  }

  await applyUpdate(profile);
}

/**
 * Applique une mise a jour : arret si necessaire, SteamCMD, puis relance
 * uniquement si le serveur tournait avant.
 */
export async function applyUpdate(profile: ServerProfile): Promise<void> {
  const wasRunning = isRunning(profile.id);

  if (wasRunning) {
    const { stop } = await import('./serverProcess.js');
    await stop(profile, { reason: 'Mise a jour du serveur dans {0} minute(s)' });
  }

  setStatus(profile.id, 'updating', 'SteamCMD en cours');
  try {
    const result = await installOrUpdate(profile);
    bus.log(
      profile.id,
      'manager',
      result.alreadyUpToDate ? 'Serveur deja a jour.' : `Mise a jour terminee (build ${result.buildId ?? 'inconnu'}).`,
    );

    // Le build venait d'etre lu pour le journal, mais restait hors de l'etat
    // diffuse. Le `finally` ci-dessous publie un instantane, qui portait donc
    // encore l'ancien numero : l'interface annoncait une mise a jour deja
    // faite jusqu'au rechargement de la page. La relecture doit preceder
    // cette publication.
    await refreshInstalledBuild(profile);
  } finally {
    if (snapshot(profile.id).status === 'updating') setStatus(profile.id, 'stopped');
  }

  pendingUpdate.delete(profile.id);

  if (wasRunning) await start(profile);
}
