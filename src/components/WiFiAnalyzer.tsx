import { useState } from 'react';
import { Wifi, RefreshCw, Radio } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';

interface WifiNetwork {
  ssid: string;
  bssid: string | null;
  channel: number | null;
  signal: number | null;
  band: string | null;
  auth: string | null;
}

interface WifiChannel {
  channel: number;
  band: string;
  count: number;
  maxSignal: number;
}

interface WifiScanResult {
  supported: boolean;
  networks: WifiNetwork[];
  channels: WifiChannel[];
  recommendation?: string;
  message?: string;
  error?: string;
  scannedAt?: string;
}

export function WiFiAnalyzer() {
  const [data, setData] = useState<WifiScanResult | null>(null);
  const [loading, setLoading] = useState(false);

  const scan = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<WifiScanResult>('/wifi/scan');
      setData(result);
      if (result.error) {
        toast.error(result.message || result.error);
      } else {
        toast.success(`Found ${result.networks.length} WiFi network(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'WiFi scan failed');
    } finally {
      setLoading(false);
    }
  };

  const maxCount = Math.max(1, ...(data?.channels.map((c) => c.count) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">WiFi Channel Analyzer</h2>
              <p className="text-xs text-slate-500">NetCut-style channel scan via netsh (Windows)</p>
            </div>
          </div>
          <button
            onClick={scan}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Scan
          </button>
        </div>

        {data?.recommendation && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-200">
            <Radio className="w-4 h-4 inline mr-1" />
            {data.recommendation}
          </div>
        )}

        {data?.channels && data.channels.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-slate-500 mb-2">Channel congestion</p>
            <div className="flex items-end gap-1 h-24">
              {data.channels.map((ch) => (
                <div key={ch.channel} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-blue-500 dark:bg-blue-600 min-h-[4px]"
                    style={{ height: `${(ch.count / maxCount) * 100}%` }}
                    title={`${ch.count} network(s), max signal ${ch.maxSignal}%`}
                  />
                  <span className="text-[10px] text-slate-500">{ch.channel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!data && (
          <p className="text-sm text-slate-500 text-center py-8">
            Click Scan to analyze nearby WiFi channels and find the least crowded one.
          </p>
        )}

        {data?.networks && data.networks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b dark:border-slate-700">
                  <th className="py-2 pr-2">SSID</th>
                  <th className="py-2 pr-2">Ch</th>
                  <th className="py-2 pr-2">Band</th>
                  <th className="py-2 pr-2">Signal</th>
                  <th className="py-2">Auth</th>
                </tr>
              </thead>
              <tbody>
                {data.networks.map((n, i) => (
                  <tr key={`${n.bssid}-${i}`} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-2 font-medium">{n.ssid}</td>
                    <td className="py-2 pr-2">{n.channel ?? '—'}</td>
                    <td className="py-2 pr-2 text-xs">{n.band ?? '—'}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={
                          (n.signal ?? 0) > 70
                            ? 'text-green-600'
                            : (n.signal ?? 0) > 40
                              ? 'text-amber-600'
                              : 'text-slate-500'
                        }
                      >
                        {n.signal != null ? `${n.signal}%` : '—'}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-slate-500">{n.auth ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.networks.length === 0 && !data.error && (
          <p className="text-sm text-slate-500 text-center py-4">{data.message}</p>
        )}
      </div>
    </div>
  );
}
