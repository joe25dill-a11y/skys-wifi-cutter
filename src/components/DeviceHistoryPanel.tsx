import { useCallback, useEffect, useState } from 'react';
import { Clock, Download, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch, API_BASE_URL, encodeMac } from '../config/api';
import { actionLabel } from '../utils/auditLabels';

interface HistoryEntry {
  id: number;
  action: string;
  mac?: string;
  ip?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

interface DeviceHistoryPanelProps {
  mac: string;
}

export function DeviceHistoryPanel({ mac }: DeviceHistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ entries: HistoryEntry[] }>(
        `/devices/${encodeMac(mac)}/history?limit=80`
      );
      setEntries(data.entries);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [mac]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = () => {
    window.open(
      `${API_BASE_URL}/devices/${encodeMac(mac)}/history/export?limit=500`,
      '_blank'
    );
    toast.success('Downloading history CSV…');
  };

  return (
    <div className="border-t border-slate-800 pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Clock className="w-4 h-4 text-slate-400" />
          History
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            title="Refresh history"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            title="Export CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">No history for this device yet.</p>
      ) : (
        <ul className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="text-xs flex items-start justify-between gap-2 py-1 border-b border-slate-800/60 last:border-0"
            >
              <span className="text-slate-300">{actionLabel(entry.action)}</span>
              <time className="text-slate-500 shrink-0">
                {new Date(entry.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
