import { useEffect, useState } from 'react';
import { BarChart3, Clock, TrendingUp } from 'lucide-react';
import { apiFetch } from '../config/api';

interface TopDevice {
  mac: string;
  name: string;
  ip: string;
  peak_upload: number;
  peak_download: number;
  avg_total: number;
  estimated_mb?: number;
}

interface HistoryPoint {
  timestamp: string;
  upload: number;
  download: number;
}

export function UsageHistory() {
  const [hours, setHours] = useState(24);
  const [topDevices, setTopDevices] = useState<TopDevice[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [top, hist] = await Promise.all([
        apiFetch<{ devices: TopDevice[] }>(`/bandwidth/top?hours=${hours}&limit=8`),
        apiFetch<{ history: HistoryPoint[] }>(`/bandwidth/history?hours=${hours}`)
      ]);
      setTopDevices(top.devices ?? []);
      setHistory(hist.history ?? []);
    } catch {
      setTopDevices([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [hours]);

  const maxTotal = Math.max(...history.map((h) => h.upload + h.download), 0.1);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Usage history</h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          {[6, 24, 72, 168].map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`px-2.5 py-1 rounded-lg border ${
                hours === h
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'
              }`}
            >
              {h === 168 ? '7d' : `${h}h`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="p-6 text-sm text-slate-500">Loading usage data…</p>
      ) : (
        <div className="p-6 space-y-6">
          <div>
            <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Network total (this PC)
            </p>
            <div className="h-20 flex items-end gap-0.5">
              {history.length < 2 ? (
                <p className="text-xs text-slate-400">Collecting samples every 5 min…</p>
              ) : (
                history.slice(-48).map((point) => {
                  const total = point.upload + point.download;
                  return (
                    <div
                      key={point.timestamp}
                      className="flex-1 bg-gradient-to-t from-indigo-600 to-sky-400 rounded-t opacity-80 min-w-[2px]"
                      style={{ height: `${Math.max(6, (total / maxTotal) * 100)}%` }}
                      title={`${new Date(point.timestamp).toLocaleString()} — ${total.toFixed(2)} Mbps`}
                    />
                  );
                })
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-3">Top devices by average Mbps (metered traffic)</p>
            {topDevices.length === 0 ? (
              <p className="text-sm text-slate-500">
                No per-device samples yet — use ReTest or Meter on devices while they browse.
              </p>
            ) : (
              <div className="space-y-2">
                {topDevices.map((device, index) => (
                  <div
                    key={device.mac}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        #{index + 1} {device.name || device.mac}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">{device.ip}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-blue-600">↑ {Number(device.peak_upload || 0).toFixed(2)} peak</p>
                      <p className="text-green-600">↓ {Number(device.peak_download || 0).toFixed(2)} peak</p>
                      {device.estimated_mb != null && device.estimated_mb > 0 && (
                        <p className="text-slate-500">~{device.estimated_mb} MB est.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
