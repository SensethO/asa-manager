import type { ProfileRuntime, ServerStatus } from '../../../shared/types.js';
import { traduire, useLang } from '../i18n.js';

const LABELS: Record<ServerStatus, string> = {
  stopped: 'Arrete',
  starting: 'Demarrage',
  running: 'En ligne',
  stopping: 'Arret en cours',
  installing: 'Installation',
  updating: 'Mise a jour',
  error: 'Erreur',
};

/** Libelle traduit dans la langue courante */
export function statusLabel(status: ServerStatus | undefined): string {
  return traduire(status ? LABELS[status] : 'Inconnu');
}

export function statusDot(status: ServerStatus | undefined): string {
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

export function StatusPill({ runtime }: { runtime: ProfileRuntime | undefined }) {
  // L'abonnement sert au re-rendu : sans lui, la pastille garderait la langue
  // affichee au moment du montage.
  useLang();
  const label = statusLabel(runtime?.status);
  const progress = runtime?.progress;

  return (
    <span className="status">
      <span className={`dot ${statusDot(runtime?.status)}`} />
      {progress ? `${label} — ${progress}` : label}
    </span>
  );
}
