import { useCallback, useState } from 'react';
import { ClipboardList, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';
import { useVisibilityPoll } from '../hooks/useVisibilityPoll';
import { ConfirmModal } from './ConfirmModal';

interface AuditEntry {
  id: number;
  action: string;
  mac?: string;
  ip?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    const data = await apiFetch<{ entries: AuditEntry[] }>('/audit?limit=50');
    setEntries(data.entries);
  }, []);

  useVisibilityPoll(() => load().catch(() => null), {
    enabled: true,
    visibleMs: 60_000,
    hiddenMs: null,
    runOnMount: true
  });

  const clear = async () => {
    setLoading(true);
    try {
      await apiFetch('/audit', { method: 'DELETE' });
      setEntries([]);
      toast.success('Audit log cleared');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setLoading(false);
      setConfirmClear(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-slate-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Connection Audit Log</h3>
        </div>
        <button
          onClick={() => setConfirmClear(true)}
          disabled={loading || entries.length === 0}
          className="text-xs flex items-center gap-1 text-slate-500 hover:text-red-500"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto text-xs space-y-1">
        {entries.length === 0 ? (
          <p className="text-slate-500 py-4 text-center">No audit events yet</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-700"
            >
              <span className="font-mono text-indigo-600 dark:text-indigo-400">{entry.action}</span>
              <span className="text-slate-500 truncate">{entry.mac || entry.ip || ''}</span>
              <span className="text-slate-400 whitespace-nowrap">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>

      <ConfirmModal
        open={confirmClear}
        title="Clear audit log?"
        danger
        confirmLabel="Clear"
        message={<p>Permanently clear all audit log entries?</p>}
        onConfirm={clear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
