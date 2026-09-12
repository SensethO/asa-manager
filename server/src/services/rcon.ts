/**
 * Client RCON (protocole Source) pour ARK: Survival Ascended.
 *
 * Format d'un paquet :
 *   int32 taille (de tout ce qui suit), int32 id, int32 type,
 *   corps ASCII termine par NUL, puis un NUL de remplissage.
 *
 * Particularite ARK : le serveur ne renvoie pas toujours l'echo du paquet
 * sentinelle utilise habituellement pour marquer la fin d'une reponse
 * multi-paquets. La lecture s'arrete donc sur la sentinelle si elle arrive,
 * sinon apres une courte periode sans nouveau fragment.
 */

import net from 'node:net';

export const PacketType = {
  Response: 0,
  ExecCommand: 2,
  AuthResponse: 2,
  Auth: 3,
} as const;

export interface RconPacket {
  id: number;
  type: number;
  body: string;
}

export class RconError extends Error {}

export function encodePacket(packet: RconPacket): Buffer {
  const body = Buffer.from(packet.body, 'utf8');
  // id + type + corps + NUL de fin de chaine + NUL de remplissage
  const size = 4 + 4 + body.length + 2;

  const buffer = Buffer.allocUnsafe(4 + size);
  buffer.writeInt32LE(size, 0);
  buffer.writeInt32LE(packet.id, 4);
  buffer.writeInt32LE(packet.type, 8);
  body.copy(buffer, 12);
  buffer.writeUInt8(0, 12 + body.length);
  buffer.writeUInt8(0, 13 + body.length);

  return buffer;
}

/**
 * Extrait tous les paquets complets d'un tampon. Retourne les paquets et le
 * reliquat, un fragment TCP pouvant couper un paquet a n'importe quel octet.
 */
export function decodePackets(buffer: Buffer): { packets: RconPacket[]; rest: Buffer } {
  const packets: RconPacket[] = [];
  let offset = 0;

  while (buffer.length - offset >= 4) {
    const size = buffer.readInt32LE(offset);

    // Un paquet valide contient au minimum id + type + deux NUL
    if (size < 10 || size > 4_096 * 16) {
      throw new RconError(`Taille de paquet RCON invalide : ${size}`);
    }

    if (buffer.length - offset - 4 < size) break;

    const id = buffer.readInt32LE(offset + 4);
    const type = buffer.readInt32LE(offset + 8);
    const body = buffer.toString('utf8', offset + 12, offset + 4 + size - 2);

    packets.push({ id, type, body });
    offset += 4 + size;
  }

  return { packets, rest: buffer.subarray(offset) };
}

export interface RconOptions {
  host: string;
  port: number;
  password: string;
  /** Delai global d'une operation */
  timeoutMs?: number;
  /** Silence apres lequel une reponse est consideree complete */
  idleMs?: number;
}

export class RconClient {
  private socket: net.Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, (packet: RconPacket) => void>();
  private readonly options: Required<RconOptions>;

  constructor(options: RconOptions) {
    this.options = {
      timeoutMs: 5_000,
      idleMs: 250,
      ...options,
    };
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({
        host: this.options.host,
        port: this.options.port,
      });

      const onError = (error: Error) => {
        socket.destroy();
        reject(new RconError(`Connexion RCON impossible : ${error.message}`));
      };

      const timer = setTimeout(() => {
        socket.destroy();
        reject(new RconError('Delai de connexion RCON depasse'));
      }, this.options.timeoutMs);

      socket.once('error', onError);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.off('error', onError);
        socket.on('error', () => {
          // Une coupure apres l'etablissement remonte via les promesses en attente
        });
        socket.on('data', (chunk) => this.onData(chunk));
        this.socket = socket;
        resolve();
      });
    });

    await this.authenticate();
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    try {
      const { packets, rest } = decodePackets(this.buffer);
      this.buffer = rest;
      for (const packet of packets) {
        for (const handler of this.pending.values()) handler(packet);
      }
    } catch {
      // Flux desynchronise : on repart proprement plutot que de boucler sur l'erreur
      this.buffer = Buffer.alloc(0);
    }
  }

  private async authenticate(): Promise<void> {
    const id = this.nextId++;
    const socket = this.requireSocket();

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RconError("Delai d'authentification RCON depasse"));
      }, this.options.timeoutMs);

      this.pending.set(id, (packet) => {
        // Le serveur emet d'abord un Response vide, puis l'AuthResponse decisif
        if (packet.type !== PacketType.AuthResponse) return;

        clearTimeout(timer);
        this.pending.delete(id);

        if (packet.id === -1) {
          reject(new RconError('Mot de passe RCON refuse'));
        } else {
          resolve();
        }
      });

      socket.write(encodePacket({ id, type: PacketType.Auth, body: this.options.password }));
    });
  }

  /**
   * Execute une commande.
   *
   * Le protocole Source prevoit d'envoyer, juste apres la commande, un paquet
   * sentinelle vide dont l'echo marque la fin d'une reponse multi-paquets.
   * ARK: Survival Ascended ne le supporte pas : en presence de ce second paquet,
   * le serveur cesse purement et simplement de repondre a la commande. Verifie
   * sur un serveur reel : "ListPlayers" seul repond en 6 ms, "ListPlayers" suivi
   * de la sentinelle ne renvoie jamais rien.
   *
   * Une seule ecriture est donc emise, et la fin de reponse est detectee par le
   * silence qui suit le dernier fragment.
   */
  async exec(command: string): Promise<string> {
    const socket = this.requireSocket();
    const id = this.nextId++;

    return new Promise<string>((resolve, reject) => {
      let response = '';
      let idleTimer: NodeJS.Timeout | null = null;

      const finish = (value: string) => {
        if (idleTimer) clearTimeout(idleTimer);
        clearTimeout(globalTimer);
        this.pending.delete(id);
        resolve(value);
      };

      const globalTimer = setTimeout(() => {
        this.pending.delete(id);
        if (idleTimer) clearTimeout(idleTimer);
        // Une reponse partielle vaut mieux qu'une erreur : ARK tronque parfois
        if (response) resolve(response);
        else reject(new RconError('Delai de reponse RCON depasse'));
      }, this.options.timeoutMs);

      this.pending.set(id, (packet) => {
        // ARK emet spontanement des paquets "Keep Alive" portant l'id 0 :
        // les filtrer evite de prendre leur arrivee pour la reponse attendue
        if (packet.id !== id) return;

        response += packet.body;

        // Repousse la cloture tant que des fragments continuent d'arriver
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => finish(response), this.options.idleMs);
      });

      socket.write(encodePacket({ id, type: PacketType.ExecCommand, body: command }));
    });
  }

  close(): void {
    this.pending.clear();
    this.socket?.destroy();
    this.socket = null;
  }

  private requireSocket(): net.Socket {
    if (!this.socket) throw new RconError('Client RCON non connecte');
    return this.socket;
  }
}

/**
 * Ouvre une connexion, execute le travail demande, puis ferme dans tous les cas.
 */
export async function withRcon<T>(options: RconOptions, work: (client: RconClient) => Promise<T>): Promise<T> {
  const client = new RconClient(options);
  await client.connect();
  try {
    return await work(client);
  } finally {
    client.close();
  }
}

export interface ParsedPlayer {
  index: number;
  name: string;
  id: string;
}

/**
 * Analyse la sortie de ListPlayers.
 * Format observe : "0. NomDuJoueur, 0002a1b3c4d5e6f7..."
 * Le nom peut contenir des virgules ; seul le dernier champ est l'identifiant.
 */
export function parsePlayerList(raw: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = /^(\d+)\.\s*(.+)$/.exec(trimmed);
    if (!match) continue;

    const rest = match[2]!;
    const lastComma = rest.lastIndexOf(',');
    if (lastComma === -1) continue;

    players.push({
      index: Number(match[1]),
      name: rest.slice(0, lastComma).trim(),
      id: rest.slice(lastComma + 1).trim(),
    });
  }

  return players;
}
