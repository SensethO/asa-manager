import { useState } from 'react';

import type { User, UserRole } from '../../../shared/types.js';
import { api } from '../api.js';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  operator: 'Operateur',
  viewer: 'Lecteur',
};

export function AccountMenu({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [changing, setChanging] = useState(false);

  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user.email}>
          {user.email}
        </div>
        <div style={{ color: 'var(--text-faint)' }}>{ROLE_LABELS[user.role]}</div>
      </div>

      <div className="row">
        <button type="button" style={{ flex: 1 }} onClick={() => setChanging(true)}>
          Mot de passe
        </button>
        <button
          type="button"
          style={{ flex: 1 }}
          onClick={() => void api.logout().finally(onSignedOut)}
        >
          Deconnexion
        </button>
      </div>

      {changing && <ChangePasswordDialog onClose={() => setChanging(false)} onChanged={onSignedOut} />}
    </>
  );
}

function ChangePasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirmation.length > 0 && next !== confirmation;
  const canSubmit = current !== '' && next.length >= 10 && next === confirmation && !busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    try {
      await api.changeOwnPassword(current, next);
      // Le serveur ferme toutes les sessions du compte : il faut se reconnecter
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 8, 12, 0.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        zIndex: 10,
      }}
      onClick={onClose}
    >
      <form
        className="panel"
        style={{ width: 'min(420px, 100%)', margin: 0 }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h3>Changer mon mot de passe</h3>
        <p className="hint">
          Toutes vos sessions seront fermees : vous devrez vous reconnecter avec le nouveau mot de passe.
        </p>

        {error && <div className="message error">{error}</div>}

        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="currentPassword">Mot de passe actuel</label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="nextPassword">Nouveau mot de passe</label>
          <input
            id="nextPassword"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <div className="desc">10 caracteres minimum.</div>
        </div>

        <div className="field" style={{ marginBottom: 18 }}>
          <label htmlFor="confirmPassword">Confirmation</label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            style={mismatch ? { borderColor: 'var(--error)' } : undefined}
          />
          {mismatch && <div className="desc" style={{ color: 'var(--error)' }}>Les deux saisies different.</div>}
        </div>

        <div className="row">
          <button type="submit" className="primary" disabled={!canSubmit}>
            {busy ? 'Patientez...' : 'Changer'}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
