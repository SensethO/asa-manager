import { Fragment, useCallback, useEffect, useState } from 'react';

import type {
  PlayerContainers,
  PlayerDetail,
  PlayerInventory,
  PlayerStructures,
  ProfileRuntime,
  ServerProfile,
  WorldPosition,
} from '../../../shared/types.js';
import { api } from '../api.js';
import { GiveItemPanel } from './GiveItemPanel.js';
import { PlayerActionsPanel } from './PlayerActionsPanel.js';
import { OfflinePlayersPanel } from './OfflinePlayersPanel.js';
import { CustomItemsPanel } from './CustomItemsPanel.js';

/** Rafraichissement de la position, assez court pour suivre un deplacement */
const REFRESH_MS = 10_000;

function coords(position: WorldPosition | null): string {
  if (!position) return '—';
  return `Lat ${position.lat.toFixed(1)} / Lon ${position.lon.toFixed(1)}`;
}

export function PlayersPanel({
  profile,
  runtime,
}: {
  profile: ServerProfile;
  runtime: ProfileRuntime | undefined;
}) {
  const [players, setPlayers] = useState<PlayerDetail[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const running = runtime?.status === 'running';

  const refresh = useCallback(async () => {
    if (!running) {
      setPlayers([]);
      setLoading(false);
      return;
    }

    try {
      const list = await api.playerDetails(profile.id);
      setPlayers(list);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [profile.id, running]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const current = players.find((player) => player.eosId === selected) ?? null;

  return (
    <>
      {!running && <div className="message error">Le serveur n'est pas en ligne.</div>}
      {error && <div className="message error">{error}</div>}

      <div className="panel">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Joueurs connectes</h3>
          <span className="badge">{players.length}</span>
          <span className="spacer" />
          <button type="button" onClick={() => void refresh()} disabled={!running}>
            Actualiser
          </button>
        </div>

        <p className="hint">
          Position rafraichie toutes les {REFRESH_MS / 1000} secondes. Ces informations viennent du plugin
          AsaQoL : le RCON d'ARK ne sait, seul, que lister les noms.
        </p>

        {loading && running && <p className="log-empty">Chargement...</p>}

        {!loading && players.length === 0 && !error && (
          <p className="log-empty" style={{ margin: 0 }}>
            {running ? 'Aucun joueur connecte.' : 'Serveur hors ligne.'}
          </p>
        )}

        {players.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th style={{ width: 190 }}>Position</th>
                <th style={{ width: 110 }}>Tribu</th>
                <th style={{ width: 110 }}>Etat</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.eosId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{player.name || '(sans personnage)'}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {player.eosId}
                    </div>
                  </td>
                  <td className="mono">{coords(player.position)}</td>
                  <td className="mono">{player.tribeId || '—'}</td>
                  <td>
                    {player.dead && <span className="badge">mort</span>}
                    {player.riding && <span className="badge">en monture</span>}
                    {!player.dead && !player.riding && <span className="badge">a pied</span>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={selected === player.eosId ? 'primary' : ''}
                      onClick={() => setSelected(selected === player.eosId ? null : player.eosId)}
                    >
                      {selected === player.eosId ? 'Masquer' : 'Details'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <OfflinePlayersPanel profile={profile} />

      <CustomItemsPanel profile={profile} />

      {current && (
        <>
          <PlayerActionsPanel profile={profile} player={current} />
          <GiveItemPanel profile={profile} player={current} />
          <InventoryPanel profile={profile} player={current} />
          <ContainersPanel profile={profile} player={current} />
          <StructuresPanel profile={profile} player={current} />
        </>
      )}
    </>
  );
}

function InventoryPanel({ profile, player }: { profile: ServerProfile; player: PlayerDetail }) {
  const [inventory, setInventory] = useState<PlayerInventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCosmetics, setShowCosmetics] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInventory(await api.playerInventory(profile.id, player.eosId));
    } catch (cause) {
      setError((cause as Error).message);
      setInventory(null);
    } finally {
      setLoading(false);
    }
  }, [profile.id, player.eosId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Par defaut on ne montre que ce que le joueur porte reellement : ARK range
  // aussi dans l'inventaire les engrammes appris et tous les skins possedes,
  // qui representent l'essentiel du volume sans etre des objets portes.
  const items = (inventory?.items ?? []).filter(
    (item) => showCosmetics || (!item.engram && !item.skin),
  );

  return (
    <div className="panel">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Inventaire — {player.name}</h3>
        {inventory && (
          <span className="badge">
            {inventory.carried} portes · {inventory.skins} skins · {inventory.engrams} engrammes
          </span>
        )}
        <span className="spacer" />
        <label className="field inline" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={showCosmetics}
            onChange={(e) => setShowCosmetics(e.target.checked)}
          />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Inclure skins et engrammes</span>
        </label>
        <button type="button" onClick={() => void load()} disabled={loading}>
          Actualiser
        </button>
      </div>

      {error && <div className="message error">{error}</div>}
      {loading && <p className="log-empty">Lecture de l'inventaire...</p>}

      {!loading && !error && items.length === 0 && (
        <p className="log-empty" style={{ margin: 0 }}>
          Inventaire vide.
        </p>
      )}

      {items.length > 0 && (
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Objet</th>
                <th style={{ width: 90 }}>Quantite</th>
                <th style={{ width: 260 }}>Identifiant</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.blueprint}-${index}`}>
                  <td>
                    {item.name}
                    {item.engram && (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        engramme
                      </span>
                    )}
                    {item.skin && (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        skin
                      </span>
                    )}
                    {item.isBlueprint && (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        plan
                      </span>
                    )}
                  </td>
                  <td>{item.quantity}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {item.blueprint}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Contenu des coffres, structures a inventaire et montures de la tribu.
 *
 * Distinct de l'inventaire porte : c'est la question « ou sont mes affaires »,
 * qui n'a de reponse qu'en parcourant l'espace autour du joueur.
 */
function ContainersPanel({ profile, player }: { profile: ServerProfile; player: PlayerDetail }) {
  const [radius, setRadius] = useState(30000);
  const [data, setData] = useState<PlayerContainers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(
    async (value: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await api.playerContainers(profile.id, player.eosId, value));
      } catch (cause) {
        setError((cause as Error).message);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [profile.id, player.eosId],
  );

  useEffect(() => {
    void load(radius);
    // Sans `radius` : une requete spatiale large est couteuse, elle reste manuelle
  }, [load]);

  // Un contenant est retenu s'il porte le nom cherche, ou s'il contient un objet
  // qui le porte. La recherche ne descend pas plus loin que ce que le serveur a
  // renvoye : au-dela du plafond par contenant, un objet peut exister sans etre
  // trouve, et le compteur « objets supplementaires » le signale deja.
  const besoin = query.trim().toLowerCase();
  const correspond = (texte: string) => texte.toLowerCase().includes(besoin);

  const visibles = (data?.containers ?? [])
    .map((container, index) => ({ container, index }))
    .filter(({ container }) =>
      !besoin || correspond(container.name) || container.items.some((item) => correspond(item.name)),
    );

  return (
    <div className="panel">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Coffres et montures — {player.name}</h3>
        {data && (
          <span className="badge">
            {data.matched} remplis · {data.empty} vides · {data.totalItems} objets
          </span>
        )}
        {data?.truncated && <span className="badge pending">liste tronquee</span>}
        {besoin && (
          <span className="badge">
            {visibles.length} contenant{visibles.length > 1 ? 's' : ''} trouve{visibles.length > 1 ? 's' : ''}
          </span>
        )}
        <span className="spacer" />
        <div className="field" style={{ width: 220, margin: 0 }}>
          <input
            type="search"
            placeholder="Rechercher un objet"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            title="Ne garde que les contenants portant un objet de ce nom"
          />
        </div>
        <div className="field" style={{ width: 150, margin: 0 }}>
          <input
            type="number"
            min={1000}
            max={500000}
            step={5000}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value) || 30000)}
            title="Rayon de recherche en unites Unreal"
          />
        </div>
        <button type="button" onClick={() => void load(radius)} disabled={loading}>
          Chercher
        </button>
      </div>

      <p className="hint">
        Coffres, forges, parcelles et inventaires de montures appartenant a la tribu, autour du joueur. Les
        contenants vides sont comptes mais pas detailles.
      </p>

      {error && <div className="message error">{error}</div>}
      {loading && <p className="log-empty">Recherche en cours...</p>}

      {!loading && !error && data && data.containers.length === 0 && (
        <p className="log-empty" style={{ margin: 0 }}>
          Aucun contenant rempli dans ce rayon. Rapprochez le joueur de sa base, ou augmentez le rayon.
        </p>
      )}

      {!loading && !error && data && data.containers.length > 0 && visibles.length === 0 && (
        <p className="log-empty" style={{ margin: 0 }}>
          Aucun contenant ne porte « {query.trim()} » dans ce rayon.
        </p>
      )}

      {data && visibles.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Contenant</th>
              <th style={{ width: 190 }}>Coordonnees</th>
              <th style={{ width: 90 }}>Objets</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {visibles.map(({ container, index }) => (
              <Fragment key={`${container.name}-${index}`}>
                <tr>
                  <td>
                    {container.name}
                    <span className="badge" style={{ marginLeft: 8 }}>
                      {container.kind === 'creature' ? 'monture' : 'structure'}
                    </span>
                  </td>
                  <td className="mono">{coords(container.position)}</td>
                  <td>{container.itemCount}</td>
                  <td>
                    <button type="button" onClick={() => setOpened(opened === index ? null : index)}>
                      {opened === index ? 'Fermer' : 'Ouvrir'}
                    </button>
                  </td>
                </tr>
                {(opened === index || besoin !== '') && (
                  <tr>
                    <td colSpan={4} style={{ background: 'var(--bg-raised)' }}>
                      {container.items
                        .filter((item) => !besoin || correspond(item.name))
                        .map((item, itemIndex) => (
                          <div key={itemIndex} className="row" style={{ justifyContent: 'space-between' }}>
                            <span>{item.name}</span>
                            <span className="mono">x{item.quantity}</span>
                          </div>
                        ))}
                      {container.returned < container.itemCount && (
                        <div className="desc" style={{ marginTop: 6 }}>
                          {container.itemCount - container.returned} objets supplementaires non affiches.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StructuresPanel({ profile, player }: { profile: ServerProfile; player: PlayerDetail }) {
  const [radius, setRadius] = useState(30000);
  const [data, setData] = useState<PlayerStructures | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (value: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await api.playerStructures(profile.id, player.eosId, value));
      } catch (cause) {
        setError((cause as Error).message);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [profile.id, player.eosId],
  );

  useEffect(() => {
    void load(radius);
    // Volontairement sans `radius` : la recherche est relancee a la demande,
    // une requete spatiale large etant couteuse pour le serveur
  }, [load]);

  return (
    <div className="panel">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Constructions — {player.name}</h3>
        {data && <span className="badge">{data.matched} trouvees</span>}
        {data?.truncated && <span className="badge pending">liste tronquee</span>}
        <span className="spacer" />
        <div className="field" style={{ width: 150, margin: 0 }}>
          <input
            type="number"
            min={1000}
            max={500000}
            step={5000}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value) || 30000)}
            title="Rayon de recherche en unites Unreal"
          />
        </div>
        <button type="button" onClick={() => void load(radius)} disabled={loading}>
          Chercher
        </button>
      </div>

      <p className="hint">
        Recherche centree sur le joueur, limitee a sa tribu. Un rayon large coute cher au serveur : la
        requete n'est relancee que sur demande. 1 unite equivaut environ a 1 cm.
      </p>

      {error && <div className="message error">{error}</div>}
      {loading && <p className="log-empty">Recherche en cours...</p>}

      {data?.truncated && (
        <div className="message error">
          Plus de {data.returned} constructions dans ce rayon : la liste est tronquee. Reduisez le rayon
          pour une vue complete.
        </div>
      )}

      {!loading && !error && data && data.structures.length === 0 && (
        <p className="log-empty" style={{ margin: 0 }}>
          Aucune construction de cette tribu dans le rayon.
        </p>
      )}

      {data && data.structures.length > 0 && (
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Construction</th>
                <th style={{ width: 190 }}>Coordonnees carte</th>
                <th style={{ width: 260 }}>Position monde</th>
              </tr>
            </thead>
            <tbody>
              {data.structures.map((structure, index) => (
                <tr key={`${structure.name}-${index}`}>
                  <td>{structure.name}</td>
                  <td className="mono">{coords(structure.position)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {structure.position.x.toFixed(0)} / {structure.position.y.toFixed(0)} /{' '}
                    {structure.position.z.toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
