import { useCallback, useEffect, useState } from 'react';

import type { KnownPlayer, PendingDelivery, ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';
import { GiveItemPanel } from './GiveItemPanel.js';

/**
 * Joueurs deja vus mais absents, et objets qui les attendent.
 *
 * Le plugin ne connait que les joueurs presents : des qu'un joueur quitte, il
 * disparait de toute vue en direct. Le registre, alimente par le sondage
 * periodique, garde leur trace et permet de leur destiner des objets remis
 * automatiquement a leur retour.
 */
export function OfflinePlayersPanel({ profile }: { profile: ServerProfile }) {
  const [known, setKnown] = useState<KnownPlayer[]>([]);
  const [selected, setSelected] = useState<KnownPlayer | null>(null);
  const [pending, setPending] = useState<PendingDelivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setKnown(await api.roster(profile.id));
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = useCallback(
    async (player: KnownPlayer) => {
      if (selected?.eosId === player.eosId) {
        setSelected(null);
        return;
      }

      setSelected(player);
      setNotice(null);
      try {
        setPending(await api.pending(profile.id, player.eosId));
      } catch (cause) {
        setError((cause as Error).message);
      }
    },
    [profile.id, selected],
  );

  const clear = useCallback(async () => {
    if (!selected) return;

    try {
      await api.clearPending(profile.id, selected.eosId);
      setPending([]);
      setNotice('File vidée.');
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [profile.id, selected, refresh]);

  const offline = known.filter((player) => !player.online);

  if (loading) return null;

  return (
    <section className="card">
      <div className="card-header">
        <h3>Joueurs deja venus</h3>
        <button type="button" onClick={() => void refresh()}>
          Actualiser
        </button>
      </div>

      {error && <div className="message error">{error}</div>}
      {notice && <div className="message">{notice}</div>}

      {known.length === 0 && (
        <p className="log-empty">
          Aucun joueur enregistre pour l'instant. Le registre se remplit au fil des connexions, releve
          toutes les 30 secondes.
        </p>
      )}

      {known.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Etat</th>
              <th>Derniere venue</th>
              <th>Sessions</th>
              <th>En attente</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {known.map((player) => (
              <tr key={player.eosId}>
                <td>
                  <div style={{ fontWeight: 600 }}>{player.name || '(sans nom)'}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {player.eosId}
                  </div>
                </td>
                <td>
                  <span className="badge">{player.online ? 'en ligne' : 'absent'}</span>
                </td>
                <td>{formatDate(player.lastSeen)}</td>
                <td>{player.sessions}</td>
                <td>{player.pending > 0 ? `${player.pending} objet(s)` : '—'}</td>
                <td>
                  <button
                    type="button"
                    className={selected?.eosId === player.eosId ? 'primary' : ''}
                    onClick={() => void open(player)}
                  >
                    {selected?.eosId === player.eosId ? 'Masquer' : 'Preparer un envoi'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {offline.length === 0 && known.length > 0 && (
        <p className="hint">Tous les joueurs connus sont actuellement en ligne.</p>
      )}

      {selected && (
        <>
          {pending.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="card-header">
                <h3>
                  Deja en attente pour {selected.name}{' '}
                  <span className="hint">({pending.length})</span>
                </h3>
                <button type="button" onClick={() => void clear()}>
                  Vider la file
                </button>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Objet</th>
                    <th>Quantite</th>
                    <th>Mis en attente</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((item, index) => (
                    <tr key={`${item.blueprint}-${index}`}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{formatDate(item.queuedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <GiveItemPanel
            profile={profile}
            player={{
              index: -1,
              name: selected.name,
              platformName: '',
              eosId: selected.eosId,
              playerId: 0,
              tribeId: 0,
              dead: false,
              riding: false,
              position: null,
            }}
            queueOnly={!selected.online}
            onQueued={() => {
              setNotice(`Objets mis en attente pour ${selected.name}.`);
              void open(selected);
              void refresh();
            }}
          />
        </>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}
