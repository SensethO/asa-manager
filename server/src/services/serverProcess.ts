import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { PlayerInfo, ProfileRuntime, ServerProfile, ServerStatus } from '../../../shared/types.js';
import { bus } from './events.js';
import { findLatestApiLog, tailFiles } from './logTail.js';
import { apiLogsDir, clusterDir, dataDir, hasAsaApi, launcherExe, serverExe, shooterGameLog } from './paths.js';
import { RconClient, parsePlayerList } from './rcon.js';
import { SerialQueue } from './serialQueue.js';
import { forgetItemCatalog } from './items.js';
import { deliverPending, recordSeen } from './roster.js';
import { readInstalledBuildId } from './steamcmd.js';

interface Runtime {
  status: ServerStatus;
  child: ChildProcess | null;
  startedAt: Date | null;
  lastError: string | null;
  progress: string | null;
  playersOnline: number | null;
  installedBuildId: string | null;
  /** Arme pendant un arret differe, permet de l'annuler */
  stopAbort: AbortController | null;
  /** Arret du suivi des fichiers journaux */
  stopTail: (() => void) | null;
  /**
   * Serveur vivant que ce gestionnaire n'a pas lance : il a survecu a un
   * redemarrage du gestionnaire. On n'a pas de handle de processus sur lui,
   * seulement son identifiant.
   */
  externalPid: number | null;
}

const runtimes = new Map<string, Runtime>();

function runtimeOf(profileId: string): Runtime {
  let runtime = runtimes.get(profileId);
  if (!runtime) {
    runtime = {
      status: 'stopped',
      child: null,
      startedAt: null,
      lastError: null,
      progress: null,
      playersOnline: null,
      installedBuildId: null,
      stopAbort: null,
      stopTail: null,
      externalPid: null,
    };
    runtimes.set(profileId, runtime);
  }
  return runtime;
}

export function snapshot(profileId: string): ProfileRuntime {
  const runtime = runtimeOf(profileId);
  return {
    profileId,
    status: runtime.status,
    pid: runtime.child?.pid ?? runtime.externalPid,
    startedAt: runtime.startedAt?.toISOString() ?? null,
    lastError: runtime.lastError,
    progress: runtime.progress,
    playersOnline: runtime.playersOnline,
    installedBuildId: runtime.installedBuildId,
  };
}

/**
 * Relit le build installe dans le manifeste de SteamCMD.
 *
 * La valeur etait gardee en memoire et n'etait rafraichie qu'au demarrage d'un
 * serveur ou apres une mise a jour reussie. Une mise a jour qui aboutissait sans
 * rendre la main laissait donc l'interface annoncer un retard qui n'existait
 * plus, et proposer une mise a jour deja faite. Une lecture de fichier a chaque
 * consultation coute peu au regard de cette confusion.
 */
export async function refreshInstalledBuild(profile: ServerProfile): Promise<void> {
  const runtime = runtimeOf(profile.id);
  const found = await readInstalledBuildId(profile);

  if (found === runtime.installedBuildId) return;

  runtime.installedBuildId = found;
  publish(profile.id);
}

function publish(profileId: string): void {
  bus.emitRuntime(snapshot(profileId));
}

export function setStatus(profileId: string, status: ServerStatus, progress: string | null = null): void {
  const runtime = runtimeOf(profileId);
  runtime.status = status;
  runtime.progress = progress;
  publish(profileId);
}

export function setError(profileId: string, message: string): void {
  const runtime = runtimeOf(profileId);
  runtime.status = 'error';
  runtime.lastError = message;
  runtime.progress = null;
  bus.log(profileId, 'manager', message, 'error');
  publish(profileId);
}

export function isBusy(profileId: string): boolean {
  const status = runtimeOf(profileId).status;
  return status === 'installing' || status === 'updating' || status === 'starting' || status === 'stopping';
}

export function isRunning(profileId: string): boolean {
  const runtime = runtimeOf(profileId);
  return (runtime.child !== null || runtime.externalPid !== null) && runtime.status === 'running';
}

/**
 * Suit les fichiers journaux d'un profil, quel que soit l'etat du serveur.
 *
 * Le suivi n'est pas lie au demarrage : ainsi le journal fonctionne aussi pour
 * un serveur que ce gestionnaire n'a pas lance, et survit a son redemarrage.
 * Appel idempotent.
 */
export function ensureLogTailing(profile: ServerProfile): void {
  const runtime = runtimeOf(profile.id);
  if (runtime.stopTail) return;

  runtime.stopTail = tailFiles([
    {
      file: shooterGameLog(profile),
      source: 'server',
      onLine: (text, source) => {
        bus.log(profile.id, source, text);

        // Certaines pannes d'ARK ne se lisent que dans son journal, noyees parmi
        // des centaines de lignes techniques, et se soldent par un arret sans
        // explication cote gestionnaire. Elles sont donc traduites en clair.
        const issue = describeServerLogIssue(text);
        if (issue) bus.log(profile.id, 'manager', issue, 'error');
      },
    },
    {
      file: () => findLatestApiLog(apiLogsDir(profile)),
      source: 'plugin',
      onLine: (text, source) => bus.log(profile.id, source, text),
    },
  ]);
}

/**
 * Reprend la main sur un serveur qui a survecu au gestionnaire.
 *
 * On ne recupere pas de handle de processus : seuls l'identifiant et le RCON
 * permettent de le piloter. C'est suffisant pour afficher un etat honnete et
 * pour l'arreter proprement, au lieu d'afficher « Arrete » pendant que des
 * joueurs y jouent.
 */
/** Vrai si un serveur a ete repris sans avoir ete lance par ce gestionnaire */
export function isReattached(profileId: string): boolean {
  return runtimeOf(profileId).externalPid !== null;
}

export async function reattach(profile: ServerProfile): Promise<boolean> {
  const runtime = runtimeOf(profile.id);
  if (runtime.child || runtime.externalPid) return true;

  // Une installation ou une mise a jour en cours ne doit pas etre ecrasee
  if (runtime.status !== 'stopped') return false;

  const pid = await findOrphanServerPid(profile);
  if (pid === null) return false;

  runtime.externalPid = pid;
  runtime.installedBuildId = await readInstalledBuildId(profile);
  setStatus(profile.id, 'running');

  bus.log(profile.id, 'manager', `Serveur deja en cours (PID ${pid}) : reprise du suivi.`);
  void pollPlayers(profile);

  return true;
}

/**
 * Compose la ligne de commande du serveur.
 * Le premier argument regroupe carte et options de session : ARK attend cette
 * forme "Carte?cle=valeur?cle=valeur", et non des arguments separes.
 */
export function buildLaunchArgs(profile: ServerProfile): string[] {
  const options = [
    profile.map,
    'listen',
    `SessionName=${profile.sessionName}`,
    `Port=${profile.gamePort}`,
    `QueryPort=${profile.queryPort}`,
    `RCONEnabled=${profile.rconEnabled ? 'True' : 'False'}`,
  ];

  if (profile.rconEnabled) {
    options.push(`RCONPort=${profile.rconPort}`);
  }
  if (profile.adminPassword) {
    options.push(`ServerAdminPassword=${profile.adminPassword}`);
  }
  if (profile.serverPassword) {
    options.push(`ServerPassword=${profile.serverPassword}`);
  }

  const args = [options.join('?'), '-server', '-log', `-WinLiveMaxPlayers=${profile.maxPlayers}`];

  const mods = profile.mods.filter((mod) => mod.enabled).map((mod) => mod.id.trim()).filter(Boolean);
  if (mods.length > 0) {
    args.push(`-mods=${mods.join(',')}`);
  }

  if (profile.clusterId.trim() !== '') {
    args.push(`-clusterid=${profile.clusterId}`, `-ClusterDirOverride=${clusterDir(profile)}`);
  }

  args.push(...profile.extraArgs.filter((arg) => arg.trim() !== ''));
  return args;
}

/**
 * File d'attente par profil pour les acces RCON.
 *
 * Le RCON d'ARK ne tolere pas deux connexions concurrentes : une seconde
 * ouverte pendant qu'une premiere travaille reste sans reponse a
 * l'authentification. Or le gestionnaire sonde les joueurs en tache de fond
 * pendant que l'administrateur peut taper une commande, et la sequence d'arret
 * enchaine SaveWorld puis DoExit. Toutes ces operations passent donc par une
 * file unique, une par serveur.
 */
const rconQueue = new SerialQueue();

/**
 * Ouvre une connexion, execute le travail, referme. Serialise par profil.
 */
async function withRconClient<T>(profile: ServerProfile, work: (client: RconClient) => Promise<T>): Promise<T> {
  return rconQueue.run(profile.id, async () => {
    const client = new RconClient({
      host: '127.0.0.1',
      port: profile.rconPort,
      password: profile.adminPassword,
      // L'authentification d'ARK peut demander plusieurs secondes tant que la
      // carte finit de charger : un delai trop court la ferait passer pour un echec
      timeoutMs: 12_000,
    });

    await client.connect();
    try {
      return await work(client);
    } finally {
      client.close();
    }
  });
}

/**
 * Verifie que le RCON repond reellement, et pas seulement que le port accepte
 * une connexion TCP : ARK ouvre le port bien avant d'etre en mesure de traiter
 * une commande.
 */
async function probeRcon(profile: ServerProfile): Promise<boolean> {
  if (!profile.rconEnabled || profile.adminPassword === '') return false;

  try {
    await withRconClient(profile, (client) => client.exec('ListPlayers'));
    return true;
  } catch {
    return false;
  }
}

export async function start(profile: ServerProfile): Promise<void> {
  const runtime = runtimeOf(profile.id);

  if (runtime.child || runtime.externalPid) throw new Error('Le serveur tourne deja');
  if (isBusy(profile.id)) throw new Error('Une operation est deja en cours sur ce profil');

  // Le catalogue d'objets depend du jeu et des mods charges : il est oublie ici
  // pour etre relu au premier besoin, et non conserve d'un demarrage a l'autre.
  forgetItemCatalog(profile.id);

  const exe = serverExe(profile);
  try {
    await fs.access(exe);
  } catch {
    throw new Error(`Executable introuvable : ${exe}. Installez d'abord le serveur.`);
  }

  // Un serveur peut avoir survecu a un redemarrage du gestionnaire : en lancer
  // un second ecraserait les memes sauvegardes et se disputerait les memes ports
  const orphan = await findOrphanServerPid(profile);
  if (orphan !== null) {
    throw new Error(
      `Un serveur tourne deja depuis ce dossier (PID ${orphan}), sans etre suivi par le gestionnaire. ` +
        'Terminez-le depuis le gestionnaire des taches Windows avant de relancer.',
    );
  }

  runtime.lastError = null;
  runtime.installedBuildId = await readInstalledBuildId(profile);
  setStatus(profile.id, 'starting', 'Application de la configuration');

  // Import differe : iniFiles depend de ce module pour connaitre l'etat du serveur
  const { applyPendingIni, syncProfileToIni } = await import('./iniFiles.js');

  await applyPendingIni(profile);
  // Apres les modifications en attente : sur les cles qu'il pilote, le profil
  // doit primer sur ce que le serveur a reecrit dans le fichier en s'arretant
  await syncProfileToIni(profile);

  setStatus(profile.id, 'starting', 'Demarrage du processus');

  const args = buildLaunchArgs(profile);
  const launcher = launcherExe(profile);

  if (hasAsaApi(profile)) {
    bus.log(profile.id, 'manager', 'AsaApi detecte : lancement via AsaApiLoader.exe, les plugins seront charges.');
  }

  bus.log(
    profile.id,
    'manager',
    `Lancement : ${path.basename(launcher)} ${redactArgs(profile, args).join(' ')}`,
  );

  const child = spawn(launcher, args, {
    cwd: profile.installDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Groupe de processus distinct : une interruption visant le gestionnaire
    // (Ctrl+C dans sa console) ne doit pas emporter la partie en cours
    detached: true,
  });

  // Le gestionnaire peut se terminer sans attendre ce processus
  child.unref();

  runtime.child = child;
  runtime.startedAt = new Date();
  runtime.playersOnline = null;

  // Trace sur disque : permet de reperer ce processus s'il survit au gestionnaire
  if (child.pid) void rememberPid(profile, child.pid);

  // Avec AsaApi, le jeu tourne dans un processus separe dote de sa propre
  // console : sa sortie n'arrive plus dans le tuyau ci-dessous. Les fichiers
  // journaux, eux, sont ecrits dans tous les cas.
  ensureLogTailing(profile);

  child.stdout?.on('data', (chunk: Buffer) => bus.logChunk(profile.id, 'server', chunk.toString('utf8')));
  child.stderr?.on('data', (chunk: Buffer) => bus.logChunk(profile.id, 'server', chunk.toString('utf8'), 'warn'));

  child.on('error', (error) => {
    runtime.child = null;
    setError(profile.id, `Echec du lancement : ${error.message}`);
  });

  child.on('close', (code) => {
    const wasStopping = runtime.status === 'stopping';
    runtime.child = null;
    runtime.startedAt = null;
    runtime.playersOnline = null;
    runtime.externalPid = null;
    void forgetPid(profile);
    // Le suivi des journaux reste actif : il ne depend pas de l'etat du serveur

    if (wasStopping || code === 0) {
      bus.log(profile.id, 'manager', `Serveur arrete (code ${code ?? 'inconnu'}).`);
      setStatus(profile.id, 'stopped');
    } else {
      setError(profile.id, `Le serveur s'est arrete de facon inattendue (code ${code ?? 'inconnu'}).`);
    }
  });

  publish(profile.id);
  void waitUntilReady(profile);
}

/** Masque les mots de passe dans la ligne de commande journalisee */
function redactArgs(profile: ServerProfile, args: string[]): string[] {
  let redacted = args;
  for (const secret of [profile.adminPassword, profile.serverPassword]) {
    if (secret) {
      redacted = redacted.map((arg) => arg.split(secret).join('********'));
    }
  }
  return redacted;
}

/**
 * Le processus demarre bien avant d'accepter des joueurs. La disponibilite est
 * donc mesuree sur la reponse effective du RCON, pas sur le simple spawn.
 */
async function waitUntilReady(profile: ServerProfile): Promise<void> {
  const runtime = runtimeOf(profile.id);

  if (!profile.rconEnabled || !profile.adminPassword) {
    // Sans RCON on ne peut pas sonder : on considere le serveur lance
    if (runtime.child) setStatus(profile.id, 'running');
    return;
  }

  const deadline = Date.now() + 15 * 60_000;

  while (runtime.child && Date.now() < deadline) {
    await sleep(5_000);
    if (!runtime.child || runtime.status === 'stopping') return;

    // Une commande reelle, pas une simple connexion : ARK accepte le TCP et
    // authentifie bien avant de savoir repondre a une commande
    if (await probeRcon(profile)) {
      setStatus(profile.id, 'running');
      bus.log(profile.id, 'manager', 'Serveur pret : le RCON repond aux commandes.');
      void pollPlayers(profile);
      return;
    }
  }
}

async function pollPlayers(profile: ServerProfile): Promise<void> {
  const runtime = runtimeOf(profile.id);

  // isRunning couvre aussi un serveur repris apres redemarrage du gestionnaire,
  // pour lequel aucun handle de processus n'existe
  while (isRunning(profile.id)) {
    try {
      const players = await listPlayers(profile);
      runtime.playersOnline = players.length;
      publish(profile.id);

      // Le registre garde la trace des joueurs au-dela de leur presence, et les
      // arrivees declenchent la remise de ce qui leur etait destine
      const arrived = await recordSeen(profile.id, players);
      for (const eosId of arrived) {
        await deliverPending(profile, eosId).catch(() => undefined);
      }
    } catch {
      // Le serveur peut refuser passagerement : on retentera au tour suivant
    }
    await sleep(30_000);
  }
}

export async function listPlayers(profile: ServerProfile): Promise<PlayerInfo[]> {
  return withRconClient(profile, async (client) => parsePlayerList(await client.exec('ListPlayers')));
}

export async function exec(profile: ServerProfile, command: string): Promise<string> {
  return withRconClient(profile, async (client) => {
    const response = await client.exec(command);

    bus.log(profile.id, 'rcon', `> ${command}`);
    if (response.trim()) bus.log(profile.id, 'rcon', response.trim());

    return response;
  });
}

export async function broadcast(profile: ServerProfile, message: string): Promise<void> {
  await exec(profile, `ServerChat ${message}`);
}

export interface AnnounceResult {
  /** 'plugin' = bandeau a duree reglable, 'broadcast' = repli natif a duree imposee */
  mode: 'plugin' | 'broadcast';
  seconds: number;
  response: string;
}

/**
 * Affiche un message en bandeau sur l'ecran des joueurs.
 *
 * Avec AsaApi et le plugin AsaQoL, la duree est respectee. Sans eux, ARK n'offre
 * que `Broadcast`, dont la duree d'affichage est fixee par le jeu : le repli est
 * signale a l'appelant plutot que de laisser croire que la duree a ete appliquee.
 */
export async function announce(
  profile: ServerProfile,
  message: string,
  seconds: number,
): Promise<AnnounceResult> {
  if (hasAsaApi(profile)) {
    const response = await exec(profile, `qol.announce ${Math.round(seconds)} ${message}`);

    // La presence d'AsaApi sur le disque ne garantit pas que le plugin soit
    // charge : il peut avoir echoue au demarrage. ARK repond alors sa phrase
    // generique de commande inconnue, et annoncer un succes serait mensonger.
    if (/Annonce diffusee/i.test(response)) {
      return { mode: 'plugin', seconds, response };
    }

    bus.log(
      profile.id,
      'manager',
      "Le plugin AsaQoL n'a pas repondu : repli sur Broadcast. Verifiez son chargement dans le journal d'AsaApi.",
      'warn',
    );
  }

  const response = await exec(profile, `Broadcast ${message}`);
  return { mode: 'broadcast', seconds: 0, response };
}

export interface StopOptions {
  /** Ignore les preavis configures et arrete tout de suite */
  immediate?: boolean;
  /** Message diffuse, {0} etant remplace par le temps restant */
  reason?: string;
}

/**
 * Arret gracieux : preavis diffuses en jeu, sauvegarde du monde, puis DoExit.
 * Le processus n'est tue de force qu'en dernier recours.
 */
export async function stop(profile: ServerProfile, options: StopOptions = {}): Promise<void> {
  const runtime = runtimeOf(profile.id);
  if (!runtime.child && !runtime.externalPid) {
    throw new Error("Le serveur n'est pas en cours d'execution");
  }

  if (runtime.stopAbort) throw new Error('Un arret est deja programme');

  const abort = new AbortController();
  runtime.stopAbort = abort;
  setStatus(profile.id, 'stopping', 'Verification du RCON');

  try {
    // Sans RCON, ni preavis, ni sauvegarde, ni extinction propre ne sont possibles :
    // diffuser des avertissements pendant un quart d'heure dans le vide avant de
    // tuer le processus donnerait l'impression d'un blocage.
    const rconUsable = await probeRcon(profile);

    if (!rconUsable) {
      bus.log(
        profile.id,
        'manager',
        "RCON injoignable : preavis, sauvegarde et extinction propre impossibles. Le processus va etre termine directement, " +
          'les progres depuis la derniere sauvegarde automatique seront perdus.',
        'warn',
      );

      setStatus(profile.id, 'stopping', 'Terminaison du processus (RCON indisponible)');
      forceKill(profile.id);
      await waitForClose(profile.id, 30_000);
      return;
    }

    const warnings = options.immediate
      ? []
      : [...new Set(profile.restart.warningMinutes)].filter((m) => m > 0).sort((a, b) => b - a);

    let previous = warnings[0] ?? 0;

    for (const minutes of warnings) {
      if (abort.signal.aborted) return;

      const wait = (previous - minutes) * 60_000;
      if (wait > 0) await sleep(wait, abort.signal);
      if (abort.signal.aborted) return;

      const text = (options.reason ?? 'Redemarrage du serveur dans {0} minute(s)').replace('{0}', String(minutes));
      setStatus(profile.id, 'stopping', text);
      await broadcast(profile, text).catch(() => undefined);

      previous = minutes;
    }

    if (previous > 0) {
      await sleep(previous * 60_000, abort.signal);
      if (abort.signal.aborted) return;
    }

    setStatus(profile.id, 'stopping', 'Sauvegarde du monde');
    await exec(profile, 'SaveWorld').catch(() => undefined);

    setStatus(profile.id, 'stopping', 'Extinction demandee, fermeture en cours');
    await exec(profile, 'DoExit').catch(() => undefined);

    // DoExit rend la main immediatement : on laisse au processus le temps de fermer.
    //
    // Le critere n'est pas une duree fixe mais l'activite du serveur. Mesure faite
    // sur un serveur reel : apres « Closing by request », l'extinction a mis 1 min 43
    // rien que pour atteindre la fermeture du rapporteur d'erreurs. Un plafond de
    // 2 minutes tuait donc le processus a quelques secondes de la fin, alors qu'il
    // travaillait encore. Tant qu'il ecrit dans son journal, il n'est pas bloque.
    const closed = await waitForClose(profile.id, {
      quietMs: 90_000,
      maxMs: 900_000,
      activityFile: shooterGameLog(profile),
    });

    if (!closed) {
      bus.log(profile.id, 'manager', 'Arret propre sans effet, terminaison forcee du processus.', 'warn');
      await forceKill(profile.id);
    }
  } finally {
    runtime.stopAbort = null;
  }
}

/** Annule un arret differe et repasse le serveur en fonctionnement */
export function cancelStop(profileId: string): boolean {
  const runtime = runtimeOf(profileId);
  if (!runtime.stopAbort) return false;

  runtime.stopAbort.abort();
  runtime.stopAbort = null;
  setStatus(profileId, runtime.child ? 'running' : 'stopped');
  bus.log(profileId, 'manager', 'Arret annule.');
  return true;
}

export async function restart(profile: ServerProfile, options: StopOptions = {}): Promise<void> {
  if (runtimeOf(profile.id).child) {
    await stop(profile, options);
  }
  await start(profile);
}

interface CloseWait {
  /** Abandon apres ce silence, c'est-a-dire cette duree sans aucun signe d'activite */
  quietMs: number;
  /** Plafond absolu, pour qu'un journal bavard ne fasse pas attendre indefiniment */
  maxMs?: number;
  /** Journal dont l'ecriture atteste que le serveur travaille encore */
  activityFile?: string;
}

/**
 * \brief Attend la fermeture du serveur, en jugeant sur son activite.
 *
 * Une duree fixe est un mauvais critere : l'extinction d'ARK dure d'autant plus
 * longtemps que la carte est peuplee, et rien ne distingue un serveur lent d'un
 * serveur bloque sur la seule montre. Le journal, lui, fait la difference — tant
 * qu'il s'ecrit, le processus avance.
 */
async function waitForClose(profileId: string, wait: number | CloseWait): Promise<boolean> {
  const options: CloseWait = typeof wait === 'number' ? { quietMs: wait } : wait;
  const runtime = runtimeOf(profileId);

  // Le processus lance par le gestionnaire previent de sa fermeture ; celui qui
  // lui a survecu doit etre scrute. Les deux cas partagent la meme boucle pour
  // que le critere d'activite s'applique a l'un comme a l'autre.
  const child = runtime.child;
  let childClosed = false;
  child?.once('close', () => {
    childClosed = true;
  });

  const pid = child?.pid ?? runtime.externalPid;
  if (!child && pid === null) return true;

  const started = Date.now();
  let lastActivity = Date.now();
  let lastSize = await fileSize(options.activityFile);

  const gone = async (): Promise<boolean> => {
    if (child) return childClosed || child.exitCode !== null;
    return pid !== null && !(await isArkProcessAlive(pid));
  };

  while (true) {
    if (await gone()) {
      // Un processus lance par le gestionnaire a son propre gestionnaire de
      // fermeture, qui distingue deja un arret demande d'un plantage : le
      // doubler ici ecraserait cette nuance. Seul le processus repris, qui n'en
      // a pas, est nettoye ici.
      if (!child) {
        runtime.externalPid = null;
        await forgetPid(await requireProfileForPid(profileId)).catch(() => undefined);
        setStatus(profileId, 'stopped');
      }
      return true;
    }

    const size = await fileSize(options.activityFile);
    if (size !== lastSize) {
      lastSize = size;
      lastActivity = Date.now();
    }

    if (shouldGiveUpWaiting(Date.now(), started, lastActivity, options)) return false;

    await sleep(2_000);
  }
}

/**
 * \brief Traduit en clair une ligne de journal annoncant une panne connue.
 *
 * ARK signale certains refus au milieu de centaines de lignes techniques, puis
 * s'arrete sans que le gestionnaire ait rien a dire. L'administrateur n'a alors
 * qu'un serveur eteint et aucune explication.
 *
 * \return le message a afficher, ou null si la ligne n'annonce rien de notable.
 */
export function describeServerLogIssue(line: string): string | null {
  // Le projet existe au catalogue, mais aucun fichier n'y est publie : rien a
  // telecharger, ARK supprime le mod et renonce a demarrer.
  const unavailable = /Detected an unavailable mod:\s*(.+?)\s*\((\d+)\)/.exec(line);
  if (unavailable) {
    const [, name, id] = unavailable;
    return (
      `Le mod ${name} (${id}) n'a aucun fichier disponible sur CurseForge : le serveur va s'arreter. ` +
      "Publiez son fichier depuis votre espace CurseForge, ou retirez-le de l'onglet Mods pour redemarrer."
    );
  }

  // Identifiant absent du catalogue : la requete revient en 404
  if (/Error querying server mods/.test(line)) {
    return (
      "Un identifiant de mod est inconnu du catalogue CurseForge : le serveur va s'arreter. " +
      "ARK verifie chaque mod aupres du catalogue, un mod cuisine localement n'est donc pas installable."
    );
  }

  return null;
}

/**
 * \brief Faut-il cesser d'attendre la fermeture ?
 *
 * Isolee du reste pour etre eprouvee : c'est la regle qui a fait defaut, un
 * plafond fixe de 2 minutes ayant tue un serveur qui travaillait encore.
 */
export function shouldGiveUpWaiting(
  now: number,
  started: number,
  lastActivity: number,
  options: { quietMs: number; maxMs?: number },
): boolean {
  if (options.maxMs !== undefined && now - started > options.maxMs) return true;
  return now - lastActivity > options.quietMs;
}

/** Taille du journal, ou null s'il n'y en a pas : sert de temoin d'activite */
async function fileSize(file: string | undefined): Promise<number | null> {
  if (!file) return null;
  return fs
    .stat(file)
    .then((stats) => stats.size)
    .catch(() => null);
}

/** Le profil est necessaire pour effacer sa trace PID ; il est relu a la demande */
async function requireProfileForPid(profileId: string): Promise<ServerProfile> {
  const { requireProfile } = await import('./store.js');
  return requireProfile(profileId);
}

export async function forceKill(profileId: string): Promise<void> {
  const runtime = runtimeOf(profileId);
  const pid = runtime.child?.pid ?? runtime.externalPid;
  if (!pid) return;

  if (process.platform === 'win32') {
    // Le serveur engendre des processus enfants, AsaApiLoader en tete : /T les inclut
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    runtime.child?.kill('SIGKILL');
  }

  // `taskkill` rend la main avant que le processus ait disparu. Sans cette
  // reconciliation, l'etat restait fige sur 'stopping' et `externalPid` restait
  // renseigne : le profil devenait impossible a redemarrer, le demarrage etant
  // refuse par « Le serveur tourne deja ». Le signal ne suffit pas, c'est la
  // disparition constatee qui fait foi.
  await reconcileWhenGone(profileId, pid, 30_000);
}

/**
 * \brief Attend la disparition d'un processus et remet le profil a l'arret.
 *
 * Rendre la main sans avoir constate la disparition laisserait un etat mensonger
 * plutot qu'une erreur : le pire des deux.
 */
async function reconcileWhenGone(profileId: string, pid: number, timeoutMs: number): Promise<boolean> {
  const runtime = runtimeOf(profileId);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!(await isArkProcessAlive(pid))) {
      runtime.child = null;
      runtime.externalPid = null;
      await forgetPid(await requireProfileForPid(profileId)).catch(() => undefined);
      setStatus(profileId, 'stopped');
      return true;
    }

    await sleep(1_000);
  }

  // Le processus resiste : l'etat le dit, plutot que d'afficher un arret qui
  // n'a pas eu lieu
  setStatus(profileId, 'error', null);
  bus.log(profileId, 'manager',
    `Le processus ${pid} survit a la terminaison forcee. Verifiez-le dans le gestionnaire des taches.`, 'warn');
  return false;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Identifiants des profils dont le processus tourne encore */
export function runningProfiles(): string[] {
  return [...runtimes.entries()].filter(([, runtime]) => runtime.child).map(([id]) => id);
}

/**
 * Verifie qu'un PID correspond toujours a un serveur ARK vivant.
 *
 * `tasklist` filtre par PID et par nom d'image en ~100 ms. Le filtre de nom
 * protege de la reutilisation de PID par Windows : un identifiant recycle par
 * un autre programme ne sera pas pris pour un serveur.
 *
 * Une enumeration complete via `Get-CimInstance Win32_Process` avait ete
 * essayee : elle prend pres de six secondes, ce qui figeait le demarrage.
 */
function isArkProcessAlive(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    // Pas de filtre sur le nom d'image : le processus suivi est AsaApiLoader.exe
    // quand AsaApi est installe, et ArkAscendedServer.exe sinon
    const child = spawn('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { windowsHide: true });

    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });

    // Un diagnostic ne doit jamais empecher un demarrage legitime :
    // au moindre doute on considere qu'aucun serveur ne tourne
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 3_000);

    const finish = (alive: boolean) => {
      clearTimeout(timer);
      resolve(alive);
    };

    child.on('error', () => finish(false));
    child.on('close', () => finish(/ArkAscendedServer\.exe|AsaApiLoader\.exe/i.test(output)));
  });
}

function pidFile(profile: ServerProfile): string {
  return path.join(dataDir(), 'pids', `${profile.id}.pid`);
}

async function rememberPid(profile: ServerProfile, pid: number): Promise<void> {
  const target = pidFile(profile);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, String(pid), 'utf8').catch(() => undefined);
}

async function forgetPid(profile: ServerProfile): Promise<void> {
  await fs.unlink(pidFile(profile)).catch(() => undefined);
}

/**
 * Cherche un serveur lance par le gestionnaire qui lui aurait survecu.
 *
 * Le gestionnaire ne tue plus les serveurs quand il s'arrete : un processus peut
 * donc lui survivre. Sans ce controle, un second lancement produirait deux
 * serveurs sur les memes ports et sur les memes fichiers de sauvegarde.
 */
export async function findOrphanServerPid(profile: ServerProfile): Promise<number | null> {
  if (process.platform !== 'win32') return null;

  const raw = await fs.readFile(pidFile(profile), 'utf8').catch(() => null);
  if (raw === null) return null;

  const pid = Number(raw.trim());
  if (!Number.isInteger(pid) || pid <= 0) {
    await forgetPid(profile);
    return null;
  }

  if (await isArkProcessAlive(pid)) return pid;

  // Le processus est mort sans que le gestionnaire l'apprenne : trace obsolete
  await forgetPid(profile);
  return null;
}
