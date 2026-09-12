import { useCallback, useEffect, useState } from 'react';

import { api } from '../api.js';
import type { ServerProfile } from '../../../shared/types.js';

/**
 * Reglages strategiques.
 *
 * Une poignee de choix qui changent la nature d'une partie, noyes ailleurs
 * parmi deux cents reglages ranges par ordre alphabetique.
 *
 * Le panneau affiche surtout la valeur que le serveur applique REELLEMENT,
 * lue sur le mode de jeu par le plugin. C'est la seule facon de savoir si une
 * cle a pris : ecrite dans la mauvaise section d'un .ini, elle est ignoree
 * sans le moindre message, et la configuration parait juste alors qu'elle
 * n'a aucun effet.
 */

type Reglage = {
  champ: string;
  nom: string;
  quoi: string;
  pourquoi: string;
};

type Groupe = { titre: string; intro: string; reglages: Reglage[] };

const GROUPES: Groupe[] = [
  {
    titre: 'Cryopodes',
    intro:
      "Le cryopode range une creature dans un objet. Trois choix independants : faut-il un cryofrigo a "
      + "proximite, la sortie inflige-t-elle un malus, et peut-on s'en servir au combat.",
    reglages: [
      {
        champ: 'bEnableCryopodNerf',
        nom: 'Mal des cryopodes',
        quoi: "A vrai, une creature qui sort d'un cryopode subit un malus temporaire : degats reduits et "
          + 'degats subis augmentes, pendant une duree fixee par les trois reglages suivants.',
        pourquoi:
          "C'est le garde-fou anti-« armee de poche » : sans lui, on deploie vingt creatures fraiches en "
          + 'pleine bataille. Sur un serveur paisible ou entre amis, il n a guere de raison d etre.',
      },
      {
        champ: 'CryopodNerfDuration',
        nom: 'Duree du malus',
        quoi: 'Duree du malus en secondes. Sans effet si le mal des cryopodes est desactive.',
        pourquoi: 'La valeur officielle tourne autour de dix secondes.',
      },
      {
        champ: 'CryopodNerfDamageMult',
        nom: 'Degats infliges pendant le malus',
        quoi: 'Multiplie les degats que la creature inflige pendant la duree du malus.',
        pourquoi: 'Une valeur basse rend la creature inoffensive a la sortie.',
      },
      {
        champ: 'CryopodNerfIncomingDamageMultPercent',
        nom: 'Degats subis pendant le malus',
        quoi: 'Augmente en pourcentage les degats que la creature subit pendant le malus.',
        pourquoi: 'Le versant defensif du meme garde-fou.',
      },
      {
        champ: 'bDisableCryopodFridgeRequirement',
        nom: 'Cryopode sans cryofrigo',
        quoi: "A vrai, on peut utiliser un cryopode sans cryofrigo a portee.",
        pourquoi:
          "C'est ce reglage, et non un autre, qui debloque l'usage des cryopodes en exploration. Il vit dans "
          + 'GameUserSettings.ini, section [ServerSettings].',
      },
      {
        champ: 'bDisableCryopodEnemyCheck',
        nom: 'Cryopode pres des ennemis',
        quoi: "A vrai, la presence d'ennemis n'empeche plus l'usage d'un cryopode.",
        pourquoi: 'Complement du precedent en PVP.',
      },
      {
        champ: 'bAllowCryoFridgeOnSaddle',
        nom: 'Cryofrigo sur plateforme',
        quoi: 'Autorise les cryofrigos sur les selles-plateformes et les radeaux.',
        pourquoi: 'Permet une base mobile transportant ses creatures.',
      },
      {
        champ: 'CryopodFridgeCooldownTime',
        nom: 'Delai du cryofrigo',
        quoi: 'Temps de recharge du cryofrigo, en secondes.',
        pourquoi: 'Seul reglage de cette famille declare dans les fichiers par defaut du jeu.',
      },
    ],
  },
  {
    titre: 'Apprivoisement',
    intro: 'Deux reglages absents du panneau Elevage, faute de savoir dans quel fichier ARK les lit.',
    reglages: [
      {
        champ: 'PassiveTameIntervalMultiplier',
        nom: 'Intervalle des apprivoisements passifs',
        quoi: 'Delai entre deux nourrissages lors d un apprivoisement sans assommage.',
        pourquoi:
          'Une valeur basse raccourcit les longues attentes des tames passifs, qui ne beneficient pas du '
          + "multiplicateur de vitesse d'apprivoisement ordinaire.",
      },
      {
        champ: 'WildDinoTorporDrainMultiplier',
        nom: 'Chute de torpeur des sauvages',
        quoi: 'Vitesse a laquelle la torpeur d une creature assommee redescend.',
        pourquoi:
          "Une valeur basse laisse plus de marge avant le reveil : c'est le reglage qui evite de perdre un "
          + 'tame long faute de narcotiques.',
      },
    ],
  },
];

export function StrategicPanel({ profile }: { profile: ServerProfile }) {
  const [valeurs, setValeurs] = useState<Record<string, number | boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.gameModeSettings(profile.id);
      setValeurs(payload.settings);
    } catch (cause) {
      setError((cause as Error).message);
      setValeurs(null);
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const affiche = (v: number | boolean | undefined) => {
    if (v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'Actif' : 'Inactif';
    return String(Math.round(v * 1000) / 1000);
  };

  return (
    <div className="panel">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Reglages strategiques</h3>
        <span className="spacer" />
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Lecture...' : 'Relire les valeurs actives'}
        </button>
      </div>

      <p className="hint">
        La colonne <strong>Valeur active</strong> n’est pas lue dans les fichiers : elle est lue{' '}
        <em>sur le serveur en marche</em>, telle qu’il l’applique. C’est ce qui permet de verifier qu’une cle a
        bien pris — ecrite dans la mauvaise section d’un fichier, elle serait ignoree sans aucun message, et la
        configuration paraitrait juste. La lecture demande donc un serveur demarre.
      </p>

      {error && (
        <div className="message error">
          {error} — cette lecture passe par le plugin AsaQoL et exige que le serveur soit en ligne.
        </div>
      )}

      {GROUPES.map((g) => (
        <section key={g.titre} style={{ marginTop: 22 }}>
          <h4 style={{ marginBottom: 4 }}>{g.titre}</h4>
          <p className="hint" style={{ marginTop: 0 }}>
            {g.intro}
          </p>
          <table>
            <thead>
              <tr>
                <th style={{ width: 260 }}>Reglage</th>
                <th style={{ width: 110 }}>Valeur active</th>
                <th>Ce que ca fait</th>
              </tr>
            </thead>
            <tbody>
              {g.reglages.map((r) => (
                <tr key={r.champ}>
                  <td>
                    <strong>{r.nom}</strong>
                    <div className="mono" style={{ fontSize: '0.8em', opacity: 0.65 }}>
                      {r.champ.replace(/^b/, '')}
                    </div>
                  </td>
                  <td className="mono">{valeurs ? affiche(valeurs[r.champ]) : '…'}</td>
                  <td>
                    <div>{r.quoi}</div>
                    <div className="desc" style={{ marginTop: 4 }}>
                      {r.pourquoi}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section style={{ marginTop: 24 }}>
        <h4>Comment les modifier</h4>
        <p className="desc">
          Ces reglages ne sont pas editables ici, et c’est delibere. Pour la plupart, le fichier et la section
          ou ARK les lit n’ont pas pu etre etablis : ils existent dans le binaire du jeu, mais ne figurent ni
          au catalogue du gestionnaire ni dans les fichiers de configuration livres avec le serveur. Les
          proposer a la saisie reviendrait a les ranger au jugé, et une cle mal rangee est ignoree en silence —
          le pire des echecs.
        </p>
        <p className="desc">
          La marche a suivre : ajoute la cle a la main dans l’onglet Configuration, en mode texte brut, sous{' '}
          <span className="mono">[/Script/ShooterGame.ShooterGameMode]</span> de{' '}
          <span className="mono">Game.ini</span> ou sous <span className="mono">[ServerSettings]</span> de{' '}
          <span className="mono">GameUserSettings.ini</span>. Redemarre, puis reviens ici : si la valeur active
          a change, tu as trouve le bon endroit. Sinon, essaie l’autre. Ce panneau existe pour rendre cet
          essai concluant en un coup d’oeil.
        </p>
      </section>
    </div>
  );
}
