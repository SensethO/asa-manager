import { useEffect, useState } from 'react';

import type { ServerProfile } from '../../../shared/types.js';
import { api } from '../api.js';

export function SchedulePanel({
  profile,
  onSaved,
}: {
  profile: ServerProfile;
  onSaved: (profile: ServerProfile) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDraft(profile);
    setMessage(null);
  }, [profile]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.updateProfile(profile.id, {
        restart: draft.restart,
        update: draft.update,
        backup: draft.backup,
      });
      onSaved(saved);
      setMessage({ kind: 'ok', text: 'Planification enregistree.' });
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const lead = Math.max(0, ...draft.restart.warningMinutes.filter((m) => m > 0));

  return (
    <>
      {message && <div className={`message ${message.kind}`}>{message.text}</div>}

      <div className="panel">
        <div className="field inline">
          <input
            id="restartEnabled"
            type="checkbox"
            checked={draft.restart.enabled}
            onChange={(e) =>
              setDraft((c) => ({ ...c, restart: { ...c.restart, enabled: e.target.checked } }))
            }
          />
          <label htmlFor="restartEnabled">
            <strong>Redemarrages quotidiens</strong>
          </label>
        </div>

        <p className="hint" style={{ marginTop: 10 }}>
          Les heures indiquees sont celles du redemarrage effectif. Les preavis commencent avant, de sorte que le
          dernier avertissement tombe juste avant la coupure.
        </p>

        <div className="grid">
          <div className="field">
            <label htmlFor="times">Heures (une par ligne, format HH:MM)</label>
            <textarea
              id="times"
              rows={4}
              value={draft.restart.dailyTimes.join('\n')}
              onChange={(e) =>
                setDraft((c) => ({
                  ...c,
                  restart: { ...c.restart, dailyTimes: e.target.value.split('\n').map((t) => t.trim()) },
                }))
              }
              style={{ fontFamily: 'var(--mono)' }}
            />
          </div>

          <div className="field">
            <label htmlFor="warnings">Preavis en minutes (separes par des virgules)</label>
            <input
              id="warnings"
              value={draft.restart.warningMinutes.join(', ')}
              onChange={(e) =>
                setDraft((c) => ({
                  ...c,
                  restart: {
                    ...c.restart,
                    warningMinutes: e.target.value
                      .split(',')
                      .map((value) => Number(value.trim()))
                      .filter((value) => Number.isFinite(value) && value > 0),
                  },
                }))
              }
            />
            <div className="desc">
              {lead > 0
                ? `La sequence demarre ${lead} minute(s) avant l'heure indiquee.`
                : 'Sans preavis, la coupure est immediate a l heure indiquee.'}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="field inline">
          <input
            id="updateEnabled"
            type="checkbox"
            checked={draft.update.enabled}
            onChange={(e) => setDraft((c) => ({ ...c, update: { ...c.update, enabled: e.target.checked } }))}
          />
          <label htmlFor="updateEnabled">
            <strong>Mises a jour automatiques</strong>
          </label>
        </div>

        <p className="hint" style={{ marginTop: 10 }}>
          Le gestionnaire compare le build installe a celui publie sur Steam. Un build indetermine n'entraine
          jamais de mise a jour.
        </p>

        <div className="grid">
          <div className="field">
            <label htmlFor="checkInterval">Intervalle de verification (minutes)</label>
            <input
              id="checkInterval"
              type="number"
              min={5}
              value={draft.update.checkIntervalMinutes}
              onChange={(e) =>
                setDraft((c) => ({
                  ...c,
                  update: { ...c.update, checkIntervalMinutes: Number(e.target.value) || 60 },
                }))
              }
            />
          </div>

          <div className="field inline" style={{ alignItems: 'flex-start', paddingTop: 22 }}>
            <input
              id="onlyScheduled"
              type="checkbox"
              checked={draft.update.onlyOnScheduledRestart}
              onChange={(e) =>
                setDraft((c) => ({
                  ...c,
                  update: { ...c.update, onlyOnScheduledRestart: e.target.checked },
                }))
              }
            />
            <label htmlFor="onlyScheduled">
              Attendre le prochain redemarrage planifie
              <div className="desc">
                Decoche : le serveur est arrete des qu'une mise a jour est detectee, preavis compris.
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="field inline">
          <input
            id="backupEnabled"
            type="checkbox"
            checked={draft.backup.enabled}
            onChange={(e) => setDraft((c) => ({ ...c, backup: { ...c.backup, enabled: e.target.checked } }))}
          />
          <label htmlFor="backupEnabled">
            <strong>Sauvegardes automatiques</strong>
          </label>
        </div>

        <div className="grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="backupInterval">Intervalle (minutes)</label>
            <input
              id="backupInterval"
              type="number"
              min={5}
              value={draft.backup.intervalMinutes}
              onChange={(e) =>
                setDraft((c) => ({
                  ...c,
                  backup: { ...c.backup, intervalMinutes: Number(e.target.value) || 60 },
                }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor="retain">Archives conservees</label>
            <input
              id="retain"
              type="number"
              min={0}
              value={draft.backup.retain}
              onChange={(e) =>
                setDraft((c) => ({ ...c, backup: { ...c.backup, retain: Number(e.target.value) || 0 } }))
              }
            />
            <div className="desc">0 desactive la purge automatique.</div>
          </div>

          <div className="field">
            <label htmlFor="targetDir">Dossier de destination</label>
            <input
              id="targetDir"
              placeholder="(par defaut : <installation>/Backups)"
              value={draft.backup.targetDir}
              onChange={(e) => setDraft((c) => ({ ...c, backup: { ...c.backup, targetDir: e.target.value } }))}
            />
          </div>
        </div>
      </div>

      <div className="row">
        <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button type="button" onClick={() => setDraft(profile)} disabled={saving}>
          Annuler les modifications
        </button>
      </div>
    </>
  );
}
