import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, ClipboardCopy, ExternalLink, RefreshCw, ShieldOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch, API_BASE_URL } from '../config/api';
import { ConfirmModal } from './ConfirmModal';

interface DiagnosticsData {
  checks?: {
    cutReady?: boolean;
    isAdmin?: boolean;
    npcap?: boolean;
    nativeMeter?: boolean;
    warnings?: string[];
  };
  hotspot?: {
    isActive?: boolean;
    windowsHotspotActive?: boolean | null;
    isTrafficBlocked?: boolean;
    freezeEngine?: string | null;
    constantLagEngine?: string | null;
    gamingModeActive?: boolean;
    connectedDevices?: number;
    windivert?: { bundled?: boolean; verified?: boolean | null; blockActive?: boolean; lagActive?: boolean };
  };
  activeCuts?: number;
  lagSwitches?: number;
  dnsBlocks?: number;
  portBlocks?: number;
  uptimeSec?: number;
}

const GITHUB_ISSUES = 'https://github.com/joe25dill-a11y/skys-wifi-cutter/issues';

export function DiagnosticsPanel() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [panicLoading, setPanicLoading] = useState(false);
  const [showPanicConfirm, setShowPanicConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<DiagnosticsData>('/diagnostics');
      setData(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Diagnostics failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => {
      if (!document.hidden) load();
    }, 20_000);
    return () => clearInterval(interval);
  }, [load]);

  const panic = async () => {
    setPanicLoading(true);
    try {
      const result = await apiFetch<{ message?: string }>('/diagnostics/panic', { method: 'POST' });
      toast.success(result.message || 'Everything stopped');
      setShowPanicConfirm(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Panic stop failed');
    } finally {
      setPanicLoading(false);
    }
  };

  const panicItems = [
    data?.activeCuts ? `${data.activeCuts} ARP cut(s)` : null,
    data?.lagSwitches ? `${data.lagSwitches} lag switch(es)` : null,
    data?.dnsBlocks ? `${data.dnsBlocks} DNS block(s)` : null,
    data?.portBlocks ? `${data.portBlocks} port block(s)` : null,
    data?.hotspot?.isTrafficBlocked ? 'Hotspot traffic freeze' : null,
    data?.hotspot?.windivert?.blockActive ? 'WinDivert block' : null,
    data?.hotspot?.windivert?.lagActive ? 'WinDivert lag' : null,
    data?.hotspot?.constantLagEngine ? 'Hotspot constant lag' : null,
    data?.hotspot?.gamingModeActive ? 'Hotspot gaming mode' : null
  ].filter(Boolean) as string[];

  const copyReport = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/diagnostics/report`);
      if (!response.ok) throw new Error('Could not build report');
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      toast.success('Feedback report copied — paste it into a GitHub issue');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Copy failed');
    }
  };

  const checks = data?.checks;
  const hs = data?.hotspot;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Diagnostics</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 inline ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={copyReport}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <ClipboardCopy className="w-3.5 h-3.5" />
            Copy feedback report
          </button>
          <a
            href={GITHUB_ISSUES}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Report bug on GitHub
          </a>
          <button
            onClick={() => setShowPanicConfirm(true)}
            disabled={panicLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500 disabled:opacity-50"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            Panic stop all
          </button>
        </div>
      </div>

      {!data ? (
        <p className="text-sm text-slate-500">Loading diagnostics…</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-slate-500">System</h4>
            <DiagRow ok={checks?.isAdmin} label="Administrator" />
            <DiagRow ok={checks?.npcap} label="Npcap" />
            <DiagRow ok={checks?.nativeMeter} label="Native engine" />
            <DiagRow ok={checks?.cutReady} label="Cut/lag ready" />
            <p className="text-xs text-slate-500">Uptime: {data.uptimeSec ?? 0}s</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-slate-500">Hotspot</h4>
            <DiagRow ok={hs?.windowsHotspotActive} label="Windows hotspot" />
            <DiagRow ok={hs?.isActive} label="App linked" />
            <p className="text-slate-600 dark:text-slate-300">
              Clients: {hs?.connectedDevices ?? 0} · Engine: {hs?.freezeEngine || hs?.constantLagEngine || 'idle'}
              {hs?.gamingModeActive ? ' · gaming mode' : ''}
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              WinDivert: {hs?.windivert?.bundled ? 'bundled' : 'missing'}
              {hs?.windivert?.blockActive ? ' · blocking' : ''}
              {hs?.windivert?.lagActive ? ' · lagging' : ''}
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <h4 className="text-xs font-bold uppercase text-slate-500">Active controls</h4>
            <p className="text-slate-600 dark:text-slate-300">
              Cuts: {data.activeCuts ?? 0} · Lag: {data.lagSwitches ?? 0} · DNS: {data.dnsBlocks ?? 0} · Ports:{' '}
              {data.portBlocks ?? 0}
            </p>
            {(checks?.warnings?.length ?? 0) > 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-100 space-y-1">
                {checks!.warnings!.map((w) => (
                  <p key={w} className="flex items-start gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <ConfirmModal
        open={showPanicConfirm}
        title="Panic stop — stop everything?"
        danger
        confirmLabel="Stop all"
        message={
          <>
            <p>This will immediately stop all active network controls:</p>
            {panicItems.length > 0 ? (
              <ul className="list-disc pl-5 mt-2 space-y-0.5 text-slate-600 dark:text-slate-300">
                {panicItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 mt-2">No active cuts or blocks detected — safe to run anyway.</p>
            )}
          </>
        }
        onConfirm={panic}
        onCancel={() => setShowPanicConfirm(false)}
      />
    </div>
  );
}

function DiagRow({ ok, label }: { ok?: boolean | null; label: string }) {
  const state = ok === true ? 'ok' : ok === false ? 'bad' : 'unknown';
  return (
    <p className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
      <span
        className={`w-2 h-2 rounded-full ${
          state === 'ok' ? 'bg-emerald-500' : state === 'bad' ? 'bg-red-500' : 'bg-slate-400'
        }`}
      />
      {label}
    </p>
  );
}
