import { useCallback, useState } from 'react';

import type { PlayerDetail, ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';

/**
 * Actions d'administration sur un joueur connecte.
 *
 * Elles passent par le plugin AsaQoL plutot que par les commandes natives
 * d'ARK : le plugin s'execute cote serveur avec tous les droits et agit
 * directement sur le personnage, sans exiger que le joueur ouvre la console ni
 * s'authentifie. Verifie en jeu, c'est la seule voie qui fonctionne.
 */
export function PlayerActionsPanel({
  profile,
  player,
}: {
  profile: ServerProfile;
  player: PlayerDetail;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const grantCreative = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await api.rcon(profile.id, `qol.creative give=${player.eosId}`);

      // Le plugin rapporte chaque etape separement : un echec se designe
      // lui-meme au lieu d'etre muet
      const report = JSON.parse(result.response.trim()) as {
        granted?: boolean;
        hasCharacter?: boolean;
        hasCheatManager?: boolean;
        error?: string;
      };

      if (report.error) setError(report.error);
      else if (report.granted) {
        setNotice(
          `Mode creatif accorde a ${player.name}. Vol au saut, poids illimite, fabrication instantanee.`,
        );
      } else if (report.hasCharacter === false) {
        setError("Aucun personnage vivant : le joueur doit etre en jeu, pas a l'ecran de mort.");
      } else if (report.hasCheatManager === false) {
        setError("Le gestionnaire de triche n'a pas pu etre cree sur ce joueur.");
      } else {
        setError('Le jeu a refuse la bascule.');
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, [profile.id, player.eosId, player.name]);

  return (
    <section className="card">
      <h3>Actions sur {player.name || 'ce joueur'}</h3>

      {error && <div className="message error">{error}</div>}
      {notice && <div className="message">{notice}</div>}

      <div className="actions">
        <button type="button" disabled={busy} onClick={() => void grantCreative()}>
          {busy ? 'Envoi...' : 'Accorder le mode creatif'}
        </button>
      </div>

      <p className="hint">
        Le mode creatif n'ajoute aucun bouton au menu du joueur : il se constate en jeu, au vol libre et
        au poids illimite.
      </p>

      <p className="hint">
        <strong>Aucun retrait n'est propose.</strong> Il a ete implemente, puis retire : la desactivation
        faisait tomber le serveur sur une violation d'acces, dans le traitement du paquet RCON. Le mode
        creatif se perd de toute facon a la deconnexion du joueur, qui reste le moyen sur de revenir en
        arriere.
      </p>
    </section>
  );
}
