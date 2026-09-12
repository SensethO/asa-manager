import { useEffect, useRef, useState } from 'react';

import type { LogLine, ProfileRuntime, ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';

interface Props {
  profile: ServerProfile;
  runtime: ProfileRuntime | undefined;
  logs: LogLine[];
  /** Faux pour un compte en consultation seule : les actions sont grisees */
  canEdit: boolean;
  onError: (cause: unknown) => void;
}

export function Dashboard({ profile, runtime, logs, canEdit, onError }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  /** Dernier build publie connu ; `null` tant qu'aucune verification n'a abouti */
  const [latestBuild, setLatestBuild] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  /** Ecart constate au moment d'un demarrage : il suspend l'action */
  const [gate, setGate] = useState<{ installed: string; latest: string } | null>(null);

  const status = runtime?.status ?? 'stopped';
  const busy = status === 'starting' || status === 'stopping' || status === 'installing' || status === 'updating';
  const running = status === 'running';
  const locked = !canEdit || Boolean(pending);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  async function run(label: string, action: () => Promise<unknown>) {
    setPending(label);
    try {
      await action();
    } catch (error) {
      onError(error);
    } finally {
      setPending(null);
    }
  }

  const uptime = runtime?.startedAt ? formatUptime(new Date(runtime.startedAt)) : '—';
  const installedBuild = runtime?.installedBuildId ?? null;
  const outdated = Boolean(latestBuild && installedBuild && latestBuild !== installedBuild);

  /**
   * Interroge Steam et retourne le build publie.
   *
   * Une reponse illisible vaut « inconnu », jamais « a jour » : c'est la seule
   * lecture prudente, faute de quoi une panne de SteamCMD passerait pour un
   * feu vert.
   */
  async function checkLatest(): Promise<string | null> {
    const { buildId } = await api.latestBuild(profile.id);
    setLatestBuild(buildId);
    setChecked(true);
    return buildId;
  }

  /**
   * Demarrage avec verification prealable de la version.
   *
   * Un serveur reste sur la version installee alors que Steam met les clients a
   * jour tout seuls. L'ecart ne se voit nulle part au demarrage : la connexion
   * echoue plus tard, apres le chargement des mods, sans message cote serveur.
   * D'ou ce controle avant de lancer, plutot qu'un diagnostic apres coup.
   */
  async function startWithCheck(force: boolean) {
    setPending('start');
    setGate(null);
    try {
      if (!force) {
        const latest = await checkLatest();
        if (latest && installedBuild && latest !== installedBuild) {
          setGate({ installed: installedBuild, latest });
          return;
        }
      }
      await api.start(profile.id);
    } catch (error) {
      onError(error);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="panel">
        <h3>Actions</h3>
        <p className="hint">
          L'arret et le redemarrage diffusent les preavis configures dans l'onglet Planification avant de couper.
        </p>

        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className="primary"
            disabled={running || busy || locked}
            onClick={() => void startWithCheck(false)}
          >
            Demarrer
          </button>

          <button
            type="button"
            disabled={!running || locked}
            onClick={() => run('stop', () => api.stop(profile.id, false))}
          >
            Arreter (avec preavis)
          </button>

          <button
            type="button"
            disabled={!running || locked}
            onClick={() => run('stop-now', () => api.stop(profile.id, true))}
          >
            Arreter maintenant
          </button>

          <button
            type="button"
            disabled={!running || locked}
            onClick={() => run('restart', () => api.restart(profile.id, false))}
          >
            Redemarrer
          </button>

          {status === 'stopping' && (
            <button
              type="button"
              disabled={locked}
              onClick={() => run('cancel', () => api.cancelStop(profile.id))}
            >
              Annuler l'arret
            </button>
          )}

          <span className="spacer" />

          <button
            type="button"
            disabled={busy || locked}
            onClick={() => run('install', () => api.install(profile.id))}
          >
            Installer / Verifier
          </button>

          <button
            type="button"
            disabled={busy || locked}
            onClick={() => run('check', async () => { await checkLatest(); })}
          >
            Verifier la version
          </button>

          <button
            type="button"
            disabled={busy || locked}
            onClick={() => run('update', () => api.update(profile.id))}
          >
            Mettre a jour
          </button>

          <button
            type="button"
            className="danger"
            disabled={runtime?.pid == null || locked}
            onClick={() => run('kill', () => api.kill(profile.id))}
          >
            Terminer de force
          </button>
        </div>

        {gate && (
          <div className="message error" style={{ marginTop: 14 }}>
            <strong>Une mise a jour du serveur est disponible.</strong>
            <div style={{ marginTop: 6 }}>
              Installe {gate.installed}, publie {gate.latest}. Steam met les clients a jour tout seuls :
              tant que le serveur reste en arriere, les joueurs chargeront les mods puis perdront la
              connexion, sans qu'aucune erreur n'apparaisse dans le journal du serveur.
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="primary"
                disabled={locked}
                onClick={() => { setGate(null); void run('update', () => api.update(profile.id)); }}
              >
                Mettre a jour
              </button>
              <button type="button" disabled={locked} onClick={() => void startWithCheck(true)}>
                Demarrer quand meme
              </button>
              <button type="button" onClick={() => setGate(null)}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {checked && !gate && (
          <div className={`message ${outdated ? 'error' : ''}`} style={{ marginTop: 14 }}>
            {latestBuild === null
              ? "Version publiee indeterminee : SteamCMD n'a rien renvoye d'exploitable. L'etat est inconnu, pas forcement a jour."
              : outdated
                ? `Mise a jour disponible : ${installedBuild ?? '—'} installe, ${latestBuild} publie.`
                : `Serveur a jour (build ${latestBuild}).`}
          </div>
        )}

        {runtime?.lastError && <div className="message error" style={{ marginTop: 14 }}>{runtime.lastError}</div>}
      </div>

      <div className="panel">
        <h3>Etat</h3>
        <div className="stats" style={{ marginTop: 12 }}>
          <Stat label="Joueurs" value={running ? `${runtime?.playersOnline ?? '—'} / ${profile.maxPlayers}` : '—'} />
          <Stat label="Duree de fonctionnement" value={uptime} />
          <Stat label="PID" value={runtime?.pid ? String(runtime.pid) : '—'} />
          <Stat label="Build installe" value={installedBuild ?? '—'} />
          <Stat label="Build publie" value={checked ? (latestBuild ?? 'indetermine') : 'non verifie'} />
          <Stat label="Carte" value={profile.map} />
          <Stat label="Ports jeu / requete / RCON" value={`${profile.gamePort} / ${profile.queryPort} / ${profile.rconPort}`} />
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Journal</h3>
          <span className="spacer" />
          <label className="field inline" style={{ margin: 0 }}>
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Suivre</span>
          </label>
        </div>

        <div className="log" ref={logRef}>
          {logs.length === 0 && <div className="log-empty">Aucune activite pour le moment.</div>}
          {logs.map((line, index) => (
            <div key={`${line.at}-${index}`} className={`log-line ${line.level}`}>
              <span className="log-time">{new Date(line.at).toLocaleTimeString('fr-FR')}</span>
              <span className="log-source">{line.source}</span>
              <span className="log-text">{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" title={value}>
        {value}
      </div>
    </div>
  );
}

function formatUptime(since: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - since.getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}
