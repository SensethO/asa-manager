import { useEffect, useRef, useState } from 'react';

import type { PlayerInfo, ProfileRuntime, ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';

const SHORTCUTS = [
  { label: 'Sauvegarder le monde', command: 'SaveWorld' },
  { label: 'Lister les joueurs', command: 'ListPlayers' },
  { label: 'Message au serveur', command: 'ServerChat ' },
  { label: 'Sauvegarder et quitter', command: 'DoExit' },
  { label: 'Detruire les dinos sauvages', command: 'DestroyWildDinos' },
];

interface Props {
  profile: ServerProfile;
  runtime: ProfileRuntime | undefined;
}

interface Entry {
  echo: boolean;
  text: string;
}

/**
 * Bandeau d'annonce affiche a l'ecran des joueurs.
 *
 * Deux modes selon ce qui est installe sur le serveur : le plugin AsaQoL respecte
 * la duree demandee, tandis que le repli natif `Broadcast` s'affiche pour une duree
 * imposee par le jeu. L'interface annonce clairement lequel a servi.
 */
function AnnouncePanel({ profile, running }: { profile: ServerProfile; running: boolean }) {
  const [message, setMessage] = useState('');
  const [seconds, setSeconds] = useState(60);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function send() {
    if (!message.trim()) return;

    setSending(true);
    setResult(null);
    try {
      const outcome = await api.announce(profile.id, message.trim(), seconds);

      setResult(
        outcome.mode === 'plugin'
          ? { kind: 'ok', text: `Bandeau diffuse pendant ${outcome.seconds} s.` }
          : {
              kind: 'error',
              text:
                "Diffuse via Broadcast : AsaApi n'est pas installe sur ce serveur, la duree demandee " +
                "ne peut pas etre appliquee et l'affichage suivra la duree imposee par le jeu.",
            },
      );
      setMessage('');
    } catch (error) {
      setResult({ kind: 'error', text: (error as Error).message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel">
      <h3>Annonce a l'ecran</h3>
      <p className="hint">
        Message affiche en bandeau sur l'ecran de tous les joueurs, distinct du chat. La duree n'est
        respectee que si AsaApi et le plugin AsaQoL sont installes sur le serveur.
      </p>

      {result && <div className={`message ${result.kind}`}>{result.text}</div>}

      <div className="row">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          placeholder="Redemarrage dans 10 minutes, mettez vos dinos a l abri"
          disabled={!running || sending}
        />
        <div className="field" style={{ width: 130, margin: 0 }}>
          <input
            type="number"
            min={1}
            max={300}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value) || 60)}
            disabled={!running || sending}
            title="Duree d affichage en secondes"
          />
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => void send()}
          disabled={!running || sending || !message.trim()}
        >
          {sending ? 'Envoi...' : 'Afficher'}
        </button>
      </div>
      <div className="desc" style={{ marginTop: 6 }}>
        Duree en secondes, 60 par defaut.
      </div>
    </div>
  );
}

export function RconConsole({ profile, runtime }: Props) {
  const [command, setCommand] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);

  const running = runtime?.status === 'running';

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [entries]);

  // Rafraichit la liste tant que l'onglet est ouvert et le serveur en ligne
  useEffect(() => {
    if (!running) {
      setPlayers([]);
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const list = await api.players(profile.id);
        if (!cancelled) {
          setPlayers(list);
          setPlayersError(null);
        }
      } catch (error) {
        if (!cancelled) setPlayersError((error as Error).message);
      }
    };

    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [profile.id, running]);

  async function send(raw?: string) {
    const text = (raw ?? command).trim();
    if (!text) return;

    setSending(true);
    setEntries((current) => [...current, { echo: true, text: `> ${text}` }]);

    try {
      const result = await api.rcon(profile.id, text);
      setEntries((current) => [
        ...current,
        { echo: false, text: result.response.trim() || '(reponse vide)' },
      ]);
      setHistory((current) => [...current.filter((item) => item !== text), text].slice(-50));
    } catch (error) {
      setEntries((current) => [...current, { echo: false, text: `Erreur : ${(error as Error).message}` }]);
    } finally {
      setSending(false);
      setCommand('');
      setHistoryIndex(-1);
    }
  }

  /** Fleches haut/bas : rappel des commandes precedentes, comme un terminal */
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      void send();
      return;
    }

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (history.length === 0) return;

    event.preventDefault();
    const next =
      event.key === 'ArrowUp'
        ? Math.min(historyIndex + 1, history.length - 1)
        : Math.max(historyIndex - 1, -1);

    setHistoryIndex(next);
    setCommand(next === -1 ? '' : history[history.length - 1 - next]!);
  }

  return (
    <>
      {!running && (
        <div className="message error">
          Le serveur n'est pas en ligne : le RCON n'accepte aucune connexion.
        </div>
      )}

      <AnnouncePanel profile={profile} running={running} />

      <div className="panel">
        <h3>Console</h3>
        <p className="hint">
          Les commandes sont envoyees telles quelles, sans le prefixe "cheat". Fleches haut et bas pour rappeler
          l'historique.
        </p>

        <div className="chips">
          {SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut.command}
              type="button"
              className="chip"
              disabled={!running || sending}
              onClick={() =>
                shortcut.command.endsWith(' ') ? setCommand(shortcut.command) : void send(shortcut.command)
              }
            >
              {shortcut.label}
            </button>
          ))}
        </div>

        <div className="console-output" ref={outputRef}>
          {entries.length === 0 && <span className="log-empty">Aucune commande envoyee.</span>}
          {entries.map((entry, index) => (
            <div key={index} className={entry.echo ? 'console-echo' : undefined}>
              {entry.text}
            </div>
          ))}
        </div>

        <div className="row">
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Commande RCON..."
            disabled={!running || sending}
            style={{ fontFamily: 'var(--mono)' }}
          />
          <button type="button" className="primary" onClick={() => void send()} disabled={!running || sending}>
            Envoyer
          </button>
          <button type="button" onClick={() => setEntries([])} disabled={entries.length === 0}>
            Effacer
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>Joueurs connectes</h3>
        <p className="hint">Actualise toutes les 15 secondes. Identifiants utilisables pour bannir ou cibler.</p>

        {playersError && <div className="message error">{playersError}</div>}

        {players.length === 0 && !playersError && (
          <p className="log-empty" style={{ margin: 0 }}>
            {running ? 'Aucun joueur connecte.' : 'Serveur hors ligne.'}
          </p>
        )}

        {players.length > 0 && (
          <table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Nom</th>
                <th>Identifiant</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={`${player.index}-${player.id}`}>
                  <td>{player.index}</td>
                  <td>{player.name}</td>
                  <td className="mono">{player.id}</td>
                  <td>
                    <button type="button" onClick={() => void navigator.clipboard.writeText(player.id)}>
                      Copier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
