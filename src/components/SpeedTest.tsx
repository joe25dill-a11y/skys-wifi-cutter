import { useState } from 'react';
import { Gauge, Play, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';

interface SpeedTestResult {
  provider: string;
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number | null;
  success: boolean;
  error?: string | null;
  note?: string;
}

export function SpeedTest() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SpeedTestResult | null>(null);

  const runTest = async () => {
    setRunning(true);
    setResult(null);
    try {
      const data = await apiFetch<SpeedTestResult>('/speedtest/run', { method: 'POST' });
      setResult(data);
      if (data.success) {
        toast.success('Speed test complete');
      } else {
        toast.error(data.error || 'Speed test failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Speed test failed');
    } finally {
      setRunning(false);
    }
  };

  const max = Math.max(result?.downloadMbps ?? 0, result?.uploadMbps ?? 0, 1);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
            <Gauge className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Internet Speed Test</h2>
            <p className="text-xs text-slate-500">Speedtest.net style — tests this PC&apos;s WiFi / internet</p>
          </div>
        </div>
        <button
          onClick={runTest}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? 'Testing…' : 'GO'}
        </button>
      </div>

      {running && (
        <div className="text-center py-10">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Downloading & uploading test data… ~15–30 seconds</p>
        </div>
      )}

      {result && !running && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-4 border">
              <p className="text-xs text-slate-500 uppercase">Ping</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-white">
                {result.pingMs != null ? `${result.pingMs}` : '—'}
              </p>
              <p className="text-xs text-slate-400">ms</p>
            </div>
            <div className="rounded-xl bg-green-50 dark:bg-green-950/30 p-4 border border-green-200 dark:border-green-800">
              <p className="text-xs text-green-600 uppercase">Download</p>
              <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                {result.downloadMbps.toFixed(1)}
              </p>
              <p className="text-xs text-slate-400">Mbps</p>
            </div>
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-600 uppercase">Upload</p>
              <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                {result.uploadMbps.toFixed(1)}
              </p>
              <p className="text-xs text-slate-400">Mbps</p>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Download</span>
                <span>{result.downloadMbps.toFixed(1)} Mbps</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${(result.downloadMbps / max) * 100}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Upload</span>
                <span>{result.uploadMbps.toFixed(1)} Mbps</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(result.uploadMbps / max) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {result.note && <p className="text-xs text-slate-500">{result.note}</p>}
        </div>
      )}

      {!result && !running && (
        <p className="text-sm text-slate-500 text-center py-8">
          Press GO to test your connection speed. For per-device LAN Mbps, click a device and hit ReTest.
        </p>
      )}
    </div>
  );
}
