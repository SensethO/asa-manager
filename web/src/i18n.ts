import { useSyncExternalStore } from 'react';

/**
 * Choix de la langue de l'interface.
 *
 * La cle du dictionnaire est le texte francais lui-meme. Ce choix a une
 * consequence pratique qui vaut la contrainte : les composants gardent leurs
 * chaines francaises lisibles a l'endroit ou elles s'affichent, et une chaine
 * sans traduction se replie sur le francais au lieu de montrer une cle nue.
 * Une cle abstraite — `tabs.dashboard` — aurait rendu le code illisible et
 * chaque oubli visible comme un defaut.
 *
 * Pour traduire une chaine de plus : l'ajouter a EN, et entourer son
 * apparition de `t(...)`. Rien d'autre.
 */

export type Lang = 'fr' | 'en';

const CLE = 'asa-manager.lang';

/**
 * Traductions anglaises, indexees par le texte francais.
 *
 * Couvre la charpente : navigation, etats, actions communes. Les longs textes
 * explicatifs des onglets Elevage, Wiki et Reglages strategiques restent en
 * francais — les traduire fidelement est un travail de redaction, pas de
 * mecanique, et une traduction approximative y serait pire que rien.
 */
const EN: Record<string, string> = {
  // Navigation
  "Vue d'ensemble": 'Overview',
  Parametres: 'Settings',
  Configuration: 'Configuration',
  Mods: 'Mods',
  Joueurs: 'Players',
  Creatures: 'Creatures',
  'Niveaux sauvages': 'Wild levels',
  Piles: 'Stacks',
  Elevage: 'Breeding',
  Invocation: 'Spawning',
  Wiki: 'Wiki',
  'Console RCON': 'RCON console',
  Sauvegardes: 'Backups',
  Planification: 'Scheduling',

  // Etats du serveur
  Arrete: 'Stopped',
  Demarrage: 'Starting',
  'En ligne': 'Online',
  'Arret en cours': 'Stopping',
  Inconnu: 'Unknown',
  Installation: 'Installing',
  'Mise a jour': 'Updating',
  Erreur: 'Error',

  // Actions
  Demarrer: 'Start',
  'Arreter (avec preavis)': 'Stop (with notice)',
  'Arreter maintenant': 'Stop now',
  Redemarrer: 'Restart',
  Enregistrer: 'Save',
  Annuler: 'Cancel',
  Supprimer: 'Delete',
  Actualiser: 'Refresh',
  Rechercher: 'Search',
  Copier: 'Copy',
  Copie: 'Copied',
  Fermer: 'Close',

  // Tableau de bord
  Actions: 'Actions',
  Etat: 'Status',
  'Demarrer quand meme': 'Start anyway',
  'Duree de fonctionnement': 'Uptime',
  'Build installe': 'Installed build',
  Carte: 'Map',
  'Ports jeu / requete / RCON': 'Game / query / RCON ports',
  indetermine: 'undetermined',
  'non verifie': 'not checked',
  Journal: 'Log',
  PID: 'PID',
  'Build publie': 'Published build',
  'Serveur a jour': 'Server up to date',
  'Mise a jour disponible': 'Update available',

  // Charpente
  'Comptes utilisateurs': 'User accounts',
  'Nouveau profil': 'New profile',
  Application: 'Application',
  Utilisateurs: 'Users',
  'Selectionnez un profil, ou creez-en un pour commencer.':
    'Select a profile, or create one to get started.',
  'Aucun profil a afficher.': 'No profile to display.',
  'Votre compte est en consultation seule : toute action modifiante sera refusee par le service.':
    'Your account is read-only: any modifying action will be refused by the service.',
  Langue: 'Language',
};

// --- Magasin minimal, lisible par useSyncExternalStore ----------------------

function lire(): Lang {
  try {
    return localStorage.getItem(CLE) === 'en' ? 'en' : 'fr';
  } catch {
    // Navigateur qui refuse le stockage : le francais reste la valeur sure.
    return 'fr';
  }
}

let courante: Lang = lire();
const abonnes = new Set<() => void>();

function souscrire(rappel: () => void): () => void {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

export function getLang(): Lang {
  return courante;
}

export function setLang(lang: Lang): void {
  if (lang === courante) return;
  courante = lang;
  try {
    localStorage.setItem(CLE, lang);
  } catch {
    // Le choix vaut alors pour la session en cours seulement.
  }
  document.documentElement.lang = lang;
  for (const rappel of abonnes) rappel();
}

/** Langue courante, avec re-rendu des composants qui l'observent */
export function useLang(): Lang {
  return useSyncExternalStore(souscrire, getLang, getLang);
}

/**
 * Traduit une chaine francaise. Sans entree correspondante, renvoie le
 * francais : une traduction manquante se lit, elle ne casse pas l'ecran.
 */
export function traduire(texte: string, lang: Lang = courante): string {
  if (lang === 'fr') return texte;
  return EN[texte] ?? texte;
}

/** Forme abregee, pour les composants qui observent deja la langue */
export function useT(): (texte: string) => string {
  const lang = useLang();
  return (texte: string) => traduire(texte, lang);
}

document.documentElement.lang = courante;
