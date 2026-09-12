import { useCallback, useEffect, useState } from 'react';

import type { CustomItem, ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';

/** Memes valeurs qu'EPrimalItemType, pour heriter du classement et de la qualite */
const TYPES = [
  { value: 5, label: 'Ressource' },
  { value: 0, label: 'Consommable' },
  { value: 1, label: 'Equipement (armure, selle)' },
  { value: 2, label: 'Arme ou outil' },
  { value: 3, label: 'Munition' },
  { value: 4, label: 'Structure' },
  { value: 6, label: 'Cosmetique' },
  { value: 7, label: "Accessoire d'arme" },
  { value: 8, label: 'Artefact' },
];

/**
 * Objets ajoutes a la main.
 *
 * Le catalogue lu dans le jeu ne connait que le `MasterItemList` de base : un
 * mod qui remplace les donnees de jeu y reste invisible. Ces entrees comblent
 * ce manque et se comportent ensuite comme n'importe quel objet du catalogue.
 */
export function CustomItemsPanel({ profile }: { profile: ServerProfile }) {
  const [items, setItems] = useState<CustomItem[]>([]);
  const [name, setName] = useState('');
  const [blueprint, setBlueprint] = useState('');
  const [type, setType] = useState(5);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setItems(await api.customItems(profile.id));
      } catch (cause) {
        setError((cause as Error).message);
      }
    })();
  }, [profile.id]);

  const add = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      setItems(await api.addCustomItem(profile.id, { name: name.trim(), blueprint: blueprint.trim(), type }));
      setName('');
      setBlueprint('');
      setNotice('Objet ajoute. Il apparait desormais dans la liste, recherche comprise.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, [profile.id, name, blueprint, type]);

  const remove = useCallback(
    async (target: string) => {
      try {
        setItems(await api.removeCustomItem(profile.id, target));
      } catch (cause) {
        setError((cause as Error).message);
      }
    },
    [profile.id],
  );

  return (
    <section className="card">
      <h3>Objets ajoutes a la main</h3>

      <p className="hint">
        Le catalogue est lu dans le jeu, mais un mod qui remplace les donnees de jeu y reste invisible.
        Saisissez ici le chemin de ses objets : ils rejoindront la liste, avec recherche, categorie,
        quantite et qualite comme les autres.
      </p>

      {error && <div className="message error">{error}</div>}
      {notice && <div className="message">{notice}</div>}

      <div className="field-row">
        <label style={{ flex: 1 }}>
          Nom affiche
          <input
            placeholder="facultatif, deduit du chemin"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label style={{ flex: 1 }}>
          Categorie
          <select value={type} onChange={(event) => setType(Number(event.target.value))}>
            {TYPES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Chemin du blueprint
        <input
          placeholder="Blueprint'/NomDuMod/Chemin/MonObjet.MonObjet'"
          value={blueprint}
          onChange={(event) => setBlueprint(event.target.value)}
        />
      </label>

      <p className="hint">
        Le chemin ne doit contenir aucune espace : les arguments de la commande du serveur de jeu sont
        separes par des espaces, un chemin en contenant casserait l'analyse.
      </p>

      <div className="actions">
        <button type="button" className="primary" onClick={() => void add()} disabled={busy || !blueprint.trim()}>
          {busy ? 'Ajout...' : 'Ajouter'}
        </button>
      </div>

      {items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Chemin</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.blueprint}>
                <td>{item.name}</td>
                <td className="hint" style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>
                  {item.blueprint}
                </td>
                <td>
                  <button type="button" onClick={() => void remove(item.blueprint)}>
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
