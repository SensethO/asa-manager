import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  ProfileRuntime,
  ServerProfile,
  WildLevelBand,
  WildLevelState,
} from '../../../shared/types.js';
import { api } from '../api.js';

/** Taille de l'echantillon preleve sur la carte pour mesurer le resultat reel */
const MEASURE_SIZE = 200;

export function WildLevelsPanel({
  profile,
  runtime,
}: {
  profile: ServerProfile;
  runtime: ProfileRuntime | undefined;
}) {
  const [state, setState] = useState<WildLevelState | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [minLevel, setMinLevel] = useState(1);
  const [maxLevel, setMaxLevel] = useState(150);
  const [bands, setBands] = useState<WildLevelBand[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [measured, setMeasured] = useState<{ counts: Map<number, number>; total: number } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const running = runtime?.status === 'running';

  const adopt = useCallback((next: WildLevelState) => {
    setState(next);
    setEnabled(next.enabled);
    setMinLevel(next.minLevel);
    setMaxLevel(next.maxLevel);
    setBands(next.bands);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await api.wildLevels(profile.id);
        if (!cancelled) adopt(next);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile.id, adopt]);

  // Les parts saisies n'ont pas besoin de totaliser 100 : elles sont ramenees a
  // 100 pour l'affichage comme pour le tirage
  const total = useMemo(() => bands.reduce((sum, band) => sum + band.percent, 0), [bands]);
  const share = useCallback((band: WildLevelBand) => (total > 0 ? (100 * band.percent) / total : 0), [total]);

  const generate = useCallback(() => {
    const next: WildLevelBand[] = [];
    const start = Math.max(1, Math.floor(minLevel / 10) * 10 || 1);

    for (let from = start; from <= maxLevel; from += 10) {
      next.push({ from: Math.max(from, minLevel), to: Math.min(from + 9, maxLevel), percent: 0 });
    }

    const each = next.length > 0 ? Number((100 / next.length).toFixed(2)) : 0;
    setBands(next.map((band) => ({ ...band, percent: each })));
    setNotice(null);
  }, [minLevel, maxLevel]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const next = await api.saveWildLevels(profile.id, { enabled, minLevel, maxLevel, bands });
      adopt(next);
      setNotice(
        next.hooked
          ? 'Reglages appliques. Ils ne concernent que les creatures qui apparaissent a partir de maintenant.'
          : 'Reglages enregistres. Ils prendront effet au prochain demarrage du serveur.',
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }, [profile.id, enabled, minLevel, maxLevel, bands, adopt]);

  /**
   * Mesure ce qui vit reellement sur la carte.
   *
   * Le tirage a blanc renvoye par le plugin dit ce qu'il compte appliquer ;
   * seul un releve sur la carte dit ce qui a effectivement ete applique.
   */
  const measure = useCallback(async () => {
    setMeasuring(true);
    setError(null);

    try {
      const census = await api.dinos(profile.id, {
        filter: 'wild',
        species: '',
        minLevel: 0,
        offset: 0,
        limit: MEASURE_SIZE,
      });

      const counts = new Map<number, number>();
      for (const dino of census.dinos) {
        const decade = Math.floor(dino.level / 10) * 10;
        counts.set(decade, (counts.get(decade) ?? 0) + 1);
      }

      setMeasured({ counts, total: census.dinos.length });
    } catch (cause) {
      setError((cause as Error).message);
      setMeasured(null);
    } finally {
      setMeasuring(false);
    }
  }, [profile.id]);

  /**
   * Supprime toutes les creatures sauvages pour qu'elles reapparaissent aux
   * nouveaux niveaux. Sans effet sur les creatures apprivoisees ni sur les
   * constructions, mais visible immediatement par les joueurs connectes : d'ou
   * la confirmation.
   */
  const renew = useCallback(async () => {
    const confirmed = window.confirm(
      'Supprimer toutes les creatures sauvages de la carte ?\n\n' +
        'Elles reapparaitront progressivement aux niveaux configures. Les creatures apprivoisees ne sont ' +
        'pas touchees.',
    );
    if (!confirmed) return;

    setRenewing(true);
    setError(null);
    setNotice(null);

    try {
      await api.rcon(profile.id, 'DestroyWildDinos');
      setNotice(
        'Faune sauvage supprimee. La repopulation prend quelques minutes : mesurez la repartition ensuite.',
      );
      setMeasured(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setRenewing(false);
    }
  }, [profile.id]);

  const updateBand = useCallback((index: number, patch: Partial<WildLevelBand>) => {
    setBands((current) => current.map((band, i) => (i === index ? { ...band, ...patch } : band)));
  }, []);

  if (loading) return <p className="log-empty">Chargement des reglages...</p>;

  return (
    <div className="panel-stack">
      {error && <div className="message error">{error}</div>}
      {notice && <div className="message">{notice}</div>}

      <section className="card">
        <h3>Niveaux des creatures sauvages</h3>
        <p className="hint">
          ARK ne sait pas faire cela nativement : la difficulte ne fixe qu'un plafond, les creatures
          apparaissant ensuite de 1 a ce maximum. Ces reglages sont appliques par le plugin AsaQoL, qui
          redefinit le niveau au moment de l'apparition.
        </p>

        {state && !state.hooked && (
          <div className="message error">
            Le plugin ne peut pas intercepter les apparitions sur ce serveur : les reglages ci-dessous sont
            enregistres mais sans effet. Verifiez qu'AsaQoL est charge, puis redemarrez le serveur.
          </div>
        )}

        <label className="checkbox">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Imposer les niveaux ci-dessous aux creatures sauvages
        </label>

        <div className="field-row">
          <label>
            Niveau minimum
            <input
              type="number"
              min={1}
              value={minLevel}
              onChange={(event) => setMinLevel(Number(event.target.value))}
            />
          </label>

          <label>
            Niveau maximum
            <input
              type="number"
              min={1}
              value={maxLevel}
              onChange={(event) => setMaxLevel(Number(event.target.value))}
            />
          </label>
        </div>

        <p className="hint">
          Seules les creatures qui apparaissent apres l'enregistrement sont concernees. Celles deja
          presentes gardent leur niveau jusqu'a leur disparition, et recoivent un nouveau niveau au
          prochain demarrage du serveur. Pour appliquer la consigne a toute la carte immediatement,
          renouvelez la faune ci-dessous.
        </p>
      </section>

      <section className="card">
        <div className="card-header">
          <h3>Ventilation par tranche de 10</h3>
          <button type="button" onClick={generate}>
            Generer les tranches
          </button>
        </div>

        {bands.length === 0 ? (
          <p className="hint">
            Aucune tranche : les niveaux sont tires au hasard, a parts egales, entre le minimum et le
            maximum.
          </p>
        ) : (
          <>
            <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>De</th>
                  <th>A</th>
                  <th>Part saisie</th>
                  <th>Part reelle</th>
                  <th aria-label="Repartition" />
                  <th />
                </tr>
              </thead>
              <tbody>
                {bands.map((band, index) => (
                  <tr key={`${band.from}-${index}`}>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={band.from}
                        onChange={(event) => updateBand(index, { from: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={band.to}
                        onChange={(event) => updateBand(index, { to: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={band.percent}
                        onChange={(event) => updateBand(index, { percent: Number(event.target.value) })}
                      />
                    </td>
                    <td className="nowrap">{share(band).toFixed(1)} %</td>
                    <td style={{ width: '40%' }}>
                      <Bar percent={share(band)} />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setBands((current) => current.filter((_, i) => i !== index))}
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <p className="hint">
              Total saisi : {total.toFixed(1)} %.{' '}
              {Math.abs(total - 100) > 0.5
                ? 'Les parts sont ramenees a 100 % automatiquement, la colonne « part reelle » indique ce qui sera applique.'
                : ''}
            </p>
          </>
        )}

        <div className="actions">
          <button
            type="button"
            onClick={() =>
              setBands((current) => [
                ...current,
                { from: maxLevel, to: maxLevel, percent: 0 },
              ])
            }
          >
            Ajouter une tranche
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer et appliquer'}
          </button>
        </div>
      </section>

      {state?.sample && state.sampleSize ? (
        <section className="card">
          <h3>Ce que le plugin applique</h3>
          <p className="hint">
            Tirage a blanc de {state.sampleSize.toLocaleString('fr-FR')} niveaux effectue par le plugin
            lui-meme : c'est la repartition que recevront les prochaines creatures.
          </p>

          <table className="table">
            <thead>
              <tr>
                <th>Tranche</th>
                <th>Part</th>
                <th aria-label="Repartition" />
              </tr>
            </thead>
            <tbody>
              {state.sample.map((entry) => (
                <tr key={entry.from}>
                  <td className="nowrap">
                    {entry.from} - {entry.to}
                  </td>
                  <td className="nowrap">{entry.percent.toFixed(1)} %</td>
                  <td style={{ width: '60%' }}>
                    <Bar percent={entry.percent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="card">
        <div className="card-header">
          <h3>Repartition reelle sur la carte</h3>
          <div className="actions">
            <button type="button" onClick={() => void renew()} disabled={!running || renewing}>
              {renewing ? 'Suppression...' : 'Renouveler la faune'}
            </button>
            <button type="button" onClick={() => void measure()} disabled={!running || measuring}>
              {measuring ? 'Mesure...' : 'Mesurer'}
            </button>
          </div>
        </div>

        <p className="hint">
          Releve d'un echantillon de {MEASURE_SIZE} creatures sauvages vivantes. Les creatures apparues
          avant le changement gardent leur niveau : tant qu'elles n'ont pas ete remplacees, la mesure reste
          proche de l'ancienne repartition.
        </p>

        {!running && <p className="hint">Serveur arrete : la mesure demande un serveur en fonctionnement.</p>}

        {measured && measured.total > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Tranche</th>
                <th>Creatures</th>
                <th>Part</th>
                <th aria-label="Repartition" />
              </tr>
            </thead>
            <tbody>
              {[...measured.counts.entries()]
                .sort((left, right) => left[0] - right[0])
                .map(([decade, count]) => (
                  <tr key={decade}>
                    <td className="nowrap">
                      {decade === 0 ? 1 : decade} - {decade + 9}
                    </td>
                    <td>{count}</td>
                    <td className="nowrap">{((100 * count) / measured.total).toFixed(1)} %</td>
                    <td style={{ width: '50%' }}>
                      <Bar percent={(100 * count) / measured.total} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Bar({ percent }: { percent: number }) {
  return (
    <span className="bar" title={`${percent.toFixed(1)} %`}>
      <span className="bar-fill" style={{ width: `${Math.min(100, percent)}%` }} />
    </span>
  );
}
