import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type {
  CustomItem,
  DinoFilter,
  ModEntry,
  ServerEvent,
  ServerProfile,
  GiveItemRequest,
  WildLevelSettings,
} from '../../../shared/types.js';
import {
  WildLevelsUnavailable,
  applyWildLevels,
  writeWildLevels,
} from '../services/wildLevels.js';
import { createBackup, deleteBackup, listBackups, restoreBackup } from '../services/backup.js';
import { bus } from '../services/events.js';
import {
  INI_FILES,
  discardPendingIni,
  isIniFileName,
  readIniDocument,
  readIniText,
  writeIniChanges,
  writeIniText,
} from '../services/iniFiles.js';
import { SETTINGS_CATALOG } from '../services/settingsCatalog.js';
import {
  announce,
  cancelStop,
  exec,
  forceKill,
  isBusy,
  listPlayers,
  refreshInstalledBuild,
  restart,
  setStatus,
  snapshot,
  start,
  stop,
} from '../services/serverProcess.js';
import { giveItem, listItems } from '../services/items.js';
import { addCustomItem, listCustomItems, removeCustomItem } from '../services/customItems.js';
import { clearPending, listKnownPlayers, listPending, queueDeliveries } from '../services/roster.js';
import {
  InspectUnavailable,
  listDinos,
  listPlayerDetails,
  playerContainers,
  playerInventory,
  playerStructures,
  readGameModeSettings,
} from '../services/inspect.js';
import { hasAsaApi } from '../services/paths.js';
import { applyUpdate, hasPendingUpdate } from '../services/scheduler.js';
import { installOrUpdate, isServerInstalled, readLatestBuildId } from '../services/steamcmd.js';
import {
  createProfile,
  deleteProfile,
  listProfiles,
  requireProfile,
  updateProfile,
} from '../services/store.js';

interface ProfileParams {
  id: string;
}

/** Resout le profil ou repond 404 ; retourne null quand la reponse est deja envoyee */
async function loadProfile(
  request: FastifyRequest<{ Params: ProfileParams }>,
  reply: FastifyReply,
): Promise<ServerProfile | null> {
  try {
    return await requireProfile(request.params.id);
  } catch {
    await reply.code(404).send({ error: 'Profil introuvable' });
    return null;
  }
}

/**
 * Les operations longues sont lancees en tache de fond : la reponse HTTP part
 * tout de suite et l'avancement remonte par le flux SSE.
 */
function runInBackground(profile: ServerProfile, label: string, work: () => Promise<void>): void {
  void work().catch((error: Error) => {
    bus.log(profile.id, 'manager', `${label} : ${error.message}`, 'error');
    setStatus(profile.id, 'error');
  });
}

export async function registerApi(app: FastifyInstance): Promise<void> {
  // --- Catalogue de reglages ---------------------------------------------

  app.get('/api/settings-catalog', async () => SETTINGS_CATALOG);

  // --- Profils ------------------------------------------------------------

  app.get('/api/profiles', async () => listProfiles());

  app.post<{ Body: { name?: string; installDir?: string } }>('/api/profiles', async (request, reply) => {
    const { name, installDir } = request.body ?? {};

    if (!name?.trim()) return reply.code(400).send({ error: 'Le nom est obligatoire' });

    // Dossier facultatif : sans lui, le service le derive du dossier par defaut
    // configure dans les reglages de l'application
    return createProfile({ name: name.trim(), installDir: installDir?.trim() || undefined });
  });

  app.get<{ Params: ProfileParams }>('/api/profiles/:id', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    await refreshInstalledBuild(profile);

    return {
      profile,
      runtime: snapshot(profile.id),
      installed: await isServerInstalled(profile),
      pendingUpdate: hasPendingUpdate(profile.id),
      asaApi: hasAsaApi(profile),
    };
  });

  app.patch<{ Params: ProfileParams; Body: Partial<ServerProfile> }>(
    '/api/profiles/:id',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      return updateProfile(profile.id, request.body ?? {});
    },
  );

  app.delete<{ Params: ProfileParams }>('/api/profiles/:id', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    if (snapshot(profile.id).status !== 'stopped') {
      return reply.code(409).send({ error: 'Arretez le serveur avant de supprimer le profil' });
    }

    await deleteProfile(profile.id);
    return { ok: true };
  });

  // --- Etat et journaux ---------------------------------------------------

  app.get<{ Params: ProfileParams }>('/api/profiles/:id/runtime', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    await refreshInstalledBuild(profile);
    return snapshot(profile.id);
  });

  app.get<{ Params: ProfileParams }>('/api/profiles/:id/logs', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    return bus.history(profile.id);
  });

  // --- Installation et mise a jour ---------------------------------------

  app.post<{ Params: ProfileParams }>('/api/profiles/:id/install', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    if (isBusy(profile.id)) return reply.code(409).send({ error: 'Une operation est deja en cours' });

    setStatus(profile.id, 'installing', 'Preparation de SteamCMD');
    runInBackground(profile, 'Installation', async () => {
      const result = await installOrUpdate(profile);
      bus.log(
        profile.id,
        'manager',
        result.alreadyUpToDate
          ? 'Serveur deja a jour.'
          : `Installation terminee (build ${result.buildId ?? 'inconnu'}).`,
      );

      // Comme pour la mise a jour : sans cette relecture, le setStatus suivant
      // rediffuse l'ancien build et l'interface annonce un retard revolu.
      await refreshInstalledBuild(profile);
      setStatus(profile.id, 'stopped');
    });

    return { started: true };
  });

  app.post<{ Params: ProfileParams }>('/api/profiles/:id/update', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    if (isBusy(profile.id)) return reply.code(409).send({ error: 'Une operation est deja en cours' });

    runInBackground(profile, 'Mise a jour', () => applyUpdate(profile));
    return { started: true };
  });

  app.get<{ Params: ProfileParams }>('/api/profiles/:id/latest-build', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    // Interroger Steam lance un SteamCMD de plus. Le faire pendant une
    // installation en ferait tourner deux sur le meme dossier, et laissait le
    // statut bloque sur « installing » avec toutes les actions grisees.
    if (isBusy(profile.id)) return reply.code(409).send({ error: 'Une operation est deja en cours' });

    return { buildId: await readLatestBuildId(profile.id) };
  });

  // --- Cycle de vie -------------------------------------------------------

  app.post<{ Params: ProfileParams }>('/api/profiles/:id/start', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    try {
      await start(profile);
      return { ok: true };
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: ProfileParams; Body: { immediate?: boolean; reason?: string } }>(
    '/api/profiles/:id/stop',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      const options = request.body ?? {};
      try {
        // L'arret peut durer plusieurs minutes a cause des preavis : on ne bloque pas la reponse
        runInBackground(profile, 'Arret', () => stop(profile, options));
        return { started: true };
      } catch (error) {
        return reply.code(409).send({ error: (error as Error).message });
      }
    },
  );

  app.post<{ Params: ProfileParams; Body: { immediate?: boolean } }>(
    '/api/profiles/:id/restart',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      runInBackground(profile, 'Redemarrage', () => restart(profile, request.body ?? {}));
      return { started: true };
    },
  );

  app.post<{ Params: ProfileParams }>('/api/profiles/:id/cancel-stop', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    return { cancelled: cancelStop(profile.id) };
  });

  app.post<{ Params: ProfileParams }>('/api/profiles/:id/kill', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    // Attendue : la reponse ne doit pas annoncer un arret que le processus
    // n'a pas encore subi
    await forceKill(profile.id);
    return { ok: true };
  });

  // --- RCON et joueurs ----------------------------------------------------

  app.get<{ Params: ProfileParams }>('/api/profiles/:id/players', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    try {
      return await listPlayers(profile);
    } catch (error) {
      return reply.code(503).send({ error: (error as Error).message });
    }
  });

  // --- Inspection detaillee (necessite le plugin AsaQoL) ------------------

  app.get<{
    Params: ProfileParams;
    Querystring: { filter?: string; species?: string; minLevel?: string; radius?: string; offset?: string; limit?: string };
  }>('/api/profiles/:id/dinos', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    const raw = request.query.filter;
    const filter: DinoFilter = raw === 'wild' || raw === 'all' ? raw : 'tamed';

    try {
      return await listDinos(profile, {
        filter,
        species: request.query.species ?? '',
        minLevel: Number(request.query.minLevel ?? 0),
        radius: Number(request.query.radius ?? 1_000_000),
        offset: Number(request.query.offset ?? 0),
        limit: Number(request.query.limit ?? 200),
      });
    } catch (error) {
      const code = error instanceof InspectUnavailable ? 501 : 503;
      return reply.code(code).send({ error: (error as Error).message });
    }
  });

  // --- Valeurs actives du mode de jeu -------------------------------------
  //
  // Lecture seule, servie par le plugin. Elle ne remplace pas les fichiers :
  // elle dit ce que le serveur en a retenu, ce qu'aucun fichier ne peut dire.
  app.get<{ Params: ProfileParams }>('/api/profiles/:id/gamemode', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    try {
      return { settings: await readGameModeSettings(profile) };
    } catch (error) {
      const code = error instanceof InspectUnavailable ? 501 : 503;
      return reply.code(code).send({ error: (error as Error).message });
    }
  });

  // --- Niveaux des creatures sauvages -------------------------------------
  //
  // Ces reglages ne sont pas ceux du jeu : ARK ne sait ni imposer un plancher
  // ni ponderer les niveaux. Ils vivent dans la configuration du plugin, d'ou
  // un chemin distinct de /ini.

  app.get<{ Params: ProfileParams }>('/api/profiles/:id/wild-levels', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    try {
      return await applyWildLevels(profile);
    } catch (error) {
      const code = error instanceof WildLevelsUnavailable ? 501 : 503;
      return reply.code(code).send({ error: (error as Error).message });
    }
  });

  app.put<{ Params: ProfileParams; Body: Partial<WildLevelSettings> }>(
    '/api/profiles/:id/wild-levels',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      try {
        return await writeWildLevels(profile, request.body ?? {});
      } catch (error) {
        const code = error instanceof WildLevelsUnavailable ? 501 : 503;
        return reply.code(code).send({ error: (error as Error).message });
      }
    },
  );

  // --- Catalogue d'objets et remise en jeu --------------------------------

  app.get<{
    Params: ProfileParams;
    Querystring: { search?: string; offset?: string; limit?: string; refresh?: string };
  }>(
    '/api/profiles/:id/items',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      try {
        return await listItems(profile, {
          search: request.query.search ?? '',
          offset: Number(request.query.offset ?? 0),
          limit: Number(request.query.limit ?? 100),
          refresh: request.query.refresh === '1',
        });
      } catch (error) {
        const code = error instanceof InspectUnavailable ? 501 : 503;
        return reply.code(code).send({ error: (error as Error).message });
      }
    },
  );

  app.post<{ Params: ProfileParams & { eosId: string }; Body: Partial<GiveItemRequest> }>(
    '/api/profiles/:id/players/:eosId/give',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      const body = request.body ?? {};
      try {
        return await giveItem(profile, request.params.eosId, {
          blueprint: body.blueprint ?? '',
          quantity: body.quantity ?? 1,
          quality: body.quality ?? 0,
          asBlueprint: Boolean(body.asBlueprint),
        });
      } catch (error) {
        const code = error instanceof InspectUnavailable ? 501 : 400;
        return reply.code(code).send({ error: (error as Error).message });
      }
    },
  );

  app.get<{ Params: ProfileParams }>('/api/profiles/:id/custom-items', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    return listCustomItems(profile.id);
  });

  app.post<{ Params: ProfileParams; Body: Partial<CustomItem> }>(
    '/api/profiles/:id/custom-items',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      try {
        return await addCustomItem(profile.id, request.body ?? {});
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    },
  );

  app.delete<{ Params: ProfileParams; Querystring: { blueprint?: string } }>(
    '/api/profiles/:id/custom-items',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      return removeCustomItem(profile.id, request.query.blueprint ?? '');
    },
  );

  // --- Registre des joueurs et remises differees ---------------------------

  app.get<{ Params: ProfileParams }>('/api/profiles/:id/roster', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    return listKnownPlayers(profile.id);
  });

  app.get<{ Params: ProfileParams & { eosId: string } }>(
    '/api/profiles/:id/players/:eosId/pending',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      return listPending(profile.id, request.params.eosId);
    },
  );

  app.post<{
    Params: ProfileParams & { eosId: string };
    Body: { items?: (GiveItemRequest & { name?: string })[] };
  }>('/api/profiles/:id/players/:eosId/pending', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    const items = request.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'Aucun objet a mettre en attente' });
    }

    return queueDeliveries(
      profile.id,
      request.params.eosId,
      items.map((item) => ({
        blueprint: String(item.blueprint ?? '').trim(),
        quantity: Math.min(10_000, Math.max(1, Math.round(Number(item.quantity) || 1))),
        quality: Math.min(100, Math.max(0, Number(item.quality) || 0)),
        asBlueprint: Boolean(item.asBlueprint),
        name: String(item.name ?? '').trim() || 'objet',
      })),
    );
  });

  app.delete<{ Params: ProfileParams & { eosId: string } }>(
    '/api/profiles/:id/players/:eosId/pending',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      await clearPending(profile.id, request.params.eosId);
      return { ok: true };
    },
  );

  app.get<{ Params: ProfileParams }>('/api/profiles/:id/player-details', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    try {
      return await listPlayerDetails(profile);
    } catch (error) {
      const code = error instanceof InspectUnavailable ? 501 : 503;
      return reply.code(code).send({ error: (error as Error).message });
    }
  });

  app.get<{ Params: ProfileParams & { eosId: string } }>(
    '/api/profiles/:id/players/:eosId/inventory',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      try {
        return await playerInventory(profile, request.params.eosId);
      } catch (error) {
        const code = error instanceof InspectUnavailable ? 501 : 503;
        return reply.code(code).send({ error: (error as Error).message });
      }
    },
  );

  app.get<{ Params: ProfileParams & { eosId: string }; Querystring: { radius?: string } }>(
    '/api/profiles/:id/players/:eosId/containers',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      try {
        return await playerContainers(profile, request.params.eosId, Number(request.query.radius ?? 30000));
      } catch (error) {
        const code = error instanceof InspectUnavailable ? 501 : 503;
        return reply.code(code).send({ error: (error as Error).message });
      }
    },
  );

  app.get<{ Params: ProfileParams & { eosId: string }; Querystring: { radius?: string } }>(
    '/api/profiles/:id/players/:eosId/structures',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      try {
        return await playerStructures(profile, request.params.eosId, Number(request.query.radius ?? 30000));
      } catch (error) {
        const code = error instanceof InspectUnavailable ? 501 : 503;
        return reply.code(code).send({ error: (error as Error).message });
      }
    },
  );

  app.post<{ Params: ProfileParams; Body: { message?: string; seconds?: number } }>(
    '/api/profiles/:id/announce',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      const message = request.body?.message?.trim();
      if (!message) return reply.code(400).send({ error: 'Message vide' });

      const seconds = Number(request.body?.seconds ?? 60);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return reply.code(400).send({ error: 'Duree invalide' });
      }

      try {
        return await announce(profile, message, seconds);
      } catch (error) {
        return reply.code(503).send({ error: (error as Error).message });
      }
    },
  );

  app.post<{ Params: ProfileParams; Body: { command?: string } }>(
    '/api/profiles/:id/rcon',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      const command = request.body?.command?.trim();
      if (!command) return reply.code(400).send({ error: 'Commande vide' });

      try {
        return { command, response: await exec(profile, command) };
      } catch (error) {
        return reply.code(503).send({ error: (error as Error).message });
      }
    },
  );

  // --- Configuration INI --------------------------------------------------

  app.get('/api/ini-files', async () => INI_FILES);

  app.get<{ Params: ProfileParams & { file: string } }>(
    '/api/profiles/:id/ini/:file',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      const file = request.params.file;
      if (!isIniFileName(file)) return reply.code(400).send({ error: 'Fichier inconnu' });

      return {
        document: await readIniDocument(profile, file),
        text: await readIniText(profile, file),
      };
    },
  );

  app.put<{
    Params: ProfileParams & { file: string };
    Body: {
      changes?: { section: string; key: string; occurrence: number; value: string | null }[];
      additions?: { section: string; key: string; value: string }[];
      text?: string;
    };
  }>('/api/profiles/:id/ini/:file', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    const file = request.params.file;
    if (!isIniFileName(file)) return reply.code(400).send({ error: 'Fichier inconnu' });

    const body = request.body ?? {};

    // L'edition brute remplace tout ; sinon on applique un lot cible
    if (typeof body.text === 'string') {
      return writeIniText(profile, file, body.text);
    }

    return writeIniChanges(profile, file, body.changes ?? [], body.additions ?? []);
  });

  app.delete<{ Params: ProfileParams & { file: string } }>(
    '/api/profiles/:id/ini/:file/pending',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      const file = request.params.file;
      if (!isIniFileName(file)) return reply.code(400).send({ error: 'Fichier inconnu' });

      await discardPendingIni(profile, file);
      return { ok: true };
    },
  );

  // --- Mods ---------------------------------------------------------------

  app.get<{ Params: ProfileParams }>('/api/profiles/:id/mods', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    return profile.mods;
  });

  app.put<{ Params: ProfileParams; Body: { mods?: ModEntry[] } }>(
    '/api/profiles/:id/mods',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      const mods = request.body?.mods;
      if (!Array.isArray(mods)) return reply.code(400).send({ error: 'Liste de mods attendue' });

      const cleaned: ModEntry[] = [];
      const seen = new Set<string>();

      for (const mod of mods) {
        const id = String(mod?.id ?? '').trim();

        // Un mod de CurseForge porte un numero de projet, un mod cuisine
        // localement porte le nom de son dossier sous ShooterGame\Mods : les
        // deux formes sont legitimes. Un identifiant refuse fait echouer la
        // requete au lieu d'etre ecarte en silence, faute de quoi le mod
        // disparaissait de la liste sans le moindre message.
        if (!/^[A-Za-z0-9_-]+$/.test(id)) {
          return reply.code(400).send({
            error: `Identifiant de mod invalide : « ${id} ». Attendu : un numero de projet CurseForge, ou le nom du dossier d'un mod installe a la main.`,
          });
        }

        if (seen.has(id)) continue;

        seen.add(id);
        cleaned.push({ id, name: mod.name?.trim() || undefined, enabled: mod.enabled !== false });
      }

      const updated = await updateProfile(profile.id, { mods: cleaned });
      bus.log(profile.id, 'manager', `Liste de mods enregistree (${cleaned.length}). Actif au prochain demarrage.`);

      return updated.mods;
    },
  );

  // --- Sauvegardes --------------------------------------------------------

  app.get<{ Params: ProfileParams }>('/api/profiles/:id/backups', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    return listBackups(profile);
  });

  app.post<{ Params: ProfileParams }>('/api/profiles/:id/backups', async (request, reply) => {
    const profile = await loadProfile(request, reply);
    if (!profile) return;

    try {
      return await createBackup(profile);
    } catch (error) {
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: ProfileParams & { name: string } }>(
    '/api/profiles/:id/backups/:name/restore',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      try {
        await restoreBackup(profile, request.params.name);
        return { ok: true };
      } catch (error) {
        return reply.code(409).send({ error: (error as Error).message });
      }
    },
  );

  app.delete<{ Params: ProfileParams & { name: string } }>(
    '/api/profiles/:id/backups/:name',
    async (request, reply) => {
      const profile = await loadProfile(request, reply);
      if (!profile) return;

      try {
        await deleteBackup(profile, request.params.name);
        return { ok: true };
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    },
  );

  // --- Flux d'evenements --------------------------------------------------

  app.get('/api/events', (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Desactive la mise en tampon d'un eventuel proxy place devant
      'X-Accel-Buffering': 'no',
    });

    const send = (event: ServerEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    bus.on('event', send);

    // Commentaire periodique : maintient la connexion ouverte a travers les proxys
    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      bus.off('event', send);
    });
  });
}
