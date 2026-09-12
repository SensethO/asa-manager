import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import type { GameItem, PlayerDetail, ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';
import { categoryOf, shortClass, TYPE_LABELS } from '../items.js';

/** Plafond accepte par le plugin pour une page */
const PAGE_SIZE = 300;

/** Paliers de qualite du jeu, du plus commun au plus rare */
const QUALITIES = [
  { value: 0, label: 'Commun' },
  { value: 1, label: 'Primitif' },
  { value: 2, label: 'Ouvrage' },
  { value: 3, label: 'Apprenti' },
  { value: 4, label: 'Journeyman' },
  { value: 5, label: 'Maitre-artisan' },
  { value: 6, label: 'Ascendant' },
];

/**
 * Seuls l'equipement et les armes portent une qualite dans ARK : armures,
 * selles, outils et armes. Les consommables, ressources, munitions, structures
 * et accessoires n'en ont pas, et proposer un choix sans effet induirait en
 * erreur.
 */
function supportsQuality(item: GameItem): boolean {
  if (item.type === 1 || item.type === 2) return true;

  // Un objet de mod n'a pas de type connu : il est deduit des manifestes, qui
  // ne le portent pas. Son nom de classe reste le seul indice.
  if (item.type === -1) return /Weapon|Armor|Saddle|Tool|Shield|Helmet|Pants|Boots|Gloves/i.test(item.blueprint);

  return false;
}

/**
 * Catalogue garde entre les ouvertures du panneau.
 *
 * Le service le conserve deja en memoire, mais le recharger a chaque ouverture
 * imposait trois allers-retours et un temps d'attente sans raison : son contenu
 * ne change qu'au redemarrage du serveur ou a l'ajout d'un mod.
 */
const catalogCache = new Map<string, GameItem[]>();

interface BasketLine {
  quantity: number;
  quality: number;
  asBlueprint: boolean;
}

interface Outcome {
  name: string;
  quantity: number;
  given: boolean;
  error: string;
}

export function GiveItemPanel({
  profile,
  player,
  queueOnly = false,
  onQueued,
}: {
  profile: ServerProfile;
  player: PlayerDetail;
  /** Joueur absent : les objets sont mis de cote au lieu d'etre remis */
  queueOnly?: boolean;
  onQueued?: () => void;
}) {
  const [all, setAll] = useState<GameItem[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  /** Panier : index de l'objet vers ce qui a ete demande pour lui */
  const [basket, setBasket] = useState<Map<number, BasketLine>>(new Map());

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  /**
   * Le catalogue entier est charge une fois, puis filtre dans le navigateur.
   *
   * Interroger le serveur a chaque frappe passait par le RCON, qui n'accepte
   * qu'une operation a la fois. Six cents entrees tiennent sans peine en memoire.
   */
  const load = useCallback(
    async (refresh: boolean) => {
      const cached = catalogCache.get(profile.id);
      if (cached && !refresh) {
        setAll(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const collected: GameItem[] = [];
        let offset = 0;

        for (let page = 0; page < 20; page++) {
          // Le rafraichissement ne porte que sur la premiere page : il vide le
          // cache du service, les suivantes lisent la liste reconstruite
          const batch = await api.items(profile.id, {
            search: '',
            offset,
            limit: PAGE_SIZE,
            refresh: refresh && page === 0,
          });

          collected.push(...batch.items);
          offset += batch.returned;
          if (batch.returned === 0 || offset >= batch.matched) break;
        }

        catalogCache.set(profile.id, collected);
        setAll(collected);
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [profile.id],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const byIndex = useMemo(() => new Map(all.map((item) => [item.index, item])), [all]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of all) {
      const name = categoryOf(item);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [all]);

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const groups = new Map<string, GameItem[]>();

    for (const item of all) {
      const name = categoryOf(item);
      if (category && name !== category) continue;
      if (term && !item.name.toLowerCase().includes(term) && !item.blueprint.toLowerCase().includes(term)) {
        continue;
      }

      const bucket = groups.get(name);
      if (bucket) bucket.push(item);
      else groups.set(name, [item]);
    }

    for (const bucket of groups.values()) {
      bucket.sort((a, b) => (a.name || a.blueprint).localeCompare(b.name || b.blueprint, 'fr'));
    }

    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [all, search, category]);

  const shown = useMemo(() => grouped.reduce((sum, [, items]) => sum + items.length, 0), [grouped]);

  const toggle = useCallback((index: number) => {
    setBasket((current) => {
      const next = new Map(current);
      if (next.has(index)) next.delete(index);
      else next.set(index, { quantity: 1, quality: 0, asBlueprint: false });
      return next;
    });
  }, []);

  const patchLine = useCallback((index: number, patch: Partial<BasketLine>) => {
    setBasket((current) => {
      const line = current.get(index);
      if (!line) return current;
      return new Map(current).set(index, { ...line, ...patch });
    });
  }, []);

  /**
   * Remise du panier, objet par objet.
   *
   * Les envois sont sequentiels : le RCON d'ARK n'accepte qu'une operation a la
   * fois. Un refus n'interrompt pas le reste — chaque ligne rapporte son propre
   * sort, pour qu'un echec isole ne fasse pas croire a un echec total.
   */
  const give = useCallback(async () => {
    if (basket.size === 0) return;

    setError(null);
    setOutcomes(null);

    // Joueur absent : rien a remettre maintenant, tout part en file d'attente
    if (queueOnly) {
      const items = [...basket.entries()].flatMap(([index, line]) => {
        const item = byIndex.get(index);
        if (!item) return [];

        return [{
          blueprint: item.blueprint,
          quantity: line.quantity,
          quality: supportsQuality(item) ? line.quality : 0,
          asBlueprint: supportsQuality(item) && line.asBlueprint,
          name: item.name || shortClass(item.blueprint),
        }];
      });

      try {
        await api.queuePending(profile.id, player.eosId, items);
        setBasket(new Map());
        onQueued?.();
      } catch (cause) {
        setError((cause as Error).message);
      }
      return;
    }

    const lines = [...basket.entries()];
    const results: Outcome[] = [];
    let done = 0;

    for (const [index, line] of lines) {
      const item = byIndex.get(index);
      if (!item) continue;

      const label = item.name || shortClass(item.blueprint);
      setProgress(`Remise ${++done}/${lines.length} : ${label}`);

      try {
        const result = await api.giveItem(profile.id, player.eosId, {
          blueprint: item.blueprint,
          quantity: line.quantity,
          // Une qualite posee sur un objet qui n'en porte pas serait ignoree par
          // le jeu, mais l'envoyer laisserait croire qu'elle a un effet
          quality: supportsQuality(item) ? line.quality : 0,
          asBlueprint: supportsQuality(item) && line.asBlueprint,
        });

        results.push({ name: label, quantity: line.quantity, given: result.given, error: result.error });
      } catch (cause) {
        results.push({
          name: label,
          quantity: line.quantity,
          given: false,
          error: (cause as Error).message,
        });
      }
    }

    setProgress(null);
    setOutcomes(results);

    // Le panier n'est vide que si tout est passe : ce qui a echoue reste
    // selectionne, pret a etre retente sans tout ressaisir
    const failed = new Set(results.filter((r) => !r.given).map((r) => r.name));
    if (failed.size === 0) setBasket(new Map());
  }, [basket, byIndex, profile.id, player.eosId, queueOnly, onQueued]);

  const totalItems = useMemo(
    () => [...basket.values()].reduce((sum, line) => sum + line.quantity, 0),
    [basket],
  );

  const succeeded = outcomes?.filter((r) => r.given) ?? [];
  const failures = outcomes?.filter((r) => !r.given) ?? [];

  return (
    <section className="card">
      <div className="card-header">
        <h3>{queueOnly ? 'Preparer des objets' : 'Donner des objets'}</h3>
        <span className="hint">
          {loading ? 'Lecture du catalogue...' : `${shown} / ${all.length} objets`}
        </span>
        <button type="button" onClick={() => void load(true)} disabled={loading || progress !== null}>
          Actualiser le catalogue
        </button>
      </div>

      {player.dead && (
        <div className="message error">
          Le personnage est mort : le jeu refusera la remise tant qu'il n'aura pas reapparu.
        </div>
      )}

      {error && <div className="message error">{error}</div>}
      {progress && <div className="message">{progress}</div>}

      {outcomes && (
        <div className={failures.length > 0 ? 'message error' : 'message'}>
          {succeeded.length > 0 && <div>{succeeded.length} objet(s) remis a {player.name}.</div>}
          {failures.length > 0 && (
            <div>
              {failures.length} refuse(s) :{' '}
              {failures.map((f) => `${f.name} (${f.error || 'refus du jeu'})`).join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="field-row">
        <label style={{ flex: 2 }}>
          Recherche
          <input
            type="search"
            placeholder="Nom ou nom de classe..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label style={{ flex: 1 }}>
          Categorie
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Toutes ({all.length})</option>
            {categories.map(([name, count]) => (
              <option key={name} value={name}>
                {name} ({count})
              </option>
            ))}
          </select>
        </label>
      </div>

      {!loading && all.length === 0 && (
        <p className="log-empty">
          Catalogue vide : le plugin AsaQoL doit etre charge et le serveur en fonctionnement.
        </p>
      )}

      {!loading && all.length > 0 && shown === 0 && <p className="log-empty">Aucun objet ne correspond.</p>}

      {shown > 0 && (
        <div className="table-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="table">
            <tbody>
              {grouped.map(([name, items]) => (
                <Fragment key={name}>
                  <tr>
                    <th colSpan={3} style={{ position: 'sticky', top: 0 }}>
                      {name} <span className="hint">({items.length})</span>
                    </th>
                  </tr>
                  {items.map((item) => (
                    <tr
                      key={item.index}
                      className={basket.has(item.index) ? 'active' : ''}
                      onClick={() => toggle(item.index)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ width: 32 }}>
                        <input
                          type="checkbox"
                          checked={basket.has(item.index)}
                          onChange={() => toggle(item.index)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      <td>{item.name || <em>sans nom</em>}</td>
                      <td className="hint" style={{ fontSize: '0.8em' }}>
                        {shortClass(item.blueprint)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {basket.size > 0 && (
        <>
          <div className="card-header" style={{ marginTop: 16 }}>
            <h3>
              Selection <span className="hint">({basket.size} objet(s), {totalItems} unite(s))</span>
            </h3>
            <button type="button" onClick={() => setBasket(new Map())} disabled={progress !== null}>
              Tout retirer
            </button>
          </div>

          <div className="table-scroll" style={{ maxHeight: 260, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Objet</th>
                  <th style={{ width: 110 }}>Quantite</th>
                  <th style={{ width: 160 }}>Qualite</th>
                  <th style={{ width: 70 }}>Plan</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {[...basket.entries()].map(([index, line]) => {
                  const item = byIndex.get(index);
                  if (!item) return null;

                  const gradable = supportsQuality(item);

                  return (
                    <tr key={index}>
                      <td>{item.name || shortClass(item.blueprint)}</td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={line.quantity}
                          onChange={(event) =>
                            patchLine(index, {
                              quantity: Math.min(10_000, Math.max(1, Number(event.target.value) || 1)),
                            })
                          }
                        />
                      </td>
                      <td>
                        {gradable ? (
                          <select
                            value={line.quality}
                            onChange={(event) => patchLine(index, { quality: Number(event.target.value) })}
                          >
                            {QUALITIES.map((entry) => (
                              <option key={entry.value} value={entry.value}>
                                {entry.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="hint">sans qualite</span>
                        )}
                      </td>
                      <td>
                        {gradable ? (
                          <input
                            type="checkbox"
                            checked={line.asBlueprint}
                            onChange={(event) => patchLine(index, { asBlueprint: event.target.checked })}
                            title="Remettre le plan plutot que l'objet fini"
                          />
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                      <td>
                        <button type="button" onClick={() => toggle(index)} disabled={progress !== null}>
                          Retirer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="hint">
            Qualite et plan ne concernent que l'equipement et les armes — armures, selles, outils, armes.
            Les consommables, ressources et munitions n'en portent pas.
          </p>
        </>
      )}

      <p className="hint">
        Catalogue lu dans le jeu lui-meme, pas dans une liste ecrite a la main : il suit la version
        installee et inclut les objets des mods.
      </p>

      <div className="actions">
        <span className="hint">
          {basket.size === 0 ? 'Aucun objet selectionne' : `${basket.size} objet(s) a remettre`}
        </span>
        <button
          type="button"
          className="primary"
          onClick={() => void give()}
          disabled={basket.size === 0 || progress !== null}
        >
          {progress
            ? 'Remise en cours...'
            : queueOnly
              ? `Mettre en attente pour ${player.name}`
              : `Donner a ${player.name}`}
        </button>
      </div>
    </section>
  );
}

/** Ne garde que le nom de classe : le chemin complet est illisible dans un tableau */
