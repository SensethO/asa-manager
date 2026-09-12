import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../api.js';
import type { IniDocument, IniFileName, ServerProfile, SettingDescriptor } from '../../../shared/types.js';

/**
 * Apprivoisement et elevage.
 *
 * Ces reglages vivent deja dans l'editeur de configuration, disperses parmi
 * deux cents autres et ranges par ordre alphabetique. Les rassembler ne sert
 * pas seulement au confort : leur difficulte tient a ce qu'ils se commandent
 * les uns les autres, et cette dependance reste invisible tant qu'on les voit
 * separement. Accelerer la croissance sans toucher a l'intervalle de calins
 * rend l'empreinte a 100 % inatteignable, sans qu'aucun des deux reglages ne
 * le laisse deviner.
 *
 * Le panneau ne connait aucun nom de section ni de fichier : il les resout
 * depuis le catalogue. Une cle mal rangee est ainsi impossible.
 */

type Groupe = {
  titre: string;
  intro: string;
  cles: string[];
};

const GROUPES: Groupe[] = [
  {
    titre: 'Apprivoisement',
    intro:
      "Un apprivoisement se joue sur deux jauges opposees. La torpeur doit rester haute assez longtemps, "
      + "et la creature doit manger. L'efficacite — donc les niveaux gagnes a la sortie — depend de la "
      + "qualite de la nourriture, pas de la vitesse : accelerer ne coute aucun niveau.",
    cles: [
      'TamingSpeedMultiplier',
      'DinoCharacterFoodDrainMultiplier',
      'WildDinoCharacterFoodDrainMultiplier',
      'AllowRaidDinoFeeding',
    ],
  },
  {
    titre: 'Accouplement',
    intro:
      "Deux creatures apprivoisees, de sexes opposes, de la meme espece, en mode accouplement et assez "
      + "proches. Une fois l'accouplement termine, la femelle entre en latence : c'est cet intervalle qui "
      + "limite un elevage, pas la duree de l'accouplement lui-meme.",
    cles: [
      'MatingSpeedMultiplier',
      'MatingIntervalMultiplier',
      'LayEggIntervalMultiplier',
      'CryoHospitalMatingCooldownReduction',
    ],
  },
  {
    titre: 'Gestation et incubation',
    intro:
      "Les ovipares pondent un oeuf feconde qu'il faut couver a la bonne temperature ; les vivipares "
      + "portent leur petit. Deux mecaniques distinctes en jeu, mais un seul reglage les gouverne toutes "
      + "deux — d'ou la recherche vaine d'un multiplicateur de gestation, qui n'existe pas.",
    cles: ['EggHatchSpeedMultiplier'],
  },
  {
    titre: 'Croissance',
    intro:
      "Le petit traverse quatre ages : bebe, juvenile, adolescent, adulte. Il ne se nourrit seul qu'a "
      + "partir du stade juvenile — la phase bebe est celle qui exige une presence. Une croissance "
      + "acceleree la raccourcit, mais un bebe affame meurt : la faim se regle avec elle.",
    cles: ['BabyMatureSpeedMultiplier', 'BabyFoodConsumptionSpeedMultiplier'],
  },
  {
    titre: 'Empreinte',
    intro:
      "Le petit reclame des soins a intervalle regulier ; chacun ajoute un pourcentage d'empreinte, et "
      + "l'empreinte accorde un bonus de statistiques permanent. C'est ici que se joue la dependance "
      + "annoncee plus haut, detaillee sous les champs.",
    cles: [
      'BabyCuddleIntervalMultiplier',
      'BabyCuddleGracePeriodMultiplier',
      'BabyCuddleLoseImprintQualitySpeedMultiplier',
      'BabyImprintAmountMultiplier',
      'BabyImprintingStatScaleMultiplier',
      'AllowAnyoneBabyImprintCuddle',
      'DisableImprintDinoBuff',
    ],
  },
];

/** Un rythme d'ensemble. Les cles absentes d'un profil gardent leur valeur. */
const PROFILS: { nom: string; desc: string; valeurs: Record<string, string> }[] = [
  {
    nom: 'Officiel',
    desc: 'Les valeurs du jeu, sans acceleration.',
    valeurs: {
      TamingSpeedMultiplier: '1.0',
      MatingIntervalMultiplier: '1.0',
      EggHatchSpeedMultiplier: '1.0',
      BabyMatureSpeedMultiplier: '1.0',
      BabyCuddleIntervalMultiplier: '1.0',
      BabyFoodConsumptionSpeedMultiplier: '1.0',
    },
  },
  {
    nom: 'Accelere (x3)',
    desc: "Un elevage tient dans une soiree, l'empreinte reste atteignable sans y passer la nuit.",
    valeurs: {
      TamingSpeedMultiplier: '3.0',
      MatingIntervalMultiplier: '0.33',
      EggHatchSpeedMultiplier: '3.0',
      BabyMatureSpeedMultiplier: '3.0',
      BabyCuddleIntervalMultiplier: '0.33',
      BabyFoodConsumptionSpeedMultiplier: '1.0',
    },
  },
  {
    nom: 'Rapide (x10)',
    desc: 'Pour un serveur a peu de joueurs. La faim des bebes est reduite : ils grandissent vite et mangent moins.',
    valeurs: {
      TamingSpeedMultiplier: '10.0',
      MatingIntervalMultiplier: '0.1',
      EggHatchSpeedMultiplier: '10.0',
      BabyMatureSpeedMultiplier: '10.0',
      BabyCuddleIntervalMultiplier: '0.1',
      BabyFoodConsumptionSpeedMultiplier: '0.5',
    },
  },
];

/**
 * Les cles couvertes par ce panneau.
 *
 * L'editeur de configuration s'en sert pour les afficher sans les rendre
 * modifiables : deux endroits pour changer la meme ligne invitent a l'oubli,
 * et surtout privent des explications de dependance qui sont ici la vraie
 * valeur ajoutee. Le mode texte brut de l'editeur reste ouvert : rien n'est
 * jamais totalement hors d'atteinte.
 */
export const CLES_ELEVAGE: ReadonlySet<string> = new Set(GROUPES.flatMap((g) => g.cles));

const FICHIERS: IniFileName[] = ['GameUserSettings.ini', 'Game.ini'];

export function BreedingPanel({ profile }: { profile: ServerProfile }) {
  const [catalogue, setCatalogue] = useState<SettingDescriptor[]>([]);
  const [documents, setDocuments] = useState<Record<string, IniDocument>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [liste, ...lus] = await Promise.all([
        api.settingsCatalog(),
        ...FICHIERS.map((f) => api.readIni(profile.id, f)),
      ]);
      setCatalogue(liste);
      const docs: Record<string, IniDocument> = {};
      FICHIERS.forEach((f, i) => {
        const lu = lus[i];
        if (lu) docs[f] = lu.document;
      });
      setDocuments(docs);
      setEdits({});
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const descripteurs = useMemo(() => {
    const parCle = new Map<string, SettingDescriptor>();
    for (const d of catalogue) parCle.set(d.key, d);
    return parCle;
  }, [catalogue]);

  /** Valeur presente dans le fichier, ou null si la cle en est absente */
  const valeurFichier = useCallback(
    (d: SettingDescriptor): string | null => {
      const doc = documents[d.file];
      const section = doc?.sections.find((s) => s.name === d.section);
      const entree = section?.entries.find((e) => e.key === d.key);
      return entree ? entree.value : null;
    },
    [documents],
  );

  const valeurAffichee = (d: SettingDescriptor) =>
    edits[d.key] !== undefined ? edits[d.key] : valeurFichier(d) ?? d.defaultValue;

  const modifie = (d: SettingDescriptor) =>
    edits[d.key] !== undefined && edits[d.key] !== (valeurFichier(d) ?? d.defaultValue);

  const enAttente = Object.keys(edits).some((k) => {
    const d = descripteurs.get(k);
    return d ? modifie(d) : false;
  });

  const appliquerProfil = (valeurs: Record<string, string>) => {
    setEdits((precedent) => ({ ...precedent, ...valeurs }));
    setMessage("Valeurs proposees : rien n'est ecrit tant que vous n'avez pas enregistre.");
  };

  const enregistrer = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      for (const fichier of FICHIERS) {
        const changes: { section: string; key: string; occurrence: number; value: string }[] = [];
        const additions: { section: string; key: string; value: string }[] = [];

        for (const [cle, valeur] of Object.entries(edits)) {
          const d = descripteurs.get(cle);
          if (!d || d.file !== fichier || !modifie(d)) continue;

          // Une cle absente s'ajoute, une cle presente se remplace. Confondre
          // les deux creerait un doublon, et ARK ne retient que le dernier.
          if (valeurFichier(d) === null) additions.push({ section: d.section, key: d.key, value: valeur });
          else changes.push({ section: d.section, key: d.key, occurrence: 0, value: valeur });
        }

        if (changes.length === 0 && additions.length === 0) continue;
        await api.writeIniChanges(profile.id, fichier, changes, additions);
      }

      await load();
      setMessage('Enregistre. Les valeurs prendront effet au prochain demarrage du serveur.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const champ = (cle: string) => {
    const d = descripteurs.get(cle);
    if (!d) {
      return (
        <div key={cle} className="desc" style={{ opacity: 0.6 }}>
          <span className="mono">{cle}</span> — absent du catalogue, a regler dans l’onglet Configuration.
        </div>
      );
    }

    const absent = valeurFichier(d) === null;

    return (
      <div key={cle} className="field" style={{ marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{d.label}</span>
          {absent && <span className="badge">absent du fichier</span>}
          {modifie(d) && <span className="badge pending">modifie</span>}
        </label>

        {d.type === 'bool' ? (
          <select value={valeurAffichee(d)} onChange={(e) => setEdits((p) => ({ ...p, [cle]: e.target.value }))}>
            <option value="True">Oui</option>
            <option value="False">Non</option>
          </select>
        ) : (
          <input
            type="number"
            step="0.01"
            value={valeurAffichee(d)}
            onChange={(e) => setEdits((p) => ({ ...p, [cle]: e.target.value }))}
          />
        )}

        <p className="desc" style={{ marginTop: 4 }}>
          {d.description}{' '}
          <span className="mono">
            ({d.key} — defaut {d.defaultValue})
          </span>
        </p>
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Apprivoisement et elevage</h3>
        <span className="spacer" />
        {PROFILS.map((p) => (
          <button key={p.nom} type="button" title={p.desc} onClick={() => appliquerProfil(p.valeurs)}>
            {p.nom}
          </button>
        ))}
        <button type="button" className="primary" onClick={() => void enregistrer()} disabled={!enAttente || saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      {error && <div className="message error">{error}</div>}
      {message && <div className="message">{message}</div>}
      {loading && <p className="log-empty">Lecture des fichiers de configuration...</p>}

      {!loading && (
        <>
          <p className="hint">
            Ces reglages s’ecrivent dans <span className="mono">GameUserSettings.ini</span> et{' '}
            <span className="mono">Game.ini</span>, et ne prennent effet qu’au demarrage du serveur. Une cle
            absente du fichier suit la valeur du jeu : elle n’y est ajoutee que si vous la modifiez.
          </p>

          {GROUPES.map((g) => (
            <section key={g.titre} style={{ marginTop: 24 }}>
              <h4 style={{ marginBottom: 4 }}>{g.titre}</h4>
              <p className="hint" style={{ marginTop: 0 }}>
                {g.intro}
              </p>
              {g.cles.map(champ)}
            </section>
          ))}

          <section style={{ marginTop: 28 }}>
            <h4>Ce qui se commande mutuellement</h4>
            <p className="desc">
              <strong>Croissance et empreinte.</strong> Le petit reclame un soin a intervalle fixe, tandis que
              la croissance, elle, est raccourcie par son multiplicateur. Multiplier la croissance par dix sans
              rien changer d’autre divise donc par dix le nombre de soins possibles avant l’age adulte, et
              l’empreinte a 100 % devient inatteignable. Deux corrections au choix : reduire l’intervalle de
              calins dans la meme proportion, ou augmenter le gain par empreinte. Les profils ci-dessus
              retiennent la premiere.
            </p>
            <p className="desc">
              <strong>Croissance et faim.</strong> Un bebe consomme sans pouvoir se nourrir seul jusqu’au stade
              juvenile. Une croissance acceleree raccourcit cette phase, mais la consommation ne diminue pas
              d’elle-meme : sur un rythme eleve, reduire la faim des bebes evite de les retrouver morts entre
              deux connexions.
            </p>
            <p className="desc">
              <strong>Gestation et incubation.</strong> Un seul reglage gouverne les deux. Il n’existe pas de
              multiplicateur de gestation distinct, malgre ce que laissent croire beaucoup de guides.
            </p>
            <p className="desc">
              <strong>Vitesse et intervalle d’accouplement.</strong> Le premier n’agit que sur les quelques
              secondes de l’accouplement ; c’est le second, la latence de la femelle, qui determine le rythme
              reel d’un elevage.
            </p>
          </section>

          <section style={{ marginTop: 20 }}>
            <h4>Deux reglages volontairement absents</h4>
            <p className="desc">
              <span className="mono">PassiveTameIntervalMultiplier</span> — delai entre deux nourrissages d’un
              apprivoisement passif — et <span className="mono">WildDinoTorporDrainMultiplier</span> — vitesse
              a laquelle la torpeur d’une creature sauvage redescend — existent bien dans le binaire du jeu,
              mais ne figurent pas au catalogue, et le fichier ou ARK les lit n’a pas pu etre confirme. Une cle
              mal rangee est ignoree en silence : plutot que de la placer au jugé, elle est laissee de cote.
              L’onglet Configuration permet de les ajouter a la main.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
