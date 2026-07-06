import { useEffect, useState } from 'react';
import { Wrench, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';

interface CutTroubleshootResult {
  admin: boolean;
  npcapReady: boolean;
  cutReady: boolean;
  gatewayReachable: boolean;
  sameSubnet: boolean;
  gatewayIp: string | null;
  localIp: string | null;
  suggestions: string[];
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
  ) : (
    <XCircle className="w-4 h-4 text-red-500 shrink-0" />
  );
}

export function CutTroubleshootingPanel() {
  const [result, setResult] = useState<CutTroubleshootResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<CutTroubleshootResult>('/diagnostics/cut-troubleshoot');
      setResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Self-test failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runTest().catch(() => null);
  }, []);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Cut troubleshooting</h3>
        </div>
        <button
          onClick={runTest}
          disabled={loading}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Re-run
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Self-test for beta testers — checks gateway, subnet, admin, and common AP isolation causes.
      </p>

      {!result ? (
        <p className="text-sm text-slate-500">Running checks…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid sm:grid-cols-2 gap-2">
            <p className="flex items-center gap-2">
              <StatusIcon ok={result.admin} /> Administrator
            </p>
            <p className="flex items-center gap-2">
              <StatusIcon ok={result.npcapReady} /> Npcap installed
            </p>
            <p className="flex items-center gap-2">
              <StatusIcon ok={result.cutReady} /> Cut engine ready
            </p>
            <p className="flex items-center gap-2">
              <StatusIcon ok={result.gatewayReachable} /> Gateway reachable
            </p>
            <p className="flex items-center gap-2">
              <StatusIcon ok={result.sameSubnet} /> Same subnet as gateway
            </p>
          </div>
          {(result.localIp || result.gatewayIp) && (
            <p className="text-xs text-slate-500 font-mono">
              PC {result.localIp || '?'} · Gateway {result.gatewayIp || '?'}
            </p>
          )}
          {result.suggestions.length > 0 && (
            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc pl-4">
              {result.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
