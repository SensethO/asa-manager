import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AuthState, LogLine, ProfileRuntime, ServerProfile } from '../../shared/types.js';
import { UnauthenticatedError, api, subscribeEvents } from './api.js';
import { StatusPill } from './components/StatusPill.js';
import { Dashboard } from './components/Dashboard.js';
import { ProfileSettings } from './components/ProfileSettings.js';
import { IniEditor } from './components/IniEditor.js';
import { DinosPanel } from './components/DinosPanel.js';
import { WildLevelsPanel } from './components/WildLevelsPanel.js';
import { PlayersPanel } from './components/PlayersPanel.js';
import { RconConsole } from './components/RconConsole.js';
import { ModsPanel } from './components/ModsPanel.js';
import { BackupsPanel } from './components/BackupsPanel.js';
import { SchedulePanel } from './components/SchedulePanel.js';
import { NewProfileDialog } from './components/NewProfileDialog.js';
import { AuthScreen } from './components/AuthScreen.js';
import { AccountMenu } from './components/AccountMenu.js';
import { AppSettingsPanel } from './components/AppSettingsPanel.js';
import { StacksPanel } from './components/StacksPanel.js';
import { BreedingPanel } from './components/BreedingPanel.js';
import { SpawnPanel } from './components/SpawnPanel.js';
import { WikiPanel } from './components/WikiPanel.js';
import { StrategicPanel } from './components/StrategicPanel.js';
import { UsersPanel } from './components/UsersPanel.js';

const TABS = [
  { id: 'dashboard', label: "Vue d'ensemble" },
  { id: 'settings', label: 'Parametres' },
  { id: 'ini', label: 'Configuration' },
  { id: 'mods', label: 'Mods' },
  { id: 'players', label: 'Joueurs' },
  { id: 'dinos', label: 'Creatures' },
  { id: 'wild-levels', label: 'Niveaux sauvages' },
  { id: 'stacks', label: 'Piles' },
  { id: 'breeding', label: 'Elevage' },
  { id: 'spawn', label: 'Invocation' },
  { id: 'wiki', label: 'Wiki' },
  { id: 'rcon', label: 'Console RCON' },
  { id: 'backups', label: 'Sauvegardes' },
  { id: 'schedule', label: 'Planification' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type View = 'profile' | 'app-settings' | 'users';

const MAX_LOG_LINES = 500;

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);

  const refreshAuth = useCallback(async () => {
    try {
      setAuth(await api.authState());
    } catch {
      // Service injoignable : on reste sur l'ecran de connexion plutot que
      // d'afficher une interface qui ne repondra a rien
      setAuth({ needsSetup: false, suggestedAdminEmail: '', session: null });
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  if (!auth) {
    return <div className="empty">Chargement...</div>;
  }

  if (auth.needsSetup || !auth.session) {
    return <AuthScreen state={auth} onAuthenticated={() => void refreshAuth()} />;
  }

  return <Manager auth={auth} onSignedOut={() => void refreshAuth()} />;
}

function Manager({ auth, onSignedOut }: { auth: AuthState; onSignedOut: () => void }) {
  const currentUser = auth.session!.user;
  const canEdit = currentUser.role !== 'viewer';
  const isAdmin = currentUser.role === 'admin';

  const [profiles, setProfiles] = useState<ServerProfile[]>([]);
  const [runtimes, setRuntimes] = useState<Record<string, ProfileRuntime>>({});
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>('profile');
  const [tab, setTab] = useState<TabId>('dashboard');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Une session expiree doit ramener a l'ecran de connexion, pas afficher une erreur */
  const handleFailure = useCallback(
    (cause: unknown) => {
      if (cause instanceof UnauthenticatedError) onSignedOut();
      else setError((cause as Error).message);
    },
    [onSignedOut],
  );

  const refreshProfiles = useCallback(async () => {
    try {
      const list = await api.listProfiles();
      setProfiles(list);
      setSelectedId((current) => current ?? list[0]?.id ?? null);
    } catch (cause) {
      handleFailure(cause);
    }
  }, [handleFailure]);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    return subscribeEvents((event) => {
      if (event.type === 'runtime') {
        setRuntimes((current) => ({ ...current, [event.runtime.profileId]: event.runtime }));
        return;
      }

      if (event.type === 'log') {
        const { profileId } = event.line;
        setLogs((current) => {
          const existing = current[profileId] ?? [];
          return { ...current, [profileId]: [...existing, event.line].slice(-MAX_LOG_LINES) };
        });
        return;
      }

      void refreshProfiles();
    });
  }, [refreshProfiles]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    void (async () => {
      try {
        const [history, runtime] = await Promise.all([api.logs(selectedId), api.runtime(selectedId)]);
        if (cancelled) return;

        setLogs((current) => ({ ...current, [selectedId]: history }));
        setRuntimes((current) => ({ ...current, [selectedId]: runtime }));
      } catch (cause) {
        if (!cancelled) handleFailure(cause);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, handleFailure]);

  const selected = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const runtime = selectedId ? runtimes[selectedId] : undefined;

  const handleProfileSaved = useCallback((updated: ServerProfile) => {
    setProfiles((current) => current.map((profile) => (profile.id === updated.id ? updated : profile)));
  }, []);

  const handleCreated = useCallback((profile: ServerProfile) => {
    setCreating(false);
    setProfiles((current) => [...current, profile]);
    setSelectedId(profile.id);
    setView('profile');
    setTab('settings');
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setProfiles((current) => current.filter((profile) => profile.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Gestionnaire ASA</h1>
          <p>ARK: Survival Ascended</p>
        </div>

        <div className="profile-list">
          {profiles.length === 0 && (
            <p className="log-empty" style={{ padding: 12 }}>
              Aucun profil.
            </p>
          )}

          {profiles.map((profile) => {
            const state = runtimes[profile.id];
            const active = profile.id === selectedId && view === 'profile';

            return (
              <button
                key={profile.id}
                type="button"
                className={`profile-item ${active ? 'active' : ''}`}
                onClick={() => {
                  setSelectedId(profile.id);
                  setView('profile');
                }}
              >
                <span className={`dot ${dotClass(state?.status)}`} />
                <span className="profile-item-body">
                  <span className="profile-item-name">{profile.name}</span>
                  <span className="profile-item-meta">
                    {profile.map} · {profile.gamePort}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="sidebar-footer">
          {canEdit && (
            <button
              type="button"
              className="primary"
              style={{ width: '100%', marginBottom: 8 }}
              onClick={() => setCreating(true)}
            >
              Nouveau profil
            </button>
          )}

          <button
            type="button"
            className={`profile-item ${view === 'app-settings' ? 'active' : ''}`}
            style={{ marginBottom: 4 }}
            onClick={() => setView('app-settings')}
          >
            Reglages de l'application
          </button>

          {isAdmin && (
            <button
              type="button"
              className={`profile-item ${view === 'users' ? 'active' : ''}`}
              style={{ marginBottom: 10 }}
              onClick={() => setView('users')}
            >
              Comptes utilisateurs
            </button>
          )}

          <AccountMenu user={currentUser} onSignedOut={onSignedOut} />
        </div>
      </aside>

      <main className="main">
        {error && (
          <div className="message error" style={{ margin: 16 }}>
            {error}{' '}
            <button type="button" onClick={() => setError(null)}>
              Fermer
            </button>
          </div>
        )}

        {view === 'app-settings' && (
          <>
            <div className="main-header">
              <h2>Reglages de l'application</h2>
            </div>
            <div className="content">
              <AppSettingsPanel currentUser={currentUser} />
            </div>
          </>
        )}

        {view === 'users' && (
          <>
            <div className="main-header">
              <h2>Comptes utilisateurs</h2>
            </div>
            <div className="content">
              <UsersPanel currentUser={currentUser} />
            </div>
          </>
        )}

        {view === 'profile' && !selected && (
          <div className="empty">
            <p>
              {canEdit
                ? 'Selectionnez un profil, ou creez-en un pour commencer.'
                : 'Aucun profil a afficher.'}
            </p>
          </div>
        )}

        {view === 'profile' && selected && (
          <>
            <div className="main-header">
              <h2>{selected.name}</h2>
              <StatusPill runtime={runtime} />
            </div>

            <nav className="tabs">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`tab ${tab === entry.id ? 'active' : ''}`}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </nav>

            <div className="content">
              {!canEdit && (
                <div className="message error">
                  Votre compte est en consultation seule : toute action modifiante sera refusee par le service.
                </div>
              )}

              {tab === 'dashboard' && (
                <Dashboard
                  profile={selected}
                  runtime={runtime}
                  logs={logs[selected.id] ?? []}
                  canEdit={canEdit}
                  onError={handleFailure}
                />
              )}
              {tab === 'settings' && (
                <ProfileSettings profile={selected} onSaved={handleProfileSaved} onDeleted={handleDeleted} />
              )}
              {tab === 'ini' && <StrategicPanel profile={selected} />}
              {tab === 'ini' && <IniEditor profile={selected} />}
              {tab === 'mods' && <ModsPanel profile={selected} onSaved={handleProfileSaved} />}
              {tab === 'players' && <PlayersPanel profile={selected} runtime={runtime} />}
              {tab === 'dinos' && <DinosPanel profile={selected} runtime={runtime} />}
              {tab === 'wild-levels' && <WildLevelsPanel profile={selected} runtime={runtime} />}
              {tab === 'stacks' && <StacksPanel profile={selected} />}
              {tab === 'breeding' && <BreedingPanel profile={selected} />}
              {tab === 'spawn' && <SpawnPanel profile={selected} />}
              {tab === 'wiki' && <WikiPanel />}
              {tab === 'rcon' && <RconConsole profile={selected} runtime={runtime} />}
              {tab === 'backups' && <BackupsPanel profile={selected} runtime={runtime} />}
              {tab === 'schedule' && <SchedulePanel profile={selected} onSaved={handleProfileSaved} />}
            </div>
          </>
        )}
      </main>

      {creating && <NewProfileDialog onCreated={handleCreated} onCancel={() => setCreating(false)} />}
    </div>
  );
}

function dotClass(status: ProfileRuntime['status'] | undefined): string {
  switch (status) {
    case 'running':
      return 'running';
    case 'starting':
    case 'stopping':
    case 'installing':
    case 'updating':
      return 'busy';
    case 'error':
      return 'error';
    default:
      return '';
  }
}
