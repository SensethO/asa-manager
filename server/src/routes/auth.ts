import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppSettings, User, UserRole } from '../../../shared/types.js';
import { loadSettings, saveSettings } from '../services/settings.js';
import {
  AuthError,
  SUGGESTED_ADMIN_EMAIL,
  createUser,
  deleteUser,
  destroySession,
  listUsers,
  login,
  needsSetup,
  pruneSessions,
  resolveSession,
  setPassword,
  setupFirstAdmin,
  updateUser,
  verifyUserPassword,
} from '../services/users.js';

const COOKIE = 'asa_session';

/** Routes accessibles sans session : sans elles, personne ne pourrait se connecter */
const PUBLIC_PATHS = new Set(['/api/auth/state', '/api/auth/setup', '/api/auth/login']);

/** Routes reservees aux administrateurs, quelle que soit la methode */
function requiresAdmin(method: string, pathname: string): boolean {
  if (pathname.startsWith('/api/users')) return true;
  if (pathname === '/api/settings' && method !== 'GET') return true;
  return false;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Renseigne par la garde globale pour toute requete authentifiee */
    currentUser?: User;
  }
}

const ROLES: UserRole[] = ['admin', 'operator', 'viewer'];

function isRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorateRequest('currentUser', undefined);

  // Purge periodique : sans elle les sessions expirees s'accumulent en memoire
  const pruneTimer = setInterval(pruneSessions, 15 * 60_000);
  app.addHook('onClose', async () => clearInterval(pruneTimer));

  // --- Garde globale -------------------------------------------------------

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '';

    // Les fichiers de l'interface restent servis : c'est elle qui affiche
    // l'ecran de connexion, elle ne peut pas etre derriere l'authentification
    if (!pathname.startsWith('/api/')) return;
    if (PUBLIC_PATHS.has(pathname)) return;

    const session = await resolveSession(request.cookies[COOKIE]);
    if (!session) {
      return reply.code(401).send({ error: 'Authentification requise' });
    }

    request.currentUser = session.user;

    if (requiresAdmin(request.method, pathname) && session.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Reserve aux administrateurs' });
    }

    // Un lecteur ne peut rien modifier, y compris demarrer ou arreter un serveur
    const mutating = request.method !== 'GET' && request.method !== 'HEAD';
    if (mutating && session.user.role === 'viewer') {
      return reply.code(403).send({ error: 'Votre compte est en consultation seule' });
    }
  });

  // --- Authentification ----------------------------------------------------

  app.get('/api/auth/state', async (request) => {
    const session = await resolveSession(request.cookies[COOKIE]);

    return {
      needsSetup: await needsSetup(),
      suggestedAdminEmail: SUGGESTED_ADMIN_EMAIL,
      session: session
        ? { user: session.user, expiresAt: session.expiresAt.toISOString() }
        : null,
    };
  });

  app.post<{ Body: { email?: string; password?: string } }>('/api/auth/setup', async (request, reply) => {
    const { email, password } = request.body ?? {};
    if (!email || !password) {
      return reply.code(400).send({ error: 'Adresse et mot de passe requis' });
    }

    try {
      const user = await setupFirstAdmin(email, password);

      // Connexion immediate : l'utilisateur vient de choisir ce mot de passe
      const result = await login(email, password);
      setSessionCookie(reply, result.token, result.expiresAt);

      return { user, expiresAt: result.expiresAt.toISOString() };
    } catch (error) {
      return replyAuthError(reply, error);
    }
  });

  app.post<{ Body: { email?: string; password?: string } }>('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body ?? {};
    if (!email || !password) {
      return reply.code(400).send({ error: 'Adresse et mot de passe requis' });
    }

    try {
      const result = await login(email, password);
      setSessionCookie(reply, result.token, result.expiresAt);

      return { user: result.user, expiresAt: result.expiresAt.toISOString() };
    } catch (error) {
      // 401 et non 400 : l'interface doit pouvoir distinguer un refus d'un champ manquant
      if (error instanceof AuthError) return reply.code(401).send({ error: error.message });
      throw error;
    }
  });

  app.post('/api/auth/logout', async (request, reply) => {
    destroySession(request.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post<{ Body: { currentPassword?: string; newPassword?: string } }>(
    '/api/auth/password',
    async (request, reply) => {
      const user = request.currentUser!;
      const { currentPassword, newPassword } = request.body ?? {};

      if (!currentPassword || !newPassword) {
        return reply.code(400).send({ error: 'Mot de passe actuel et nouveau mot de passe requis' });
      }

      if (!(await verifyUserPassword(user.id, currentPassword))) {
        return reply.code(401).send({ error: 'Mot de passe actuel incorrect' });
      }

      try {
        await setPassword(user.id, newPassword);
        // setPassword ferme toutes les sessions du compte, celle-ci comprise
        reply.clearCookie(COOKIE, { path: '/' });
        return { ok: true, reconnectRequired: true };
      } catch (error) {
        return replyAuthError(reply, error);
      }
    },
  );

  // --- Gestion des comptes (administrateurs) -------------------------------

  app.get('/api/users', async () => listUsers());

  app.post<{ Body: { email?: string; password?: string; role?: string } }>(
    '/api/users',
    async (request, reply) => {
      const { email, password, role } = request.body ?? {};

      if (!email || !password) return reply.code(400).send({ error: 'Adresse et mot de passe requis' });
      if (!isRole(role)) return reply.code(400).send({ error: 'Role invalide' });

      try {
        return await createUser(email, password, role);
      } catch (error) {
        return replyAuthError(reply, error);
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: { email?: string; role?: string } }>(
    '/api/users/:id',
    async (request, reply) => {
      const { email, role } = request.body ?? {};
      if (role !== undefined && !isRole(role)) return reply.code(400).send({ error: 'Role invalide' });

      try {
        return await updateUser(request.params.id, { email, role: role as UserRole | undefined });
      } catch (error) {
        return replyAuthError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { password?: string } }>(
    '/api/users/:id/password',
    async (request, reply) => {
      const password = request.body?.password;
      if (!password) return reply.code(400).send({ error: 'Mot de passe requis' });

      try {
        await setPassword(request.params.id, password);
        return { ok: true };
      } catch (error) {
        return replyAuthError(reply, error);
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/users/:id', async (request, reply) => {
    if (request.params.id === request.currentUser?.id) {
      return reply.code(400).send({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    try {
      await deleteUser(request.params.id);
      return { ok: true };
    } catch (error) {
      return replyAuthError(reply, error);
    }
  });

  // --- Reglages de l'application ------------------------------------------

  app.get('/api/settings', async () => loadSettings());

  app.put<{ Body: Partial<AppSettings> }>('/api/settings', async (request, reply) => {
    try {
      return await saveSettings(request.body ?? {});
    } catch (error) {
      return replyAuthError(reply, error);
    }
  });
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    expires: expiresAt,
    // secure reste desactive : l'outil est servi en HTTP sur la boucle locale.
    // Derriere un reverse proxy TLS, activez-le via ASA_MANAGER_SECURE_COOKIE.
    secure: process.env.ASA_MANAGER_SECURE_COOKIE === 'true',
  });
}

function replyAuthError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof AuthError) return reply.code(400).send({ error: error.message });
  throw error;
}

export type { FastifyRequest };
