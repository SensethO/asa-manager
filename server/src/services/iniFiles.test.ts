import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ServerProfile } from '../../../shared/types.js';
import { syncProfileToIni } from './iniFiles.js';

const ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'asa-ini-'));

function makeProfile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: 'test',
    name: 'Test',
    installDir: ROOT,
    map: 'TheIsland_WP',
    sessionName: 'Ma Session',
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    maxPlayers: 70,
    adminPassword: 'motdepasse-admin',
    serverPassword: '',
    rconEnabled: true,
    clusterId: '',
    mods: [],
    extraArgs: [],
    restart: { enabled: false, dailyTimes: [], warningMinutes: [] },
    update: { enabled: false, checkIntervalMinutes: 60, onlyOnScheduledRestart: true },
    backup: { enabled: false, intervalMinutes: 60, retain: 5, targetDir: '' },
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function iniPath(): string {
  return path.join(ROOT, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', 'GameUserSettings.ini');
}

async function writeIni(content: string): Promise<void> {
  await fs.mkdir(path.dirname(iniPath()), { recursive: true });
  await fs.writeFile(iniPath(), content, 'utf8');
}

async function readIni(): Promise<string> {
  return fs.readFile(iniPath(), 'utf8');
}

beforeEach(async () => {
  await fs.rm(path.join(ROOT, 'ShooterGame'), { recursive: true, force: true });
});

test('un mot de passe vide dans le profil efface celui reste dans le fichier', async () => {
  // Le cas reel : le serveur avait ecrit ServerPassword=admin en s'arretant,
  // l'interface affichait un champ vide, et le serveur restait protege
  await writeIni(['[ServerSettings]', 'ServerPassword=admin', 'ServerAdminPassword=admin', ''].join('\r\n'));

  const reconciled = await syncProfileToIni(makeProfile({ serverPassword: '' }));

  assert.ok(reconciled.includes('ServerPassword'));
  assert.match(await readIni(), /^ServerPassword=$/m);
});

test('un mot de passe defini dans le profil est ecrit dans le fichier', async () => {
  await writeIni(['[ServerSettings]', 'ServerPassword=ancien', ''].join('\r\n'));

  await syncProfileToIni(makeProfile({ serverPassword: 'nouveau' }));

  assert.match(await readIni(), /^ServerPassword=nouveau$/m);
});

test('les reglages non pilotes par le profil sont preserves', async () => {
  await writeIni(
    [
      '[ServerSettings]',
      '; commentaire a preserver',
      'HarvestAmountMultiplier=3.0',
      'ServerPassword=admin',
      'TamingSpeedMultiplier=5.0',
      '',
      '[SessionSettings]',
      'SessionName=Ancien nom',
      '',
    ].join('\r\n'),
  );

  await syncProfileToIni(makeProfile({ serverPassword: '' }));
  const result = await readIni();

  assert.match(result, /HarvestAmountMultiplier=3\.0/);
  assert.match(result, /TamingSpeedMultiplier=5\.0/);
  assert.match(result, /; commentaire a preserver/);
  assert.match(result, /^SessionName=Ma Session$/m);
});

test('les cles absentes sont ajoutees dans la bonne section', async () => {
  await writeIni(['[ServerSettings]', 'HarvestAmountMultiplier=2.0', ''].join('\r\n'));

  await syncProfileToIni(makeProfile({ rconEnabled: true, rconPort: 27020 }));
  const result = await readIni();

  assert.match(result, /^RCONEnabled=True$/m);
  assert.match(result, /^RCONPort=27020$/m);
  assert.match(result, /\[SessionSettings\][\s\S]*SessionName=Ma Session/);
});

test('le RCON desactive dans le profil est repercute', async () => {
  await writeIni(['[ServerSettings]', 'RCONEnabled=True', ''].join('\r\n'));

  await syncProfileToIni(makeProfile({ rconEnabled: false }));

  assert.match(await readIni(), /^RCONEnabled=False$/m);
});

test('un fichier deja conforme n est pas reecrit', async () => {
  await writeIni(
    [
      '[ServerSettings]',
      'ServerPassword=',
      'ServerAdminPassword=motdepasse-admin',
      'RCONEnabled=True',
      'RCONPort=27020',
      '',
      '[SessionSettings]',
      'SessionName=Ma Session',
      '',
    ].join('\r\n'),
  );

  const before = await readIni();
  const reconciled = await syncProfileToIni(makeProfile());

  assert.deepEqual(reconciled, []);
  assert.equal(await readIni(), before);
});

test('un fichier inexistant est cree avec les reglages du profil', async () => {
  await syncProfileToIni(makeProfile({ serverPassword: 'secret-partage' }));
  const result = await readIni();

  assert.match(result, /^ServerPassword=secret-partage$/m);
  assert.match(result, /^ServerAdminPassword=motdepasse-admin$/m);
});
