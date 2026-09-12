import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import type { User, UserRole } from '../../../shared/types.js';
import { dataDir } from './paths.js';
import { loadSettings } from './settings.js';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/** Adresse proposee a la premiere configuration ; le mot de passe est choisi par l'utilisateur */
export const SUGGESTED_ADMIN_EMAIL = 'sylvain@monheure.fr';

export const MIN_PASSWORD_LENGTH = 10;

/** Parametres scrypt : cout memoire ~16 Mo, suffisant pour un outil local */
const SCRYPT = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;

export class AuthError extends Error {}

interface StoredUser extends User {
  passwordHash: string;
}

interface Session {
  userId: string;
  expiresAt: number;
}

/**
 * Sessions gardees en memoire : elles disparaissent au redemarrage du service,
 * ce qui force une reconnexion. C'est volontaire, un jeton persiste sur disque
 * serait un secret de plus a proteger pour un gain faible sur un outil local.
 */
const sessions = new Map<string, Session>();

let cache: StoredUser[] | null = null;

function usersFile(): string {
  return path.join(dataDir(), 'users.json');
}

async function readAll(): Promise<StoredUser[]> {
  if (cache) return cache;

  try {
    const raw = await fs.readFile(usersFile(), 'utf8');
    const parsed = JSON.parse(raw) as { users?: StoredUser[] };
    cache = Array.isArray(parsed.users) ? parsed.users : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Un fichier illisible ne doit pas etre remplace par une liste vide :
      // cela reouvrirait la premiere configuration et donnerait un admin a qui passe
      throw new Error(`users.json illisible : ${(error as Error).message}`);
    }
    cache = [];
  }

  return cache;
}

async function writeAll(users: StoredUser[]): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });

  const target = usersFile();
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ users }, null, 2), 'utf8');
  await fs.rename(temp, target);

  cache = users;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;

  const cost = Number(parts[1]);
  const salt = Buffer.from(parts[2]!, 'base64');
  const expected = Buffer.from(parts[3]!, 'base64');
  if (!Number.isFinite(cost) || expected.length !== KEY_LENGTH) return false;

  const derived = await scryptAsync(password, salt, KEY_LENGTH, { ...SCRYPT, N: cost });

  // Comparaison a temps constant : une comparaison naive fuiterait le hachage
  return timingSafeEqual(derived, expected);
}

function publicView(user: StoredUser): User {
  const { passwordHash: _ignored, ...rest } = user;
  return rest;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
}

function assertEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('Adresse electronique invalide.');
  }
}

export async function countUsers(): Promise<number> {
  return (await readAll()).length;
}

export async function needsSetup(): Promise<boolean> {
  return (await countUsers()) === 0;
}

export async function listUsers(): Promise<User[]> {
  return (await readAll()).map(publicView);
}

export async function getUser(id: string): Promise<User | null> {
  const user = (await readAll()).find((entry) => entry.id === id);
  return user ? publicView(user) : null;
}

export async function createUser(email: string, password: string, role: UserRole): Promise<User> {
  const users = await readAll();
  const normalised = normaliseEmail(email);

  assertEmail(normalised);
  assertPassword(password);

  if (users.some((user) => user.email === normalised)) {
    throw new AuthError('Un compte existe deja avec cette adresse.');
  }

  const user: StoredUser = {
    id: randomUUID(),
    email: normalised,
    role,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    passwordHash: await hashPassword(password),
  };

  await writeAll([...users, user]);
  return publicView(user);
}

/**
 * Cree le tout premier compte, forcement administrateur.
 * Refuse si un compte existe deja, sans quoi n'importe qui pourrait s'octroyer
 * un acces administrateur en rejouant la premiere configuration.
 */
export async function setupFirstAdmin(email: string, password: string): Promise<User> {
  if (!(await needsSetup())) {
    throw new AuthError('La configuration initiale a deja ete effectuee.');
  }

  return createUser(email, password, 'admin');
}

export async function updateUser(
  id: string,
  patch: { email?: string; role?: UserRole },
): Promise<User> {
  const users = await readAll();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) throw new AuthError('Compte introuvable.');

  const current = users[index]!;
  const next: StoredUser = { ...current };

  if (patch.email !== undefined) {
    const normalised = normaliseEmail(patch.email);
    assertEmail(normalised);

    if (users.some((user) => user.email === normalised && user.id !== id)) {
      throw new AuthError('Un compte existe deja avec cette adresse.');
    }
    next.email = normalised;
  }

  if (patch.role !== undefined && patch.role !== current.role) {
    // Retrograder le dernier administrateur rendrait la gestion des comptes inaccessible
    if (current.role === 'admin' && countAdmins(users) === 1) {
      throw new AuthError('Ce compte est le dernier administrateur : son role ne peut pas changer.');
    }
    next.role = patch.role;
  }

  const updated = [...users];
  updated[index] = next;
  await writeAll(updated);

  return publicView(next);
}

/** Verifie le mot de passe d'un compte identifie, sans ouvrir de session */
export async function verifyUserPassword(id: string, password: string): Promise<boolean> {
  const user = (await readAll()).find((entry) => entry.id === id);
  if (!user) return false;

  return verifyPassword(password, user.passwordHash);
}

export async function setPassword(id: string, password: string): Promise<void> {
  assertPassword(password);

  const users = await readAll();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) throw new AuthError('Compte introuvable.');

  const updated = [...users];
  updated[index] = { ...users[index]!, passwordHash: await hashPassword(password) };
  await writeAll(updated);

  // Un changement de mot de passe invalide les sessions ouvertes de ce compte
  destroyUserSessions(id);
}

export async function deleteUser(id: string): Promise<void> {
  const users = await readAll();
  const target = users.find((user) => user.id === id);
  if (!target) throw new AuthError('Compte introuvable.');

  if (target.role === 'admin' && countAdmins(users) === 1) {
    throw new AuthError('Impossible de supprimer le dernier administrateur.');
  }

  await writeAll(users.filter((user) => user.id !== id));
  destroyUserSessions(id);
}

function countAdmins(users: StoredUser[]): number {
  return users.filter((user) => user.role === 'admin').length;
}

export interface LoginResult {
  token: string;
  user: User;
  expiresAt: Date;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const users = await readAll();
  const normalised = normaliseEmail(email);
  const user = users.find((entry) => entry.email === normalised);

  // Un mot de passe est verifie meme sans compte correspondant, pour que la
  // duree de reponse ne revele pas quelles adresses existent
  const hash = user?.passwordHash ?? (await placeholderHash());
  const valid = await verifyPassword(password, hash);

  if (!user || !valid) {
    throw new AuthError('Adresse ou mot de passe incorrect.');
  }

  const settings = await loadSettings();
  const expiresAt = new Date(Date.now() + settings.sessionHours * 3_600_000);
  const token = randomBytes(32).toString('base64url');

  sessions.set(token, { userId: user.id, expiresAt: expiresAt.getTime() });

  const index = users.findIndex((entry) => entry.id === user.id);
  const updated = [...users];
  updated[index] = { ...user, lastLoginAt: new Date().toISOString() };
  await writeAll(updated);

  return { token, user: publicView(updated[index]!), expiresAt };
}

let cachedPlaceholder: string | null = null;

/** Hachage factice servant a egaliser le temps de reponse d'une connexion echouee */
async function placeholderHash(): Promise<string> {
  cachedPlaceholder ??= await hashPassword(randomBytes(16).toString('hex'));
  return cachedPlaceholder;
}

export async function resolveSession(token: string | undefined): Promise<{ user: User; expiresAt: Date } | null> {
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  const user = await getUser(session.userId);
  if (!user) {
    // Le compte a ete supprime pendant que la session courait
    sessions.delete(token);
    return null;
  }

  return { user, expiresAt: new Date(session.expiresAt) };
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

export function destroyUserSessions(userId: string): void {
  for (const [token, session] of sessions) {
    if (session.userId === userId) sessions.delete(token);
  }
}

/** Purge les sessions expirees, appelee periodiquement */
export function pruneSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

export function resetUsersCache(): void {
  cache = null;
  sessions.clear();
}
