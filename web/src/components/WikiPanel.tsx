import { useMemo, useState } from 'react';

import { TRAITS } from '../wiki/traits.js';

/**
 * Wiki du gestionnaire.
 *
 * Ce qu'on trouve en ligne sur ARK est abondant mais souvent recopie d'une
 * version a l'autre sans verification. Les pages d'ici s'appuient sur ce que
 * la machine peut prouver : les assets du Dev Kit, le binaire du serveur, les
 * fichiers de configuration. Quand une affirmation ne vient pas de la, elle le
 * dit.
 */

type PageId = 'accueil' | 'traits' | 'heredite' | 'admin';

const PAGES: { id: PageId; titre: string }[] = [
  { id: 'accueil', titre: 'Accueil' },
  { id: 'traits', titre: 'Traits genetiques' },
  { id: 'heredite', titre: 'Heredite et elevage' },
  { id: 'admin', titre: 'Commandes admin' },
];

const ORDRE_FAMILLES = [
  'Heredite',
  'Combat',
  'Cavalier',
  'Tourelle',
  'Transport',
  'Endurance',
  'Element',
  'Recolte',
  'Entretien',
  'Progression',
  'Divers',
  'A confirmer',
];

function PageTraits() {
  const [recherche, setRecherche] = useState('');
  const besoin = recherche.trim().toLowerCase();

  const visibles = useMemo(
    () =>
      TRAITS.filter((t) => t.id !== 'CarrierBase').filter(
        (t) =>
          !besoin
          || t.nom.toLowerCase().includes(besoin)
          || t.id.toLowerCase().includes(besoin)
          || t.fr.toLowerCase().includes(besoin)
          || t.effet.toLowerCase().includes(besoin)
          || t.famille.toLowerCase().includes(besoin),
      ),
    [besoin],
  );

  const familles = ORDRE_FAMILLES.filter((f) => visibles.some((t) => t.famille === f));

  return (
    <>
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Traits genetiques</h3>
        <span className="badge">{visibles.length} traits</span>
        <span className="spacer" />
        <div className="field" style={{ width: 260, margin: 0 }}>
          <input
            type="search"
            placeholder="Rechercher un trait ou un effet"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
      </div>

      <p className="hint">
        Un trait est une caracteristique heritable, independante des statistiques. Une creature en porte un
        nombre limite, et le scanner genetique permet d’en stocker pour les transferer. Chaque trait existe en
        plusieurs paliers : le palier fixe l’ampleur de l’effet, pas sa nature. Les valeurs affichees dans le
        jeu a la place de <span className="mono">{'{0}'}</span> dependent donc du palier, et pour certains
        traits aussi du poids de trainee de la creature — un effet identique rend moins sur une creature lourde.
      </p>

      <div className="message">
        Les libelles anglais ci-dessous sont <strong>releves dans les assets du jeu</strong>, pas recopies d’un
        guide. Les explications en francais sont les miennes. Huit traits restent marques « a confirmer » : leur
        effet n’etait pas extractible du fichier, et je prefere le dire plutot que de l’inventer.
      </div>

      {familles.map((famille) => (
        <section key={famille} style={{ marginTop: 22 }}>
          <h4 style={{ marginBottom: 6 }}>{famille}</h4>
          <table>
            <thead>
              <tr>
                <th style={{ width: 220 }}>Trait</th>
                <th>Effet</th>
              </tr>
            </thead>
            <tbody>
              {visibles
                .filter((t) => t.famille === famille)
                .map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.nom}</strong>
                      <div className="mono" style={{ fontSize: '0.8em', opacity: 0.65 }}>
                        {t.id}
                      </div>
                    </td>
                    <td>
                      {t.fr && <div>{t.fr}</div>}
                      <div className="desc" style={{ marginTop: t.fr ? 4 : 0 }}>
                        {t.effet}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}

      {visibles.length === 0 && (
        <p className="log-empty" style={{ margin: 0 }}>
          Aucun trait ne correspond a « {recherche.trim()} ».
        </p>
      )}
    </>
  );
}

function PageHeredite() {
  return (
    <>
      <h3 style={{ marginTop: 0 }}>Heredite et elevage</h3>

      <h4>Ni le pere ni la mere</h4>
      <p className="desc">
        La question revient sans cesse, et la reponse est dans le jeu lui-meme. Le texte des traits{' '}
        <span className="mono">Inherit_*</span> dit ceci, mot pour mot :
      </p>
      <blockquote className="desc" style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 12 }}>
        This Creature’s offspring have a +X% chance to inherit the <strong>higher</strong> Health stat of its
        parents
      </blockquote>
      <p className="desc">
        L’heredite se joue <strong>statistique par statistique</strong>, et le biais porte sur la{' '}
        <strong>meilleure valeur des deux parents</strong> — jamais sur le sexe. Un male et une femelle
        contribuent exactement pareil ; ce qui compte est lequel des deux detient la meilleure valeur pour
        chaque ligne, et cela peut changer d’une ligne a l’autre.
      </p>
      <p className="desc">
        La consequence pratique est contre-intuitive : il n’y a pas de « bon reproducteur » global. Il faut,
        pour chaque statistique visee, qu’<em>au moins un</em> des deux parents la possede. On accumule ligne
        par ligne au fil des generations.
      </p>

      <h4>Les traits qui deplacent cette probabilite</h4>
      <p className="desc">
        Dix-huit traits agissent directement dessus : six statistiques — vie, endurance, oxygene, nourriture,
        poids, melee — declinees en <strong>robuste</strong> (augmente la chance d’heriter la meilleure
        valeur), <strong>fragile</strong> (la diminue) et <strong>mutable</strong> (augmente la chance de
        mutation et l’oriente vers cette statistique). Ils sont listes dans la page Traits genetiques, famille
        « Heredite ».
      </p>
      <p className="desc">
        A noter, une curiosite qui prouve que ces textes viennent bien du jeu et non d’un guide :{' '}
        <span className="mono">Inherit_HP_Frail</span> parle de la statistique{' '}
        <em>Food</em> et <span className="mono">Inherit_Melee_Robust</span> de <em>Weight</em>. Ce sont des
        erreurs de copier-coller de l’editeur du jeu, dans le libelle seulement — la famille du fichier indique
        la vraie statistique concernee.
      </p>

      <h4>Ou le sexe compte reellement</h4>
      <p className="desc">
        Dans les compteurs de mutations. Chaque creature en porte deux, l’un cote maternel, l’autre cote
        paternel. La pratique courante consiste a garder une lignee de femelles aux compteurs bas pour pouvoir
        continuer a muter longtemps. C’est le seul endroit ou pere et mere ne sont pas interchangeables.
      </p>

      <h4>Verifier soi-meme</h4>
      <p className="desc">
        Le serveur est l’outil ideal : releve les sept statistiques des deux reproducteurs, fais une dizaine de
        petits, et compte combien de fois chaque ligne vient du meilleur des deux. Sur dix portees la tendance
        se voit deja.
      </p>

      <h4>Les reglages associes</h4>
      <p className="desc">
        Tout ce qui gouverne les durees — accouplement, incubation, croissance, empreinte — se regle dans
        l’onglet <strong>Elevage</strong>, qui explique aussi comment ces reglages se commandent les uns les
        autres. Le piege principal y est detaille : accelerer la croissance sans toucher a l’intervalle de
        calins rend l’empreinte a 100 % inatteignable.
      </p>
    </>
  );
}

function PageAdmin() {
  return (
    <>
      <h3 style={{ marginTop: 0 }}>Commandes admin</h3>

      <h4>Se donner les droits</h4>
      <p className="desc">
        En jeu, console ouverte par la touche <span className="mono">Tab</span> :{' '}
        <span className="mono">enablecheats MOTDEPASSE</span>, ou le mot de passe est celui de l’onglet
        Parametres du profil. C’est le meme que celui du RCON.
      </p>

      <h4>RCON ou console du jeu ?</h4>
      <p className="desc">
        Les deux n’acceptent pas les memes commandes. Tout ce qui se place <em>par rapport au joueur</em> —
        invoquer une creature devant soi, se teleporter — a besoin d’un personnage, et une connexion RCON n’en
        a pas : ces commandes se tapent dans le jeu. Le RCON convient a ce qui concerne le serveur entier :
        sauvegarder, diffuser un message, lister les joueurs.
      </p>

      <h4>Invoquer une creature</h4>
      <p className="desc">
        L’onglet <strong>Invocation</strong> genere la commande complete pour 333 creatures, chemins verifies
        un a un contre les fichiers du Dev Kit. Ces chemins ne se devinent pas : le dossier{' '}
        <span className="mono">Argentavis</span> contient <span className="mono">Argent_Character_BP</span>, le
        dossier <span className="mono">Ptero</span> contient <span className="mono">Ptero_Character_BP</span>.
        Un chemin errone ne provoque aucune erreur — la commande passe et rien n’apparait.
      </p>

      <h4>Le piege des niveaux sauvages</h4>
      <p className="desc">
        Tant que l’interception de l’onglet <strong>Niveaux sauvages</strong> est active, elle remplace le
        niveau de toute creature qui apparait, <em>y compris invoquee par commande</em>. Demander un niveau 150
        peut donc donner 123. Pour obtenir le niveau exact : desactiver dans l’onglet, lancer{' '}
        <span className="mono">qol.wildlevels reload</span> en RCON, invoquer, puis remettre en place.
      </p>

      <h4>Commandes du plugin AsaQoL</h4>
      <p className="desc">
        Elles s’utilisent en RCON et repondent en JSON. <span className="mono">qol.players</span> liste les
        joueurs connectes, <span className="mono">qol.dinos</span> les creatures apprivoisees,{' '}
        <span className="mono">qol.containers</span> les contenants autour d’un joueur,{' '}
        <span className="mono">qol.items</span> le catalogue d’objets (avec{' '}
        <span className="mono">reload=1</span> pour le reconstruire),{' '}
        <span className="mono">qol.deathcache</span> les depouilles,{' '}
        <span className="mono">qol.wildlevels simulate=10000</span> pour eprouver une distribution de niveaux
        sans rien faire apparaitre.
      </p>
    </>
  );
}

function PageAccueil({ aller }: { aller: (p: PageId) => void }) {
  return (
    <>
      <h3 style={{ marginTop: 0 }}>Wiki du gestionnaire</h3>
      <p className="desc">
        Ces pages rassemblent ce qui a ete etabli en travaillant sur ce serveur. Le principe qui les gouverne
        est simple : ce qu’on lit en ligne sur ARK est abondant mais souvent recopie d’une version a l’autre
        sans verification, et une affirmation fausse coute cher quand elle porte sur un reglage qui echoue en
        silence.
      </p>
      <p className="desc">
        Ici, chaque affirmation s’appuie autant que possible sur ce que la machine peut prouver — les assets du
        Dev Kit, le binaire du serveur, les fichiers de configuration — et le dit quand ce n’est pas le cas.
      </p>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" onClick={() => aller('traits')}>
          Traits genetiques
        </button>
        <button type="button" onClick={() => aller('heredite')}>
          Heredite et elevage
        </button>
        <button type="button" onClick={() => aller('admin')}>
          Commandes admin
        </button>
      </div>
    </>
  );
}

export function WikiPanel() {
  const [page, setPage] = useState<PageId>('accueil');

  return (
    <div className="panel">
      <div className="toolbar" style={{ marginBottom: 12 }}>
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={page === p.id ? 'primary' : undefined}
            onClick={() => setPage(p.id)}
          >
            {p.titre}
          </button>
        ))}
      </div>

      {page === 'accueil' && <PageAccueil aller={setPage} />}
      {page === 'traits' && <PageTraits />}
      {page === 'heredite' && <PageHeredite />}
      {page === 'admin' && <PageAdmin />}
    </div>
  );
}
