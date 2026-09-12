import { setLang, useLang, type Lang } from '../i18n.js';

/**
 * Bascule francais / anglais.
 *
 * Le choix vit dans le navigateur, pas dans le profil : deux personnes qui
 * administrent le meme serveur n'ont aucune raison de lire la meme langue.
 */
export function LangSwitch() {
  const lang = useLang();

  const bouton = (valeur: Lang, etiquette: string, titre: string) => (
    <button
      type="button"
      className={`tab ${lang === valeur ? 'active' : ''}`}
      style={{ padding: '2px 8px', fontSize: '0.8em', minWidth: 34 }}
      onClick={() => setLang(valeur)}
      title={titre}
      aria-pressed={lang === valeur}
    >
      {etiquette}
    </button>
  );

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {bouton('fr', 'FR', 'Interface en francais')}
      {bouton('en', 'EN', 'Interface in English')}
    </div>
  );
}
