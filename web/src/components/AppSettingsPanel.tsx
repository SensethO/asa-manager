import { useEffect, useState } from 'react';

import type { AppSettings, User } from '../../../shared/types.js';
import { api } from '../api.js';

export function AppSettingsPanel({ currentUser }: { currentUser: User }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const readOnly = currentUser.role !== 'admin';

  useEffect(() => {
    void api
      .getSettings()
      .then((loaded) => {
        setSettings(loaded);
        setDraft(loaded);
      })
      .catch((error: Error) => setMessage({ kind: 'error', text: error.message }));
  }, []);

  async function save() {
    if (!draft) return;

    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.saveSettings(draft);
      setSettings(saved);
      setDraft(saved);
      setMessage({
        kind: 'ok',
        text: 'Reglages enregistres. Le dossier par defaut s applique aux profils crees ensuite.',
      });
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (!draft || !settings) {
    return <div className="panel">Chargement des reglages...</div>;
  }

  return (
    <>
      {message && <div className={`message ${message.kind}`}>{message.text}</div>}

      {readOnly && (
        <div className="message error">
          Seuls les administrateurs peuvent modifier les reglages de l'application.
        </div>
      )}

      <div className="panel">
        <h3>Emplacement des serveurs</h3>
        <p className="hint">
          Dossier parent sous lequel les nouveaux profils sont installes. Chaque serveur recoit un sous-dossier
          derive de son nom. Les profils existants gardent le dossier qui leur a ete attribue.
        </p>

        <div className="field">
          <label htmlFor="defaultServerDir">Dossier par defaut des serveurs</label>
          <input
            id="defaultServerDir"
            value={draft.defaultServerDir}
            disabled={readOnly}
            onChange={(e) => setDraft({ ...draft, defaultServerDir: e.target.value })}
            style={{ fontFamily: 'var(--mono)' }}
          />
          <div className="desc">
            Comptez environ 15 Go par serveur. Un chemin vide retombe sur E:\ServersASA.
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="defaultBackupDir">Dossier par defaut des sauvegardes</label>
          <input
            id="defaultBackupDir"
            value={draft.defaultBackupDir}
            disabled={readOnly}
            placeholder="(vide : un dossier Backups dans chaque installation)"
            onChange={(e) => setDraft({ ...draft, defaultBackupDir: e.target.value })}
            style={{ fontFamily: 'var(--mono)' }}
          />
          <div className="desc">
            Proposition faite aux nouveaux profils. Chacun reste modifiable dans son onglet Planification.
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Sessions</h3>
        <p className="hint">
          Les sessions sont gardees en memoire du service : redemarrer le gestionnaire deconnecte tout le monde.
        </p>

        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="sessionHours">Duree d'une session (heures)</label>
          <input
            id="sessionHours"
            type="number"
            min={1}
            max={720}
            value={draft.sessionHours}
            disabled={readOnly}
            onChange={(e) => setDraft({ ...draft, sessionHours: Number(e.target.value) || 12 })}
          />
        </div>
      </div>

      {!readOnly && (
        <div className="row">
          <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          <button type="button" onClick={() => setDraft(settings)} disabled={saving}>
            Annuler les modifications
          </button>
        </div>
      )}
    </>
  );
}
