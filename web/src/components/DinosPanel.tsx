import { useCallback, useEffect, useMemo, useState } from 'react';

import type { DinoCensus, DinoFilter, DinoInfo, ProfileRuntime, ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';

const PAGE_SIZE = 200;

type SortKey = 'species' | 'level' | 'sex' | 'lat' | 'lon' | 'status';

const FILTERS: { id: DinoFilter; label: string }[] = [
  { id: 'tamed', label: 'Apprivoisees' },
  { id: 'wild', label: 'Sauvages' },
  { id: 'all', label: 'Toutes' },
];

export function DinosPanel({
  profile,
  runtime,
}: {
  profile: ServerProfile;
  runtime: ProfileRuntime | undefined;
}) {
  const [filter, setFilter] = useState<DinoFilter>('tamed');
  const [species, setSpecies] = useState('');
  const [minLevel, setMinLevel] = useState(0);
  const [census, setCensus] = useState<DinoCensus | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('level');
  const [ascending, setAscending] = useState(false);

  const running = runtime?.status === 'running';

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        setCensus(
          await api.dinos(profile.id, { filter, species, minLevel, offset: nextOffset, limit: PAGE_SIZE }),
        );
        setOffset(nextOffset);
      } catch (cause) {
        setError((cause as Error).message);
        setCensus(null);
      } finally {
        setLoading(false);
      }
    },
    [profile.id, filter, species, minLevel],
  );

  // Chargement initial des seules creatures apprivoisees : leur nombre est borne,
  // contrairement aux sauvages qui se comptent par dizaines de milliers
  useEffect(() => {
    if (running) void load(0);
    // Les criteres ne relancent pas la requete : une recherche sur la carte
    // entiere est couteuse, elle reste declenchee a la demande
  }, [running]);

  const sorted = useMemo(() => {
    const rows = [...(census?.dinos ?? [])];
    const direction = ascending ? 1 : -1;

    rows.sort((a, b) => {
      switch (sort) {
        case 'species':
          return direction * a.species.localeCompare(b.species, 'fr');
        case 'sex':
          return direction * (Number(a.female) - Number(b.female));
        case 'status':
          return direction * (Number(a.tamed) - Number(b.tamed));
        case 'lat':
          return direction * (a.lat - b.lat);
        case 'lon':
          return direction * (a.lon - b.lon);
        default:
          return direction * (a.level - b.level);
      }
    });

    return rows;
  }, [census, sort, ascending]);

  function toggleSort(key: SortKey) {
    if (sort === key) setAscending((current) => !current);
    else {
      setSort(key);
      setAscending(false);
    }
  }

  const header = (key: SortKey, label: string, width?: number) => (
    <th
      style={{ width, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => toggleSort(key)}
      title="Trier"
    >
      {label}
      {sort === key && <span style={{ marginLeft: 4 }}>{ascending ? '▲' : '▼'}</span>}
    </th>
  );

  const hasMore = census !== null && census.offset + census.returned < census.matched;

  return (
    <>
      {!running && <div className="message error">Le serveur n'est pas en ligne.</div>}
      {error && <div className="message error">{error}</div>}

      <div className="panel">
        <h3>Recensement</h3>
        <p className="hint">
          Espece et niveau sont filtres par le serveur de jeu : une carte peuplee compte plusieurs dizaines de
          milliers de creatures, tout rapatrier pour filtrer ici prendrait des minutes. Le tri, lui, s'applique
          a la page affichee.
        </p>

        <div className="row" style={{ flexWrap: 'wrap' }}>
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={filter === entry.id ? 'primary' : ''}
              onClick={() => setFilter(entry.id)}
              disabled={!running || loading}
            >
              {entry.label}
            </button>
          ))}

          <input
            placeholder="Espece ou nom (ex. rex)"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && running && void load(0)}
            disabled={!running || loading}
            style={{ flex: 1, minWidth: 160 }}
          />

          <div className="field" style={{ width: 130, margin: 0 }}>
            <input
              type="number"
              min={0}
              value={minLevel}
              onChange={(e) => setMinLevel(Number(e.target.value) || 0)}
              disabled={!running || loading}
              title="Niveau minimum"
            />
          </div>

          <button type="button" className="primary" onClick={() => void load(0)} disabled={!running || loading}>
            {loading ? 'Recherche...' : 'Chercher'}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Creatures</h3>
          {census && (
            <span className="badge">
              {census.matched} sur la carte · {census.returned} affichees
            </span>
          )}
          <span className="spacer" />
          {census && census.offset > 0 && (
            <button type="button" onClick={() => void load(Math.max(0, offset - PAGE_SIZE))} disabled={loading}>
              Page precedente
            </button>
          )}
          {hasMore && (
            <button type="button" onClick={() => void load(offset + PAGE_SIZE)} disabled={loading}>
              Page suivante
            </button>
          )}
        </div>

        {census && census.matched > census.returned && (
          <p className="hint" style={{ marginTop: 0 }}>
            Resultats {census.offset + 1} a {census.offset + census.returned} sur {census.matched}. Affinez
            l'espece ou le niveau minimum pour reduire la liste.
          </p>
        )}

        {loading && <p className="log-empty">Recensement en cours...</p>}

        {!loading && sorted.length === 0 && !error && (
          <p className="log-empty" style={{ margin: 0 }}>
            {running ? 'Aucune creature ne correspond.' : 'Serveur hors ligne.'}
          </p>
        )}

        {sorted.length > 0 && (
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {header('species', 'Espece')}
                  {header('status', 'Statut', 120)}
                  {header('level', 'Niveau', 90)}
                  {header('sex', 'Sexe', 100)}
                  {header('lat', 'Lat', 80)}
                  {header('lon', 'Lon', 80)}
                </tr>
              </thead>
              <tbody>
                {sorted.map((dino, index) => (
                  <DinoRow key={`${dino.species}-${dino.lat}-${dino.lon}-${index}`} dino={dino} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function DinoRow({ dino }: { dino: DinoInfo }) {
  return (
    <tr>
      <td>
        {dino.species}
        {dino.name && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>« {dino.name} »</div>
        )}
      </td>
      <td>
        <span className="badge">{dino.tamed ? 'apprivoisee' : 'sauvage'}</span>
      </td>
      <td>
        {dino.level}
        {dino.tamed && dino.level !== dino.baseLevel && (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}> (base {dino.baseLevel})</span>
        )}
      </td>
      <td>{dino.female ? 'Femelle' : 'Male'}</td>
      <td className="mono">{dino.lat.toFixed(1)}</td>
      <td className="mono">{dino.lon.toFixed(1)}</td>
    </tr>
  );
}
