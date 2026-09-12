import { useEffect, useState } from 'react';

import type { ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';

/**
 * Reproduit slugForDirectory du service, uniquement pour afficher un apercu.
 * Le chemin reellement utilise est calcule par le serveur, qui reste la reference.
 */
function slugPreview(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();

  return slug || 'serveur';
}

function join(parent: string, child: string): string {
  return `${parent.replace(/[\\/]+$/, '')}\\${child}`;
}

export function NewProfileDialog({
  onCreated,
  onCancel,
}: {
  onCreated: (profile: ServerProfile) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [defaultDir, setDefaultDir] = useState<string | null>(null);
  /** null tant que l'utilisateur laisse le chemin automatique */
  const [customDir, setCustomDir] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getSettings()
      .then((settings) => setDefaultDir(settings.defaultServerDir))
      .catch(() => setDefaultDir(''));
  }, []);

  const suggested = defaultDir ? join(defaultDir, slugPreview(name)) : '';

  async function create() {
    setSaving(true);
    setError(null);
    try {
      // Chemin automatique : on laisse le serveur le calculer plutot que d'envoyer l'apercu
      onCreated(await api.createProfile(name.trim(), customDir?.trim() || undefined));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 8, 12, 0.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        zIndex: 10,
      }}
      onClick={onCancel}
    >
      <div
        className="panel"
        style={{ width: 'min(560px, 100%)', margin: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Nouveau profil</h3>
        <p className="hint">
          Le serveur sera installe sous le dossier configure dans les reglages de l'application. Le dossier est
          cree s'il n'existe pas ; prevoyez environ 15 Go.
        </p>

        {error && <div className="message error">{error}</div>}

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="newName">Nom du profil</label>
          <input
            id="newName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Serveur principal"
            autoFocus
          />
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="newDir">Dossier d'installation</label>
          <input
            id="newDir"
            value={customDir ?? suggested}
            disabled={customDir === null}
            onChange={(e) => setCustomDir(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
          />
          <div className="desc">
            {customDir === null
              ? 'Chemin derive automatiquement du nom du profil.'
              : 'Chemin personnalise : il sera utilise tel quel.'}
          </div>
        </div>

        <div className="field inline" style={{ marginBottom: 18 }}>
          <input
            id="customise"
            type="checkbox"
            checked={customDir !== null}
            onChange={(e) => setCustomDir(e.target.checked ? suggested : null)}
          />
          <label htmlFor="customise">Choisir un autre dossier pour ce serveur</label>
        </div>

        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => void create()}
            disabled={saving || !name.trim() || (customDir !== null && !customDir.trim())}
          >
            {saving ? 'Creation...' : 'Creer'}
          </button>
          <button type="button" onClick={onCancel} disabled={saving}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
