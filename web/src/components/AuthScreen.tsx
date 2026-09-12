import { useState } from 'react';

import type { AuthState } from '../../../shared/types.js';
import { api } from '../api.js';

const MIN_PASSWORD_LENGTH = 10;

/**
 * Ecran unique couvrant les deux entrees possibles :
 * premiere configuration tant qu'aucun compte n'existe, connexion ensuite.
 */
export function AuthScreen({ state, onAuthenticated }: { state: AuthState; onAuthenticated: () => void }) {
  const setup = state.needsSetup;

  const [email, setEmail] = useState(setup ? state.suggestedAdminEmail : '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = setup && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = setup && confirmation.length > 0 && password !== confirmation;
  const canSubmit =
    email.trim() !== '' &&
    password !== '' &&
    !busy &&
    (!setup || (password.length >= MIN_PASSWORD_LENGTH && password === confirmation));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    try {
      if (setup) await api.setup(email.trim(), password);
      else await api.login(email.trim(), password);

      onAuthenticated();
    } catch (cause) {
      setError((cause as Error).message);
      setPassword('');
      setConfirmation('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20 }}>
      <form className="panel" style={{ width: 'min(440px, 100%)', margin: 0 }} onSubmit={submit}>
        <h1 style={{ margin: '0 0 4px', fontSize: 18 }}>
          {setup ? 'Premiere configuration' : 'Gestionnaire ASA'}
        </h1>
        <p className="hint">
          {setup
            ? "Aucun compte n'existe encore. Creez le compte administrateur : c'est vous qui choisissez le mot de passe, il n'est stocke que sous forme hachee."
            : 'Connectez-vous pour acceder aux serveurs.'}
        </p>

        {error && <div className="message error">{error}</div>}

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="email">Adresse electronique</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus={!setup}
          />
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            autoComplete={setup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus={setup}
          />
          {setup && (
            <div className="desc" style={tooShort ? { color: 'var(--warn)' } : undefined}>
              {MIN_PASSWORD_LENGTH} caracteres minimum.
            </div>
          )}
        </div>

        {setup && (
          <div className="field" style={{ marginBottom: 18 }}>
            <label htmlFor="confirmation">Confirmation du mot de passe</label>
            <input
              id="confirmation"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              style={mismatch ? { borderColor: 'var(--error)' } : undefined}
            />
            {mismatch && <div className="desc" style={{ color: 'var(--error)' }}>Les deux saisies different.</div>}
          </div>
        )}

        <button type="submit" className="primary" style={{ width: '100%' }} disabled={!canSubmit}>
          {busy ? 'Patientez...' : setup ? 'Creer le compte administrateur' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
