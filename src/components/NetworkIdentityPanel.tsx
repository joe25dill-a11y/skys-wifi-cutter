import { useEffect, useState } from 'react';
import { Fingerprint, Shuffle, Globe, Plug, Unplug, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';

interface Adapter {
  name: string;
  description: string;
  mac: string;
  status: string;
}

interface VpnConnection {
  name: string;
  server?: string;
  status: string;
  tunnelType?: string;
}

export function NetworkIdentityPanel() {
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [vpnConnections, setVpnConnections] = useState<VpnConnection[]>([]);
  const [tunAdapters, setTunAdapters] = useState<Adapter[]>([]);
  const [selectedAdapter, setSelectedAdapter] = useState('');
  const [customMac, setCustomMac] = useState('');
  const [loading, setLoading] = useState(false);
  const [vpnActive, setVpnActive] = useState(false);
  const [note, setNote] = useState('');

  const load = async () => {
    const summary = await apiFetch<{
      adapters: Adapter[];
      vpn: { connections: VpnConnection[]; tunAdapters: Adapter[] };
      vpnActive: boolean;
      note?: string;
    }>('/identity/summary');
    setAdapters(summary.adapters || []);
    setVpnConnections(summary.vpn?.connections || []);
    setTunAdapters(summary.vpn?.tunAdapters || []);
    setVpnActive(Boolean(summary.vpnActive));
    setNote(summary.note || '');
    if (!selectedAdapter && summary.adapters?.[0]) {
      setSelectedAdapter(summary.adapters[0].name);
    }
  };

  useEffect(() => {
    load().catch(() => null);
  }, []);

  const randomizeMac = async () => {
    if (!selectedAdapter) {
      toast.error('Select a network adapter');
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<{ message: string; mac: string }>('/identity/mac/randomize', {
        method: 'POST',
        body: JSON.stringify({ adapterName: selectedAdapter })
      });
      toast.success(result.message || `New MAC: ${result.mac}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'MAC change failed — Admin required');
    } finally {
      setLoading(false);
    }
  };

  const setMac = async () => {
    if (!selectedAdapter || !customMac.trim()) return;
    setLoading(true);
    try {
      const result = await apiFetch<{ message: string }>('/identity/mac/set', {
        method: 'POST',
        body: JSON.stringify({ adapterName: selectedAdapter, mac: customMac.trim() })
      });
      toast.success(result.message || 'MAC updated');
      setCustomMac('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Set MAC failed');
    } finally {
      setLoading(false);
    }
  };

  const vpnAction = async (name: string, action: 'connect' | 'disconnect') => {
    setLoading(true);
    try {
      const result = await apiFetch<{ message: string }>(`/identity/vpn/${encodeURIComponent(name)}/${action}`, {
        method: 'POST'
      });
      toast.success(result.message || 'Done');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'VPN action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Fingerprint className="w-5 h-5 text-cyan-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">MAC spoofer &amp; VPN</h3>
        {vpnActive && (
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600">
            VPN active
          </span>
        )}
      </div>

      <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-100 flex gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <p>
          <strong>MAC spoofer</strong> changes this PC&apos;s adapter address (WiFi/Ethernet restart).{' '}
          <strong>VPN</strong> controls Windows built-in VPN profiles — WireGuard/Nord/etc. use their own apps.
          We do not bundle a VPN server; use your existing VPN app alongside this tool.
        </p>
      </div>

      <section className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">MAC address (this PC)</h4>
        {note && <p className="text-xs text-slate-500">{note}</p>}
        <select
          value={selectedAdapter}
          onChange={(e) => setSelectedAdapter(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border dark:bg-slate-700"
        >
          {adapters.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name} — {a.mac} ({a.status})
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={randomizeMac}
            disabled={loading || !selectedAdapter}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium disabled:opacity-50"
          >
            <Shuffle className="w-4 h-4" />
            Random MAC
          </button>
          <input
            value={customMac}
            onChange={(e) => setCustomMac(e.target.value)}
            placeholder="AA:BB:CC:DD:EE:FF"
            className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border dark:bg-slate-700 font-mono text-sm"
          />
          <button
            onClick={setMac}
            disabled={loading || !customMac.trim()}
            className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
          >
            Set MAC
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1">
          <Globe className="w-4 h-4" />
          Windows VPN profiles
        </h4>
        {vpnConnections.length === 0 && tunAdapters.length === 0 ? (
          <p className="text-xs text-slate-500">
            No Windows VPN profiles found. Install Nord/Proton/WireGuard and add a Windows VPN, or use their app
            directly.
          </p>
        ) : (
          <div className="space-y-2">
            {vpnConnections.map((v) => (
              <div
                key={v.name}
                className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-700 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{v.name}</p>
                  <p className="text-xs text-slate-500">{v.server || v.tunnelType} · {v.status}</p>
                </div>
                <div className="flex gap-1">
                  {String(v.status).toLowerCase() !== 'connected' ? (
                    <button
                      onClick={() => vpnAction(v.name, 'connect')}
                      disabled={loading}
                      className="p-2 rounded-lg bg-emerald-100 text-emerald-700"
                      title="Connect"
                    >
                      <Plug className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => vpnAction(v.name, 'disconnect')}
                      disabled={loading}
                      className="p-2 rounded-lg bg-red-100 text-red-700"
                      title="Disconnect"
                    >
                      <Unplug className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {tunAdapters.map((a) => (
              <div key={a.name} className="text-xs text-slate-500 flex justify-between">
                <span>{a.description || a.name}</span>
                <span className={a.status === 'Up' ? 'text-emerald-500' : ''}>{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
