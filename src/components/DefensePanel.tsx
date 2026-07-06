import { useEffect, useState } from 'react';
import { Shield, ShieldOff, RefreshCw, AlertTriangle, Radio } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';
import { HealthResponse } from '../types/device';

interface DefenseStatus {
  isActive: boolean;
  gatewayIp: string | null;
  gatewayMac: string | null;
  lastPinAt: string | null;
  lastPinError: string | null;
  pinCount: number;
}

interface ArpAlert {
  type: string;
  message: string;
  senderMac?: string;
  at?: string;
}

interface DefensePanelProps {
  health: HealthResponse | null;
  onHealthRefresh?: () => void;
}

export function DefensePanel({ health, onHealthRefresh }: DefensePanelProps) {
  const [status, setStatus] = useState<DefenseStatus | null>(null);
  const [alerts, setAlerts] = useState<ArpAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const [def, arp] = await Promise.all([
      apiFetch<DefenseStatus>('/defense/status'),
      apiFetch<{ alerts: ArpAlert[] }>('/defense/arp-alerts')
    ]);
    setStatus(def);
    setAlerts(arp.alerts || []);
  };

  useEffect(() => {
    load().catch(() => null);
  }, [health?.defense?.isActive, health?.arpMonitor?.active]);

  const toggle = async () => {
    setLoading(true);
    try {
      if (status?.isActive) {
        await apiFetch('/defense/disable', { method: 'POST' });
        toast.success('Defense disabled');
      } else {
        await apiFetch('/defense/enable', { method: 'POST' });
        toast.success('Defense enabled — gateway ARP pinned every 30s');
      }
      await load();
      onHealthRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Defense toggle failed');
    } finally {
      setLoading(false);
    }
  };

  const repin = async () => {
    setLoading(true);
    try {
      await apiFetch('/defense/repin', { method: 'POST' });
      toast.success('Gateway re-pinned');
      await load();
      onHealthRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Re-pin failed — run as Admin');
    } finally {
      setLoading(false);
    }
  };

  const clearAlerts = async () => {
    await apiFetch('/defense/arp-alerts/clear', { method: 'POST' });
    setAlerts([]);
  };

  const monitor = health?.arpMonitor;
  const def = status || health?.defense;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Cut Defender</h3>
        </div>
        <span
          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
            def?.isActive
              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-slate-500/20 text-slate-500'
          }`}
        >
          {def?.isActive ? 'Protecting you' : 'Off'}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        Pins your router&apos;s MAC on this PC so simple NetCut-style attacks can&apos;t trick you.{' '}
        <strong>Protects you</strong> — it does not stop you from cutting others.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-700">
          <p className="text-slate-500 mb-1">Router</p>
          <p className="font-mono text-slate-800 dark:text-slate-200">{def?.gatewayIp || '—'}</p>
          <p className="font-mono text-slate-500 mt-0.5">{def?.gatewayMac || '—'}</p>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-700">
          <p className="text-slate-500 mb-1">Last pin</p>
          <p className="text-slate-800 dark:text-slate-200">
            {def?.lastPinAt ? new Date(def.lastPinAt).toLocaleString() : 'Never'}
          </p>
          <p className="text-slate-500 mt-0.5">{def?.pinCount ?? 0} successful pin(s)</p>
          {def?.lastPinError && (
            <p className="text-amber-600 dark:text-amber-400 mt-1">{def.lastPinError}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={toggle}
          disabled={loading}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 ${
            def?.isActive
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
              : 'bg-blue-600 text-white hover:bg-blue-500'
          }`}
        >
          {def?.isActive ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
          {def?.isActive ? 'Turn off defense' : 'Enable defense'}
        </button>
        <button
          onClick={repin}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Re-pin now
        </button>
      </div>

      <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-indigo-800 dark:text-indigo-200">
          <Radio className="w-4 h-4" />
          ARP attack listener
          <span
            className={`ml-auto px-2 py-0.5 rounded-full text-[10px] ${
              monitor?.active ? 'bg-emerald-500/20 text-emerald-600' : 'bg-slate-500/20'
            }`}
          >
            {monitor?.active ? (monitor.ready ? 'Listening' : 'Starting…') : 'Off'}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Watches the LAN for someone impersonating your router (Npcap/Scapy). Toggle in Settings.
        </p>
        {monitor?.lastError && (
          <p className="text-[11px] text-amber-600 mt-1">{monitor.lastError}</p>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Possible attack detected
            </p>
            <button onClick={clearAlerts} className="text-[10px] text-rose-600 underline">
              Clear
            </button>
          </div>
          <ul className="text-xs text-rose-900 dark:text-rose-100 space-y-1">
            {alerts.slice(0, 5).map((a, i) => (
              <li key={`${a.at}-${i}`}>{a.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
