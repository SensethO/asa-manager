import { EventEmitter } from 'node:events';

import type { LogLevel, LogLine, ProfileRuntime, ServerEvent } from '../../../shared/types.js';

/**
 * Bus d'evenements alimentant le flux SSE, double d'un tampon circulaire de
 * journaux pour qu'un client qui se connecte voie l'historique recent.
 */
class EventBus extends EventEmitter {
  private readonly logs = new Map<string, LogLine[]>();
  private static readonly MAX_LINES = 500;

  emitEvent(event: ServerEvent): void {
    this.emit('event', event);
  }

  emitRuntime(runtime: ProfileRuntime): void {
    this.emitEvent({ type: 'runtime', runtime });
  }

  emitProfilesChanged(): void {
    this.emitEvent({ type: 'profiles' });
  }

  log(profileId: string, source: LogLine['source'], text: string, level: LogLevel = 'info'): void {
    const line: LogLine = { profileId, at: new Date().toISOString(), level, source, text };

    const buffer = this.logs.get(profileId) ?? [];
    buffer.push(line);
    if (buffer.length > EventBus.MAX_LINES) buffer.splice(0, buffer.length - EventBus.MAX_LINES);
    this.logs.set(profileId, buffer);

    this.emitEvent({ type: 'log', line });
  }

  /** Decoupe un flux sortant en lignes, en ignorant les lignes vides */
  logChunk(profileId: string, source: LogLine['source'], chunk: string, level: LogLevel = 'info'): void {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) this.log(profileId, source, trimmed, level);
    }
  }

  history(profileId: string): LogLine[] {
    return this.logs.get(profileId) ?? [];
  }

  clearHistory(profileId: string): void {
    this.logs.delete(profileId);
  }
}

export const bus = new EventBus();
