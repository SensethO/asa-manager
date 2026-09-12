import { useCallback, useEffect, useState } from 'react';

import type { BackupInfo, ProfileRuntime, ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';

export function BackupsPanel({
  profile,
  runtime,
}: {
  profile: ServerProfile;
  runtime: ProfileRuntime | undefined;
}) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const running = runtime?.status === 'running';

  const load = useCallback(async () => {
    try {
      setBackups(await api.listBackups(profile.id));
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    }
  }, [profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage({ kind: 'ok', text: label });
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message && <div className={`message ${message.kind}`}>{message.text}</div>}

      <div className="panel">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Sauvegardes</h3>
          <span className="badge">{backups.length}</span>
          <span className="spacer" />
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void act('Sauvegarde creee.', () => api.createBackup(profile.id))}
          >
            {busy ? 'Traitement...' : 'Sauvegarder maintenant'}
          </button>
          <button type="button" onClick={() => void load()} disabled={busy}>
            Actualiser
          </button>
        </div>

        <p className="hint">
          Chaque archive contient SavedArks (mondes, personnages, tribus) et le dossier de configuration. Si le
          serveur tourne, un SaveWorld est demande juste avant l'archivage.
        </p>

        {backups.length === 0 && (
          <p className="log-empty" style={{ margin: 0 }}>
            Aucune sauvegarde pour l'instant.
          </p>
        )}

        {backups.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th style={{ width: 170 }}>Date</th>
                <th style={{ width: 100 }}>Taille</th>
                <th style={{ width: 200 }} />
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr key={backup.name}>
                  <td className="mono">{backup.name}</td>
                  <td>{new Date(backup.createdAt).toLocaleString('fr-FR')}</td>
                  <td>{formatSize(backup.sizeBytes)}</td>
                  <td>
                    <div className="row">
                      <button
                        type="button"
                        disabled={busy || running}
                        title={running ? 'Arretez le serveur pour restaurer' : undefined}
                        onClick={() => {
                          if (!confirm(`Restaurer "${backup.name}" ? L'etat actuel sera archive au prealable.`))
                            return;
                          void act('Sauvegarde restauree.', () => api.restoreBackup(profile.id, backup.name));
                        }}
                      >
                        Restaurer
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm(`Supprimer definitivement "${backup.name}" ?`)) return;
                          void act('Sauvegarde supprimee.', () => api.deleteBackup(profile.id, backup.name));
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h3>Restauration</h3>
        <p className="hint" style={{ marginBottom: 0 }}>
          La restauration exige un serveur arrete : ARK reecrit ses fichiers en s'eteignant et annulerait
          l'operation. L'etat courant est systematiquement archive avant ecrasement, sous le nom
          <span className="mono"> avant-restauration-*.zip</span>, pour que l'operation reste reversible.
        </p>
      </div>
    </>
  );
}

function formatSize(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
