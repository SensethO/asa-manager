import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';

import { registerJsonBodyParser } from './plugins/jsonBody.js';
import { registerApi } from './routes/api.js';
import { registerAuth } from './routes/auth.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { runningProfiles } from './services/serverProcess.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Emplacement de l'interface compilee par Vite.
 *
 * Deux dispositions coexistent : execute depuis les sources (`server/src`), le
 * dossier voisin convient ; execute depuis la compilation (`dist/server/src`),
 * il faut remonter jusqu'a l'arborescence du projet, ou Vite ecrit reellement.
 * On retient le premier chemin contenant index.html.
 */
function findPublicDir(): string | null {
  const candidates = [
    path.resolve(here, '../public'),
    path.resolve(process.cwd(), 'server/public'),
    path.resolve(here, '../../../server/public'),
  ];

  return candidates.find((candidate) => existsSync(path.join(candidate, 'index.html'))) ?? null;
}

const PORT = Number(process.env.ASA_MANAGER_PORT ?? 8477);
/**
 * Par defaut le gestionnaire n'ecoute que sur la boucle locale : profils et
 * mots de passe administrateur y sont stockes en clair, et l'API n'a aucune
 * authentification. Ouvrir sur le reseau demande un choix explicite.
 */
const HOST = process.env.ASA_MANAGER_HOST ?? '127.0.0.1';

const app = Fastify({
  logger: { level: process.env.ASA_MANAGER_LOG_LEVEL ?? 'info' },
});

registerJsonBodyParser(app);

await app.register(fastifyCookie);

// registerAuth installe la garde globale : elle doit exister avant que la
// moindre route metier soit servie
await registerAuth(app);
await registerApi(app);

// L'interface compilee par Vite. En developpement elle n'existe pas : Vite la
// sert lui-meme et relaie /api vers ce serveur, il ne faut donc pas echouer ici.
const publicDir = findPublicDir();

if (publicDir) {
  // `wildcard: false` declarerait une route par fichier present au demarrage :
  // les assets produits par une reconstruction ulterieure ne seraient plus
  // servis et retomberaient sur l'application React, qui repond du HTML la ou
  // le navigateur attend du JavaScript — page blanche et erreur de type MIME.
  // La resolution a la demande evite d'imposer un redemarrage apres chaque build.
  await app.register(fastifyStatic, { root: publicDir });
  app.log.info(`Interface servie depuis ${publicDir}`);
} else {
  app.log.warn("Interface compilee introuvable : lancez 'npm run build', ou utilisez 'npm run dev'.");
}

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith('/api/') || !publicDir) {
    return reply.code(404).send({ error: 'Route inconnue' });
  }
  // Toute autre route retombe sur l'application React
  return reply.sendFile('index.html');
});

startScheduler();

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;

  app.log.info(`${signal} recu, arret du gestionnaire.`);
  stopScheduler();

  // Les serveurs ASA ne sont volontairement PAS arretes ici. Tuer une partie en
  // cours parce que le gestionnaire redemarre — mise a jour du code, rechargement
  // a chaud en developpement — ferait perdre aux joueurs tout ce qui n'a pas ete
  // sauvegarde. Les processus survivent donc au gestionnaire ; celui-ci refuse
  // simplement de relancer un serveur deja actif (voir start()).
  const running = runningProfiles();
  if (running.length > 0) {
    app.log.info(`${running.length} serveur(s) laisse(s) en fonctionnement : ${running.join(', ')}`);
  }

  await app.close();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Gestionnaire ASA disponible sur http://${HOST}:${PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
