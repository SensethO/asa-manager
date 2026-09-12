import { useMemo, useState } from 'react';

import { CREATURES } from '../creatures.js';
import type { ServerProfile } from '../../../shared/types.js';

/**
 * Invocation de creatures sauvages.
 *
 * La commande elle-meme est triviale ; ce qui ne l'est pas, c'est le chemin du
 * blueprint. Les noms d'asset ne suivent aucune convention — dossier
 * `Argentavis` pour l'asset `Argent_Character_BP`, dossier `Ptero` pour
 * `Ptero_Character_BP` — et un chemin faux ne produit aucun message : la
 * commande passe, rien n'apparait. D'ou cette table relevee dans le contenu du
 * Dev Kit plutot que reconstituee de memoire.
 *
 * Le panneau n'execute rien. Ces commandes ont besoin de la position du joueur
 * pour placer la creature, ce qu'une connexion RCON n'a pas : elles se tapent
 * dans la console du jeu.
 */

const PACK_LABELS: Record<string, string> = {
  PrimalEarth: 'Jeu de base',
  ScorchedEarth: 'Scorched Earth',
  Aberration: 'Aberration',
  Extinction: 'Extinction',
  Genesis: 'Genesis',
  Genesis2: 'Genesis 2',
  Valguero: 'Valguero',
  LostIsland: 'Lost Island',
  LostColony: 'Lost Colony',
  Fjordur: 'Fjordur',
  EndGame: 'Fin de partie',
  ASA: 'Ascended',
  Packs: 'Packs',
  Mods: 'Mods',
};

export function SpawnPanel({ profile }: { profile: ServerProfile }) {
  const [recherche, setRecherche] = useState('');
  const [niveau, setNiveau] = useState(150);
  const [distance, setDistance] = useState(500);
  const [copie, setCopie] = useState<string | null>(null);

  const besoin = recherche.trim().toLowerCase();

  const visibles = useMemo(() => {
    if (!besoin) return CREATURES.slice(0, 60);
    return CREATURES.filter(
      (c) =>
        c.nom.toLowerCase().includes(besoin)
        || c.chemin.toLowerCase().includes(besoin)
        || (PACK_LABELS[c.pack] ?? c.pack).toLowerCase().includes(besoin),
    );
  }, [besoin]);

  const commande = (chemin: string) =>
    `cheat SpawnDino "Blueprint'${chemin}.${chemin.split('/').pop()}'" ${distance} 0 0 ${niveau}`;

  const copier = async (chemin: string) => {
    try {
      await navigator.clipboard.writeText(commande(chemin));
      setCopie(chemin);
      window.setTimeout(() => setCopie(null), 1500);
    } catch {
      // Le presse-papiers est refuse hors contexte securise : la commande
      // reste lisible et selectionnable a l'ecran, rien n'est perdu.
      setCopie(null);
    }
  };

  return (
    <div className="panel">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Invoquer une creature sauvage</h3>
        <span className="badge">{CREATURES.length} blueprints</span>
        <span className="spacer" />
        <div className="field" style={{ width: 240, margin: 0 }}>
          <input
            type="search"
            placeholder="Rechercher une creature"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <div className="field" style={{ width: 110, margin: 0 }}>
          <input
            type="number"
            min={1}
            max={1000}
            value={niveau}
            onChange={(e) => setNiveau(Number(e.target.value) || 1)}
            title="Niveau de la creature"
          />
        </div>
        <div className="field" style={{ width: 110, margin: 0 }}>
          <input
            type="number"
            min={0}
            max={10000}
            step={100}
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value) || 0)}
            title="Distance devant le joueur, en unites Unreal (100 = 1 metre)"
          />
        </div>
      </div>

      <p className="hint">
        Ces commandes se tapent <strong>dans le jeu</strong>, console ouverte par la touche{' '}
        <span className="mono">Tab</span>, apres <span className="mono">enablecheats</span> suivi du mot de
        passe administrateur du profil. Elles ne fonctionnent pas par RCON : la distance et les decalages se
        mesurent depuis ta position, et une connexion RCON n’a pas de personnage.
      </p>

      <div className="message">
        <strong>Les niveaux sauvages priment sur le niveau demande.</strong> Tant que l’interception de
        l’onglet <em>Niveaux sauvages</em> est active, elle remplace le niveau de toute creature qui apparait,
        y compris invoquee par cette commande. Pour obtenir exactement le niveau saisi ici : decoche
        l’activation dans cet onglet, lance <span className="mono">qol.wildlevels reload</span> dans la console
        RCON, invoque, puis remets tout en place.
      </div>

      {!besoin && (
        <p className="desc">
          Les soixante premieres par ordre alphabetique. Utilise la recherche pour trouver les autres — elle
          porte sur le nom, le chemin et l’extension d’origine.
        </p>
      )}

      {visibles.length === 0 && (
        <p className="log-empty" style={{ margin: 0 }}>
          Aucune creature ne correspond a « {recherche.trim()} ».
        </p>
      )}

      {visibles.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 220 }}>Creature</th>
              <th style={{ width: 130 }}>Origine</th>
              <th>Commande</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.chemin}>
                <td>{c.nom.replace(/_Character_BP$/, '')}</td>
                <td>
                  <span className="badge">{PACK_LABELS[c.pack] ?? c.pack}</span>
                </td>
                <td className="mono" style={{ fontSize: '0.85em', wordBreak: 'break-all' }}>
                  {commande(c.chemin)}
                </td>
                <td>
                  <button type="button" onClick={() => void copier(c.chemin)}>
                    {copie === c.chemin ? 'Copie' : 'Copier'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section style={{ marginTop: 24 }}>
        <h4>Pourquoi une table plutot qu’une regle</h4>
        <p className="desc">
          Les chemins ne se devinent pas. Le dossier <span className="mono">Argentavis</span> contient l’asset{' '}
          <span className="mono">Argent_Character_BP</span>, le dossier <span className="mono">Ptero</span>{' '}
          contient <span className="mono">Ptero_Character_BP</span>, et le dossier{' '}
          <span className="mono">Baryonyx</span> contient <span className="mono">Baryonyx_Character_BP</span>.
          Trois conventions pour trois creatures. Un chemin errone ne provoque aucune erreur : la commande est
          acceptee et rien n’apparait, ce qui est la pire facon d’echouer.
        </p>
        <p className="desc">
          Cette liste est relevee dans le contenu non cuisine du Dev Kit installe sur cette machine. Elle
          contient aussi des variantes qui ne sont pas des creatures apprivoisables ordinaires — formes alpha,
          invocations de boss, versions aberrantes ou spectrales. Le nom les distingue en general, mais dans le
          doute, invoque a bas niveau avant de recommencer au niveau voulu.
        </p>
        <p className="desc">
          Profil concerne : <span className="mono">{profile.name}</span>. Le mot de passe attendu par{' '}
          <span className="mono">enablecheats</span> est celui de l’onglet Parametres de ce profil.
        </p>
      </section>
    </div>
  );
}
