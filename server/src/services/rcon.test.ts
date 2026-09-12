import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

import {
  PacketType,
  RconClient,
  type RconPacket,
  decodePackets,
  encodePacket,
  parsePlayerList,
} from './rcon.js';

interface FakeOptions {
  password: string;
  /** Reponses renvoyees pour une commande, une entree = un paquet */
  reply?: (command: string) => string[];
  /**
   * Reproduit ARK: le serveur ne repond a la commande que si aucun paquet
   * supplementaire n'a ete envoye derriere elle.
   */
  arkQuirk?: boolean;
  /** Emet un "Keep Alive" spontane portant l'id 0, comme le fait ARK */
  keepAlive?: boolean;
  /** ARK n'envoie qu'un seul paquet d'authentification, sans Response prealable */
  singleAuthPacket?: boolean;
}

interface FakeServer {
  port: number;
  /** Tous les paquets recus du client, pour verifier ce qui est reellement emis */
  received: RconPacket[];
  close: () => Promise<void>;
}

/**
 * Serveur RCON factice implementant le protocole Source cote serveur.
 */
async function startFakeServer(options: FakeOptions): Promise<FakeServer> {
  const {
    password,
    reply = () => ['ok'],
    arkQuirk = false,
    keepAlive = false,
    singleAuthPacket = false,
  } = options;

  const received: RconPacket[] = [];

  const server = net.createServer((socket) => {
    let buffer: Buffer = Buffer.alloc(0);
    let extraAfterCommand = false;

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { packets, rest } = decodePackets(buffer);
      buffer = rest;

      for (const packet of packets) {
        received.push(packet);

        if (packet.type === PacketType.Auth) {
          if (!singleAuthPacket) {
            socket.write(encodePacket({ id: packet.id, type: PacketType.Response, body: '' }));
          }
          socket.write(
            encodePacket({
              id: packet.body === password ? packet.id : -1,
              type: PacketType.AuthResponse,
              body: '',
            }),
          );
          continue;
        }

        if (packet.type === PacketType.ExecCommand) {
          if (keepAlive) {
            socket.write(encodePacket({ id: 0, type: PacketType.Response, body: 'Keep Alive' }));
          }

          // Sur ARK, la reponse est emise apres un court delai ; si un autre
          // paquet arrive entre-temps, le serveur reste muet
          setTimeout(() => {
            if (arkQuirk && extraAfterCommand) return;

            for (const body of reply(packet.body)) {
              socket.write(encodePacket({ id: packet.id, type: PacketType.Response, body }));
            }
          }, 20);
          continue;
        }

        // Tout paquet supplementaire derriere une commande : c'est la sentinelle
        extraAfterCommand = true;
        if (!arkQuirk) {
          socket.write(encodePacket({ id: packet.id, type: PacketType.Response, body: '' }));
        }
      }
    });

    socket.on('error', () => {
      // Fermeture brutale par le client en fin de test
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;

  return {
    port,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

test('un paquet encode puis decode est identique', () => {
  const packet = { id: 42, type: PacketType.ExecCommand, body: 'ListPlayers' };
  const { packets, rest } = decodePackets(encodePacket(packet));

  assert.equal(rest.length, 0);
  assert.deepEqual(packets, [packet]);
});

test('le corps vide est gere', () => {
  const { packets } = decodePackets(encodePacket({ id: 1, type: 0, body: '' }));
  assert.deepEqual(packets, [{ id: 1, type: 0, body: '' }]);
});

test('un paquet coupe en deux fragments TCP est reassemble', () => {
  const full = encodePacket({ id: 7, type: 0, body: 'reponse fragmentee' });
  const cut = 9;

  const first = decodePackets(full.subarray(0, cut));
  assert.equal(first.packets.length, 0);

  const second = decodePackets(Buffer.concat([first.rest, full.subarray(cut)]));
  assert.deepEqual(second.packets, [{ id: 7, type: 0, body: 'reponse fragmentee' }]);
});

test('deux paquets colles dans un seul fragment sont separes', () => {
  const joined = Buffer.concat([
    encodePacket({ id: 1, type: 0, body: 'un' }),
    encodePacket({ id: 2, type: 0, body: 'deux' }),
  ]);

  const { packets, rest } = decodePackets(joined);
  assert.equal(rest.length, 0);
  assert.deepEqual(packets.map((p) => p.body), ['un', 'deux']);
});

test('une taille de paquet aberrante est rejetee', () => {
  const bogus = Buffer.alloc(8);
  bogus.writeInt32LE(3, 0);
  assert.throws(() => decodePackets(bogus), /invalide/);
});

test('authentification acceptee puis commande executee', async () => {
  const server = await startFakeServer({
    password: 'secret',
    reply: (command) => [`recu: ${command}`],
  });

  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'secret' });
  await client.connect();

  assert.equal(await client.exec('SaveWorld'), 'recu: SaveWorld');

  client.close();
  await server.close();
});

test('un mot de passe errone est signale explicitement', async () => {
  const server = await startFakeServer({ password: 'secret' });
  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'faux' });

  await assert.rejects(() => client.connect(), /Mot de passe RCON refuse/);

  client.close();
  await server.close();
});

test('une reponse en plusieurs paquets est concatenee', async () => {
  const server = await startFakeServer({
    password: 'x',
    reply: () => ['partie 1 ', 'partie 2 ', 'partie 3'],
  });

  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'x' });
  await client.connect();

  assert.equal(await client.exec('ListPlayers'), 'partie 1 partie 2 partie 3');

  client.close();
  await server.close();
});

test('la fin de reponse est detectee par le silence, sans paquet sentinelle', async () => {
  const server = await startFakeServer({ password: 'x', reply: () => ['reponse'] });

  const client = new RconClient({
    host: '127.0.0.1',
    port: server.port,
    password: 'x',
    idleMs: 60,
    timeoutMs: 2_000,
  });
  await client.connect();

  assert.equal(await client.exec('ListPlayers'), 'reponse');

  client.close();
  await server.close();
});

test('aucun paquet sentinelle n est emis derriere une commande', async () => {
  // Regression : ARK cesse de repondre si un paquet suit la commande.
  const server = await startFakeServer({ password: 'x', reply: () => ['ok'] });

  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'x', idleMs: 60 });
  await client.connect();
  await client.exec('SaveWorld');
  client.close();

  const apresAuth = server.received.filter((packet) => packet.type !== PacketType.Auth);
  assert.equal(apresAuth.length, 1, `paquets emis apres l auth : ${JSON.stringify(apresAuth)}`);
  assert.equal(apresAuth[0]!.type, PacketType.ExecCommand);
  assert.equal(apresAuth[0]!.body, 'SaveWorld');

  await server.close();
});

test('un serveur au comportement ARK repond bien a la commande', async () => {
  // Le serveur factice reste muet si quoi que ce soit suit la commande
  const server = await startFakeServer({
    password: 'x',
    reply: () => ['No Players Connected \n '],
    arkQuirk: true,
    keepAlive: true,
    singleAuthPacket: true,
  });

  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'x', idleMs: 80 });
  await client.connect();

  assert.equal(await client.exec('ListPlayers'), 'No Players Connected \n ');

  client.close();
  await server.close();
});

test('les paquets Keep Alive spontanes ne polluent pas la reponse', async () => {
  const server = await startFakeServer({
    password: 'x',
    reply: () => ['vraie reponse'],
    keepAlive: true,
  });

  const client = new RconClient({ host: '127.0.0.1', port: server.port, password: 'x', idleMs: 80 });
  await client.connect();

  // Le "Keep Alive" porte l'id 0 et doit etre ignore
  assert.equal(await client.exec('ListPlayers'), 'vraie reponse');

  client.close();
  await server.close();
});

test('une connexion vers un port ferme echoue proprement', async () => {
  const server = await startFakeServer({ password: 'x' });
  const port = server.port;
  await server.close();

  const client = new RconClient({ host: '127.0.0.1', port, password: 'x', timeoutMs: 1_000 });
  await assert.rejects(() => client.connect(), /Connexion RCON impossible|Delai/);
  client.close();
});

test('parsePlayerList extrait index, nom et identifiant', () => {
  const raw = '0. Sylvain, 0002a1b3c4d5e6f7\n1. Autre Joueur, 00031122334455\n';
  assert.deepEqual(parsePlayerList(raw), [
    { index: 0, name: 'Sylvain', id: '0002a1b3c4d5e6f7' },
    { index: 1, name: 'Autre Joueur', id: '00031122334455' },
  ]);
});

test('un nom contenant une virgule ne casse pas l identifiant', () => {
  const raw = '0. Nom, avec virgule, 0002a1b3c4d5e6f7';
  assert.deepEqual(parsePlayerList(raw), [
    { index: 0, name: 'Nom, avec virgule', id: '0002a1b3c4d5e6f7' },
  ]);
});

test('la reponse "aucun joueur" ne produit aucune ligne', () => {
  assert.deepEqual(parsePlayerList('No Players Connected'), []);
});
