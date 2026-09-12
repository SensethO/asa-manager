import fs from 'node:fs/promises';
import path from 'node:path';

import type { LogLine } from '../../../shared/types.js';

/**
 * Suivi de fichiers journaux, facon `tail -f`.
 *
 * Avec AsaApi, le serveur de jeu n'est plus un processus enfant du gestionnaire :
 * AsaApiLoader.exe lance ArkAscendedServer.exe dans sa propre console, et la
 * sortie standard n'arrive donc plus dans le tuyau du gestionnaire. Lire les
 * fichiers qu'ARK et l'API ecrivent de toute facon est plus robuste : cela
 * fonctionne quel que soit le lanceur, et capte aussi ce qui est ecrit avant
 * que le gestionnaire ne commence a regarder.
 */

/** Lignes purement repetitives, sans valeur pour l'administrateur */
const NOISE = [
  /Info\/GameAnalytics/i,
  /Debug\/GameAnalytics/i,
  /Warning\/GameAnalytics/i,
  /Attempted GC & Defrag/i,
  /Added Explorer Note Entry/i,
];

export function isNoise(line: string): boolean {
  return NOISE.some((pattern) => pattern.test(line));
}

export interface TailOptions {
  /**
   * Fichier a suivre, ou fonction le resolvant : le journal d'AsaApi porte
   * l'horodatage de lancement dans son nom et n'existe pas encore au moment ou
   * le suivi demarre.
   */
  file: string | (() => Promise<string | null>);
  source: LogLine['source'];
  onLine: (text: string, source: LogLine['source']) => void;
  /** Intervalle de scrutation en millisecondes */
  intervalMs?: number;
}

class Tail {
  private offset = 0;
  private timer: NodeJS.Timeout | null = null;
  private reading = false;
  private residue = '';
  private resolved: string | null = null;

  constructor(private readonly options: TailOptions) {}

  /**
   * Demarre le suivi en se positionnant a la fin du fichier existant : on ne
   * rejoue pas l'historique d'une session precedente.
   */
  async start(): Promise<void> {
    if (typeof this.options.file === 'string') {
      this.resolved = this.options.file;

      try {
        this.offset = (await fs.stat(this.resolved)).size;
      } catch {
        this.offset = 0; // Le fichier sera cree par le serveur
      }
    }

    this.timer = setInterval(() => void this.poll(), this.options.intervalMs ?? 1_000);
  }

  /** Resout le fichier une seule fois, puis se cale a sa fin */
  private async ensureResolved(): Promise<boolean> {
    if (this.resolved) return true;
    if (typeof this.options.file === 'string') return false;

    const found = await this.options.file();
    if (!found) return false;

    this.resolved = found;
    this.offset = 0; // Ce fichier vient de naitre : on le lit depuis le debut
    return true;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    if (this.reading) return; // Un tour precedent n'a pas fini
    this.reading = true;

    try {
      if (!(await this.ensureResolved())) return;
      const target = this.resolved!;

      const stat = await fs.stat(target);

      // Fichier recree ou tronque au demarrage suivant : on repart du debut
      if (stat.size < this.offset) {
        this.offset = 0;
        this.residue = '';
      }
      if (stat.size === this.offset) return;

      const handle = await fs.open(target, 'r');
      try {
        const length = stat.size - this.offset;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, this.offset);
        this.offset = stat.size;

        // La derniere ligne peut etre incomplete : elle est gardee pour le tour suivant
        const chunk = this.residue + buffer.toString('utf8');
        const lines = chunk.split(/\r?\n/);
        this.residue = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !isNoise(trimmed)) {
            this.options.onLine(trimmed, this.options.source);
          }
        }
      } finally {
        await handle.close();
      }
    } catch {
      // Fichier absent ou verrouille passagerement : on retentera au tour suivant
    } finally {
      this.reading = false;
    }
  }
}

/**
 * Suit plusieurs fichiers pour un meme serveur et retourne la fonction d'arret.
 */
export function tailFiles(targets: TailOptions[]): () => void {
  const tails = targets.map((options) => new Tail(options));

  for (const tail of tails) void tail.start();

  return () => {
    for (const tail of tails) tail.stop();
  };
}

/**
 * Journal d'AsaApi le plus recent. Son nom porte l'horodatage de lancement,
 * il change donc a chaque demarrage et doit etre resolu apres coup.
 */
export async function findLatestApiLog(logsDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(logsDir);
    const candidates = entries.filter((entry) => /^ArkApi_.*\.log$/i.test(entry));
    if (candidates.length === 0) return null;

    const stats = await Promise.all(
      candidates.map(async (entry) => {
        const full = path.join(logsDir, entry);
        return { full, mtime: (await fs.stat(full)).mtimeMs };
      }),
    );

    stats.sort((a, b) => b.mtime - a.mtime);
    return stats[0]!.full;
  } catch {
    return null;
  }
}
