import { useEffect, useState } from 'react';

import type { ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';

const MAPS = [
  { id: 'TheIsland_WP', label: 'The Island' },
  { id: 'ScorchedEarth_WP', label: 'Scorched Earth' },
  { id: 'TheCenter_WP', label: 'The Center' },
  { id: 'Aberration_WP', label: 'Aberration' },
  { id: 'Extinction_WP', label: 'Extinction' },
  { id: 'Ragnarok_WP', label: 'Ragnarok' },
  { id: 'Astraeos_WP', label: 'Astraeos' },
];

interface Props {
  profile: ServerProfile;
  onSaved: (profile: ServerProfile) => void;
  onDeleted: (id: string) => void;
}

export function ProfileSettings({ profile, onSaved, onDeleted }: Props) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Repart du profil selectionne quand l'utilisateur change de serveur
  useEffect(() => {
    setDraft(profile);
    setMessage(null);
  }, [profile]);

  function set<K extends keyof ServerProfile>(key: K, value: ServerProfile[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.updateProfile(profile.id, {
        name: draft.name,
        installDir: draft.installDir,
        map: draft.map,
        sessionName: draft.sessionName,
        gamePort: draft.gamePort,
        queryPort: draft.queryPort,
        rconPort: draft.rconPort,
        maxPlayers: draft.maxPlayers,
        adminPassword: draft.adminPassword,
        serverPassword: draft.serverPassword,
        rconEnabled: draft.rconEnabled,
        clusterId: draft.clusterId,
        extraArgs: draft.extraArgs,
      });
      onSaved(saved);
      setMessage({ kind: 'ok', text: 'Parametres enregistres. Ils prendront effet au prochain demarrage.' });
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Supprimer le profil "${profile.name}" ? Les fichiers du serveur ne sont pas touches.`)) return;

    try {
      await api.deleteProfile(profile.id);
      onDeleted(profile.id);
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    }
  }

  return (
    <>
      {message && <div className={`message ${message.kind}`}>{message.text}</div>}

      <div className="panel">
        <h3>Identite</h3>
        <p className="hint">Le nom de session est celui affiche dans la liste des serveurs du jeu.</p>

        <div className="grid">
          <div className="field">
            <label htmlFor="name">Nom du profil</label>
            <input id="name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="sessionName">Nom de session</label>
            <input
              id="sessionName"
              value={draft.sessionName}
              onChange={(e) => set('sessionName', e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="map">Carte</label>
            <select id="map" value={draft.map} onChange={(e) => set('map', e.target.value)}>
              {MAPS.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.label} ({map.id})
                </option>
              ))}
              {!MAPS.some((map) => map.id === draft.map) && <option value={draft.map}>{draft.map}</option>}
            </select>
            <div className="desc">Une carte de mod se saisit via son nom technique dans les arguments.</div>
          </div>

          <div className="field">
            <label htmlFor="installDir">Dossier d'installation</label>
            <input
              id="installDir"
              value={draft.installDir}
              onChange={(e) => set('installDir', e.target.value)}
            />
            <div className="desc">Contient ShooterGame/ apres installation.</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Reseau</h3>
        <p className="hint">
          Les ports jeu et requete doivent etre ouverts vers l'exterieur. Le port RCON doit rester prive.
        </p>

        <div className="grid">
          <NumberField label="Port du jeu" value={draft.gamePort} onChange={(v) => set('gamePort', v)} />
          <NumberField label="Port de requete" value={draft.queryPort} onChange={(v) => set('queryPort', v)} />
          <NumberField label="Port RCON" value={draft.rconPort} onChange={(v) => set('rconPort', v)} />
          <NumberField label="Joueurs maximum" value={draft.maxPlayers} onChange={(v) => set('maxPlayers', v)} />
        </div>

        <div className="field inline" style={{ marginTop: 14 }}>
          <input
            id="rconEnabled"
            type="checkbox"
            checked={draft.rconEnabled}
            onChange={(e) => set('rconEnabled', e.target.checked)}
          />
          <label htmlFor="rconEnabled">Activer le RCON</label>
        </div>
        <div className="desc" style={{ marginTop: 4 }}>
          Sans RCON, le gestionnaire ne peut ni diffuser de preavis, ni sauvegarder le monde avant l'arret, ni
          compter les joueurs : il ne pourra que tuer le processus.
        </div>
      </div>

      <div className="panel">
        <h3>Acces</h3>
        <p className="hint">
          Ces mots de passe sont stockes en clair dans data/profiles.json. Le gestionnaire n'ecoute que sur la
          machine locale par defaut.
        </p>

        <div className="grid">
          <div className="field">
            <label htmlFor="adminPassword">Mot de passe administrateur</label>
            <input
              id="adminPassword"
              value={draft.adminPassword}
              onChange={(e) => set('adminPassword', e.target.value)}
            />
            <div className="desc">Sert aussi de mot de passe RCON.</div>
          </div>

          <div className="field">
            <label htmlFor="serverPassword">Mot de passe de connexion</label>
            <input
              id="serverPassword"
              value={draft.serverPassword}
              onChange={(e) => set('serverPassword', e.target.value)}
            />
            <div className="desc">Vide = serveur public.</div>
          </div>

          <div className="field">
            <label htmlFor="clusterId">Identifiant de cluster</label>
            <input id="clusterId" value={draft.clusterId} onChange={(e) => set('clusterId', e.target.value)} />
            <div className="desc">Partage entre serveurs pour autoriser les transferts. Vide = isole.</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Arguments supplementaires</h3>
        <p className="hint">Un argument par ligne, ajoute tel quel a la ligne de commande. Exemple : -NoBattlEye</p>

        <textarea
          rows={4}
          value={draft.extraArgs.join('\n')}
          onChange={(e) => set('extraArgs', e.target.value.split('\n'))}
          style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
        />
      </div>

      <div className="row">
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button type="button" onClick={() => setDraft(profile)} disabled={saving}>
          Annuler les modifications
        </button>
        <span className="spacer" />
        <button type="button" className="danger" onClick={() => void remove()}>
          Supprimer le profil
        </button>
      </div>
    </>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
}
