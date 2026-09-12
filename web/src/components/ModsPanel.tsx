import { useEffect, useState } from 'react';

import type { ModEntry, ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';

export function ModsPanel({
  profile,
  onSaved,
}: {
  profile: ServerProfile;
  onSaved: (profile: ServerProfile) => void;
}) {
  const [mods, setMods] = useState<ModEntry[]>(profile.mods);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setMods(profile.mods);
    setMessage(null);
  }, [profile]);

  function add() {
    const id = newId.trim();

    // Un mod telecharge depuis CurseForge porte un numero de projet, mais un mod
    // cuisine localement porte le nom de son dossier sous ShooterGame\Mods :
    // n'accepter que des chiffres interdisait ce second cas, pourtant legitime.
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      setMessage({
        kind: 'error',
        text: "Identifiant invalide : un numero de projet CurseForge, ou le nom du dossier d'un mod installe a la main.",
      });
      return;
    }
    if (mods.some((mod) => mod.id === id)) {
      setMessage({ kind: 'error', text: 'Ce mod est deja dans la liste.' });
      return;
    }

    setMods((current) => [...current, { id, name: newName.trim() || undefined, enabled: true }]);
    setNewId('');
    setNewName('');
    setMessage(null);
  }

  /** L'ordre compte : ARK charge les mods dans l'ordre de -mods= */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= mods.length) return;

    const next = [...mods];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    setMods(next);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.setMods(profile.id, mods);
      setMods(saved);
      onSaved({ ...profile, mods: saved });
      setMessage({ kind: 'ok', text: 'Liste enregistree. Elle sera appliquee au prochain demarrage du serveur.' });
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const active = mods.filter((mod) => mod.enabled);

  return (
    <>
      {message && <div className={`message ${message.kind}`}>{message.text}</div>}

      <div className="panel">
        <h3>Ajouter un mod</h3>
        <p className="hint">
          L'identifiant est le numero du projet sur CurseForge, visible dans l'URL de la page du mod. Le serveur
          telecharge les mods lui-meme au demarrage. Un mod cuisine localement s'ajoute par le nom de son dossier
          sous <code>ShooterGame\Binaries\Win64\ShooterGame\Mods</code>.
        </p>

        <div className="row">
          <input
            placeholder="Numero CurseForge (ex. 893657) ou nom de dossier"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <input
            placeholder="Nom (facultatif, pour vous y retrouver)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button type="button" onClick={add}>
            Ajouter
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Mods du serveur</h3>
          <span className="badge">{active.length} actif(s)</span>
          <span className="spacer" />
          <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>

        {mods.length === 0 && (
          <p className="log-empty" style={{ margin: 0 }}>
            Aucun mod. Le serveur demarrera en configuration vanilla.
          </p>
        )}

        {mods.length > 0 && (
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Actif</th>
                <th style={{ width: 120 }}>Identifiant</th>
                <th>Nom</th>
                <th style={{ width: 150 }}>Ordre</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {mods.map((mod, index) => (
                <tr key={mod.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={mod.enabled}
                      onChange={(e) =>
                        setMods((current) =>
                          current.map((item) =>
                            item.id === mod.id ? { ...item, enabled: e.target.checked } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="mono">{mod.id}</td>
                  <td>
                    <input
                      value={mod.name ?? ''}
                      placeholder="—"
                      onChange={(e) =>
                        setMods((current) =>
                          current.map((item) =>
                            item.id === mod.id ? { ...item, name: e.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <div className="row">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === mods.length - 1}
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setMods((current) => current.filter((item) => item.id !== mod.id))}
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h3>Argument genere</h3>
        <p className="hint">Ajoute a la ligne de commande du serveur. L'ordre determine la priorite de chargement.</p>
        <div className="log" style={{ height: 'auto', minHeight: 40 }}>
          {active.length > 0 ? `-mods=${active.map((mod) => mod.id).join(',')}` : '(aucun mod actif)'}
        </div>
      </div>
    </>
  );
}
