import { useCallback, useEffect, useState } from 'react';

import type { User, UserRole } from '../../../shared/types.js';
import { api } from '../api.js';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  operator: 'Operateur',
  viewer: 'Lecteur',
};

const ROLE_HELP: Record<UserRole, string> = {
  admin: 'Tout, y compris la gestion des comptes et des reglages de l application.',
  operator: 'Pilotage des serveurs, configuration, mods, sauvegardes.',
  viewer: 'Consultation seule : aucune action modifiante.',
};

export function UsersPanel({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('operator');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api.listUsers());
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(success: string, action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage({ kind: 'ok', text: success });
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function create() {
    void act('Compte cree.', async () => {
      await api.createUser(email.trim(), password, role);
      setEmail('');
      setPassword('');
    });
  }

  function resetPassword(user: User) {
    const next = prompt(`Nouveau mot de passe pour ${user.email} (10 caracteres minimum) :`);
    if (!next) return;

    void act('Mot de passe change. Les sessions de ce compte sont fermees.', () =>
      api.setUserPassword(user.id, next),
    );
  }

  return (
    <>
      {message && <div className={`message ${message.kind}`}>{message.text}</div>}

      <div className="panel">
        <h3>Ajouter un compte</h3>
        <p className="hint">
          Vous definissez un mot de passe initial que le titulaire pourra changer lui-meme depuis son menu de
          session.
        </p>

        <div className="grid">
          <div className="field">
            <label htmlFor="newEmail">Adresse electronique</label>
            <input id="newEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="newPassword">Mot de passe initial</label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="desc">10 caracteres minimum.</div>
          </div>

          <div className="field">
            <label htmlFor="newRole">Role</label>
            <select id="newRole" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </select>
            <div className="desc">{ROLE_HELP[role]}</div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="primary"
            onClick={create}
            disabled={busy || !email.trim() || password.length < 10}
          >
            Creer le compte
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Comptes</h3>
          <span className="badge">{users.length}</span>
          <span className="spacer" />
          <button type="button" onClick={() => void load()} disabled={busy}>
            Actualiser
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Adresse</th>
              <th style={{ width: 190 }}>Role</th>
              <th style={{ width: 170 }}>Derniere connexion</th>
              <th style={{ width: 260 }} />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUser.id;

              return (
                <tr key={user.id}>
                  <td>
                    {user.email}
                    {isSelf && (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        vous
                      </span>
                    )}
                  </td>
                  <td>
                    <select
                      value={user.role}
                      disabled={busy}
                      onChange={(e) =>
                        void act('Role modifie.', () =>
                          api.updateUser(user.id, { role: e.target.value as UserRole }),
                        )
                      }
                    >
                      {(Object.keys(ROLE_LABELS) as UserRole[]).map((value) => (
                        <option key={value} value={value}>
                          {ROLE_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('fr-FR') : 'jamais'}
                  </td>
                  <td>
                    <div className="row">
                      <button type="button" disabled={busy} onClick={() => resetPassword(user)}>
                        Changer le mot de passe
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy || isSelf}
                        title={isSelf ? 'Vous ne pouvez pas supprimer votre propre compte' : undefined}
                        onClick={() => {
                          if (!confirm(`Supprimer definitivement le compte ${user.email} ?`)) return;
                          void act('Compte supprime.', () => api.deleteUser(user.id));
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Roles</h3>
        <table>
          <tbody>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((value) => (
              <tr key={value}>
                <td style={{ width: 160 }}>
                  <strong>{ROLE_LABELS[value]}</strong>
                </td>
                <td>{ROLE_HELP[value]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
          Le dernier administrateur ne peut etre ni retrograde ni supprime : sans lui, la gestion des comptes
          deviendrait inaccessible.
        </p>
      </div>
    </>
  );
}
