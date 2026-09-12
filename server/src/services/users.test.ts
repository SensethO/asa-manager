import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Isole le stockage avant tout import : dataDir() lit cette variable a chaque appel
const TEMP_ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'asa-users-'));
process.env.ASA_MANAGER_DATA = TEMP_ROOT;

const {
  AuthError,
  createUser,
  deleteUser,
  destroySession,
  hashPassword,
  listUsers,
  login,
  needsSetup,
  resetUsersCache,
  resolveSession,
  setPassword,
  setupFirstAdmin,
  updateUser,
  verifyPassword,
} = await import('./users.js');

const ADMIN = 'sylvain@monheure.fr';
const PASSWORD = 'motdepasse-solide';

before(async () => {
  await fs.mkdir(TEMP_ROOT, { recursive: true });
});

beforeEach(async () => {
  await fs.rm(path.join(TEMP_ROOT, 'users.json'), { force: true });
  resetUsersCache();
});

test('un mot de passe hache se verifie, un autre echoue', async () => {
  const hash = await hashPassword(PASSWORD);

  assert.equal(await verifyPassword(PASSWORD, hash), true);
  assert.equal(await verifyPassword('autre-mot-de-passe', hash), false);
});

test('deux hachages du meme mot de passe different (sel aleatoire)', async () => {
  assert.notEqual(await hashPassword(PASSWORD), await hashPassword(PASSWORD));
});

test('un hachage malforme est rejete sans lever d exception', async () => {
  assert.equal(await verifyPassword(PASSWORD, 'nimportequoi'), false);
  assert.equal(await verifyPassword(PASSWORD, 'scrypt$16384$abc'), false);
});

test('le fichier ne contient jamais le mot de passe en clair', async () => {
  await setupFirstAdmin(ADMIN, PASSWORD);

  const raw = await fs.readFile(path.join(TEMP_ROOT, 'users.json'), 'utf8');
  assert.ok(!raw.includes(PASSWORD));
  assert.match(raw, /scrypt\$/);
});

test('la premiere configuration est requise tant qu aucun compte n existe', async () => {
  assert.equal(await needsSetup(), true);

  await setupFirstAdmin(ADMIN, PASSWORD);
  assert.equal(await needsSetup(), false);
});

test('le premier compte est administrateur', async () => {
  const user = await setupFirstAdmin(ADMIN, PASSWORD);
  assert.equal(user.role, 'admin');
  assert.equal(user.email, ADMIN);
});

test('la premiere configuration ne peut pas etre rejouee', async () => {
  await setupFirstAdmin(ADMIN, PASSWORD);

  await assert.rejects(() => setupFirstAdmin('pirate@exemple.fr', PASSWORD), AuthError);
});

test('un mot de passe trop court est refuse', async () => {
  await assert.rejects(() => setupFirstAdmin(ADMIN, 'court'), /au moins 10/);
});

test('une adresse invalide est refusee', async () => {
  await assert.rejects(() => setupFirstAdmin('pas-une-adresse', PASSWORD), /invalide/);
});

test('deux comptes ne peuvent pas partager une adresse', async () => {
  await setupFirstAdmin(ADMIN, PASSWORD);

  await assert.rejects(() => createUser(ADMIN.toUpperCase(), PASSWORD, 'viewer'), /existe deja/);
});

test('l adresse est normalisee en minuscules', async () => {
  const user = await setupFirstAdmin('Sylvain@MonHeure.FR', PASSWORD);
  assert.equal(user.email, ADMIN);

  // La connexion accepte donc n'importe quelle casse
  const result = await login('SYLVAIN@monheure.fr', PASSWORD);
  assert.equal(result.user.email, ADMIN);
});

test('la connexion ouvre une session resolvable', async () => {
  const created = await setupFirstAdmin(ADMIN, PASSWORD);
  const result = await login(ADMIN, PASSWORD);

  const session = await resolveSession(result.token);
  assert.equal(session?.user.id, created.id);
  assert.ok(session!.expiresAt.getTime() > Date.now());
});

test('un mauvais mot de passe est refuse', async () => {
  await setupFirstAdmin(ADMIN, PASSWORD);
  await assert.rejects(() => login(ADMIN, 'mauvais-mot-de-passe'), /incorrect/);
});

test('un compte inexistant donne le meme message qu un mot de passe errone', async () => {
  await setupFirstAdmin(ADMIN, PASSWORD);

  const inconnu = await login('absent@exemple.fr', PASSWORD).catch((error: Error) => error.message);
  const errone = await login(ADMIN, 'mauvais-mot-de-passe').catch((error: Error) => error.message);

  assert.equal(inconnu, errone);
});

test('un jeton inconnu ou detruit ne resout aucune session', async () => {
  await setupFirstAdmin(ADMIN, PASSWORD);
  const { token } = await login(ADMIN, PASSWORD);

  assert.equal(await resolveSession('jeton-invente'), null);
  assert.equal(await resolveSession(undefined), null);

  destroySession(token);
  assert.equal(await resolveSession(token), null);
});

test('changer le mot de passe ferme les sessions ouvertes', async () => {
  const admin = await setupFirstAdmin(ADMIN, PASSWORD);
  const { token } = await login(ADMIN, PASSWORD);

  await setPassword(admin.id, 'un-nouveau-mot-de-passe');

  assert.equal(await resolveSession(token), null);
  await assert.rejects(() => login(ADMIN, PASSWORD), /incorrect/);
  assert.ok((await login(ADMIN, 'un-nouveau-mot-de-passe')).token);
});

test('le dernier administrateur ne peut etre ni retrograde ni supprime', async () => {
  const admin = await setupFirstAdmin(ADMIN, PASSWORD);

  await assert.rejects(() => updateUser(admin.id, { role: 'viewer' }), /dernier administrateur/);
  await assert.rejects(() => deleteUser(admin.id), /dernier administrateur/);
});

test('avec un second administrateur, le premier redevient modifiable', async () => {
  const admin = await setupFirstAdmin(ADMIN, PASSWORD);
  await createUser('second@exemple.fr', PASSWORD, 'admin');

  const updated = await updateUser(admin.id, { role: 'operator' });
  assert.equal(updated.role, 'operator');
});

test('supprimer un compte ferme sa session', async () => {
  await setupFirstAdmin(ADMIN, PASSWORD);
  const viewer = await createUser('lecteur@exemple.fr', PASSWORD, 'viewer');
  const { token } = await login('lecteur@exemple.fr', PASSWORD);

  assert.ok(await resolveSession(token));

  await deleteUser(viewer.id);
  assert.equal(await resolveSession(token), null);
});

test('la liste des comptes n expose aucun hachage', async () => {
  await setupFirstAdmin(ADMIN, PASSWORD);
  const users = await listUsers();

  assert.equal(users.length, 1);
  assert.ok(!('passwordHash' in users[0]!));
});
