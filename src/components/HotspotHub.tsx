import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bookmark,
  Gamepad2,
  Gauge,
  Keyboard,
  Power,
  Users,
  Wifi,
  WifiOff,
  Copy,
  AlertTriangle,
  Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';

interface HotspotClient {
  ip: string;
  mac: string;
  state?: string;
}

interface SsidPreset {
  id: string;
  label: string;
  ssid: string;
  password?: string;
}

interface HotspotCapability {
  isAdmin?: boolean;
  hasWifi?: boolean;
  internetConnected?: boolean;
  mobileHotspotAvailable?: boolean;
  hostedNetworkSupported?: boolean;
  errors?: string[];
}

interface HotspotStatus {
  isActive: boolean;
  isTrafficBlocked: boolean;
  ssid: string;
  password?: string;
  connectedDevices: number;
  clients?: HotspotClient[];
  constantLagActive?: boolean;
  constantLagMs?: number;
  constantLagDropPercent?: number;
  bandwidthCap?: { uploadKbps: number; downloadKbps: number } | null;
  ssidPresets?: SsidPreset[];
  hostIp?: string;
  selectedTargetMacs?: string[];
  frozenTargetIps?: string[];
  freezeEngine?: 'windivert' | 'firewall' | null;
  constantLagEngine?: 'windivert' | 'arp' | null;
  windivertAvailable?: boolean;
  windowsHotspotActive?: boolean | null;
  gamingModeActive?: boolean;
}

function targetBody(targetMacs: string[]) {
  return targetMacs.length > 0 ? { targetMacs } : {};
}

export function HotspotHub() {
  const [status, setStatus] = useState<HotspotStatus>({
    isActive: false,
    isTrafficBlocked: false,
    ssid: 'Xbox-LagControl',
    connectedDevices: 0
  });
  const [capability, setCapability] = useState<HotspotCapability | null>(null);
  const [ssid, setSsid] = useState('Xbox-LagControl');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedMacs, setSelectedMacs] = useState<Set<string>>(new Set());
  const [lagMs, setLagMs] = useState(150);
  const [dropPercent, setDropPercent] = useState(0);
  const [capUpload, setCapUpload] = useState(512);
  const [capDownload, setCapDownload] = useState(2048);
  const [pulseCount, setPulseCount] = useState(8);
  const [freezeDuration, setFreezeDuration] = useState(120);
  const [gamingLoading, setGamingLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<HotspotStatus>('/hotspot/status');
      setStatus(data);
      if (data.ssid) setSsid(data.ssid);
      if (data.password) setPassword(data.password);
      if (data.selectedTargetMacs?.length) {
        setSelectedMacs(new Set(data.selectedTargetMacs));
      }
      if (data.constantLagMs) setLagMs(data.constantLagMs);
      if (data.constantLagDropPercent != null) setDropPercent(data.constantLagDropPercent);
    } catch {
      // server not running
    }
  }, []);

  useEffect(() => {
    refresh();
    apiFetch<HotspotCapability>('/hotspot/capability').then(setCapability).catch(() => null);
    apiFetch<{ defaultHotspotSsid?: string; defaultHotspotPassword?: string }>('/settings')
      .then((s) => {
        if (s.defaultHotspotSsid) setSsid(s.defaultHotspotSsid);
        if (s.defaultHotspotPassword) setPassword(s.defaultHotspotPassword);
      })
      .catch(() => null);

    let interval = window.setInterval(refresh, 15_000);

    const onVisibility = () => {
      clearInterval(interval);
      const ms = document.hidden ? 60_000 : 15_000;
      if (!document.hidden) {
        refresh();
      }
      interval = window.setInterval(refresh, ms);
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const targets = useMemo(() => [...selectedMacs], [selectedMacs]);

  const copyCredentials = async () => {
    const text = `WiFi: ${status.ssid || ssid}\nPassword: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('WiFi name and password copied');
    } catch {
      toast.error('Could not copy — select and copy manually');
    }
  };

  const hotspotBlockReason = useMemo(() => {
    if (!capability) return null;
    if (!capability.isAdmin) return 'Run as Administrator to start hotspot';
    if (!capability.hasWifi) return 'No Wi‑Fi adapter detected';
    if (!capability.internetConnected) return 'Connect this PC to the internet first (Ethernet or Wi‑Fi)';
    if (capability.mobileHotspotAvailable === false && capability.hostedNetworkSupported === false) {
      return 'This PC may not support Windows Mobile Hotspot — try Settings → Network → Mobile hotspot manually';
    }
    if (capability.errors?.length) return capability.errors[0];
    return null;
  }, [capability]);

  const syncTargets = async (next: Set<string>) => {
    setSelectedMacs(next);
    try {
      await apiFetch('/hotspot/targets', {
        method: 'POST',
        body: JSON.stringify({ targetMacs: [...next] })
      });
    } catch {
      // non-fatal
    }
  };

  const toggleClient = (mac: string) => {
    const next = new Set(selectedMacs);
    if (next.has(mac)) next.delete(mac);
    else next.add(mac);
    void syncTargets(next);
  };

  const selectAllClients = () => {
    const macs = status.clients?.map((c) => c.mac) ?? [];
    void syncTargets(new Set(macs));
  };

  const clearSelection = () => {
    void syncTargets(new Set());
  };

  const generatePassword = async () => {
    try {
      const result = await apiFetch<{ password: string }>('/settings/generate-hotspot-password', {
        method: 'POST'
      });
      setPassword(result.password);
      toast.success('Random password ready — copy it before sharing with friends');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generate failed');
    }
  };

  const startHotspot = async () => {
    if (!password || password.length < 8) {
      toast.error('Set an 8+ character password (use Generate for a strong one)');
      return;
    }
    setLoading(true);
    toast('Starting hotspot — Windows can take up to 30 seconds…', { icon: '⏳' });
    try {
      await apiFetch('/hotspot/start', {
        method: 'POST',
        body: JSON.stringify({ ssid, password })
      });
      toast.success(`Hotspot "${ssid}" started — connect devices to this WiFi`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start hotspot');
    } finally {
      setLoading(false);
    }
  };

  const stopHotspot = async () => {
    setLoading(true);
    try {
      await apiFetch('/hotspot/stop', { method: 'POST' });
      toast.success('Hotspot stopped');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop');
    } finally {
      setLoading(false);
    }
  };

  const freeze = useCallback(async () => {
    if (!status.isActive) {
      toast.error('Start hotspot first');
      return;
    }
    try {
      await apiFetch('/hotspot/freeze', {
        method: 'POST',
        body: JSON.stringify({ durationMs: null, ...targetBody(targets) })
      });
      toast('❄️ FROZEN', { icon: '🎮' });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Freeze failed');
    }
  }, [status.isActive, refresh, targets]);

  const unfreeze = useCallback(async () => {
    try {
      await apiFetch('/hotspot/unfreeze', { method: 'POST' });
      toast.success('Connection restored');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unfreeze failed');
    }
  }, [refresh]);

  const timedFreeze = async (ms: number) => {
    try {
      await apiFetch('/hotspot/freeze', {
        method: 'POST',
        body: JSON.stringify({ durationMs: ms, ...targetBody(targets) })
      });
      toast(`Freeze ${ms}ms`, { icon: '⏱️' });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Timed freeze failed');
    }
  };

  const pulse = async () => {
    try {
      await apiFetch('/hotspot/pulse', {
        method: 'POST',
        body: JSON.stringify({
          count: pulseCount,
          freezeMs: freezeDuration,
          unfreezeMs: 80,
          ...targetBody(targets)
        })
      });
      toast.success('Pulse lag sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pulse failed');
    }
  };

  const toggleConstantLag = async () => {
    setLoading(true);
    try {
      if (status.constantLagActive) {
        await apiFetch('/hotspot/constant-lag/stop', { method: 'POST' });
        toast.success('Constant lag stopped');
      } else {
        await apiFetch('/hotspot/constant-lag/start', {
          method: 'POST',
          body: JSON.stringify({ lagMs, dropPercent, ...targetBody(targets) })
        });
        const dropNote = dropPercent > 0 ? ` + ${dropPercent}% drop` : '';
        toast.success(`Constant lag — ${lagMs}ms${dropNote}`);
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Constant lag failed');
    } finally {
      setLoading(false);
    }
  };

  const applyBandwidthCap = async () => {
    setLoading(true);
    try {
      await apiFetch('/hotspot/bandwidth-cap', {
        method: 'POST',
        body: JSON.stringify({
          uploadKbps: capUpload,
          downloadKbps: capDownload,
          ...targetBody(targets)
        })
      });
      toast.success(`Cap: ${capUpload}/${capDownload} Kbps`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bandwidth cap failed');
    } finally {
      setLoading(false);
    }
  };

  const clearBandwidthCap = async () => {
    try {
      await apiFetch('/hotspot/bandwidth-cap/clear', { method: 'POST' });
      toast.success('Bandwidth cap removed');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clear cap failed');
    }
  };

  const startGamingMode = async () => {
    if (!status.isActive) {
      toast.error('Start hotspot first');
      return;
    }
    setGamingLoading(true);
    try {
      const result = await apiFetch<{ message?: string }>('/hotspot/gaming-mode/start', {
        method: 'POST',
        body: JSON.stringify(targetBody(targets))
      });
      toast.success(result.message || 'Gaming mode ON');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gaming mode failed');
    } finally {
      setGamingLoading(false);
    }
  };

  const stopGamingMode = async () => {
    setGamingLoading(true);
    try {
      await apiFetch('/hotspot/gaming-mode/stop', { method: 'POST' });
      toast.success('Gaming mode stopped');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Stop failed');
    } finally {
      setGamingLoading(false);
    }
  };

  const applyPreset = async (presetId: string) => {
    try {
      const data = await apiFetch<{ preset: SsidPreset }>('/hotspot/preset', {
        method: 'POST',
        body: JSON.stringify({ presetId })
      });
      if (data.preset) {
        setSsid(data.preset.ssid);
        if (data.preset.password) setPassword(data.preset.password);
        toast.success(`Preset: ${data.preset.label}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preset failed');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!status.isActive) return;
      if (e.key === 'F9') {
        e.preventDefault();
        freeze();
      }
      if (e.key === 'F10') {
        e.preventDefault();
        unfreeze();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status.isActive, freeze, unfreeze]);

  const presets = status.ssidPresets ?? [];
  const clients = status.clients ?? [];
  const targetingLabel =
    targets.length > 0 ? `${targets.length} selected` : `all ${clients.length} client(s)`;

  const engineLabel =
    status.freezeEngine === 'windivert' || status.constantLagEngine === 'windivert'
      ? 'WinDivert'
      : status.freezeEngine === 'firewall'
        ? 'Firewall'
        : status.constantLagEngine === 'arp'
          ? 'ARP lag'
          : 'Idle';

  return (
    <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 rounded-2xl border border-indigo-600/40 p-6 text-white shadow-2xl">
      {hotspotBlockReason && !status.isActive && (
        <div className="mb-4 flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{hotspotBlockReason}</span>
        </div>
      )}
      <div className="mb-4 flex items-center gap-2">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs flex-1">
        <HealthPill
          label="Windows hotspot"
          value={status.windowsHotspotActive ? 'ON' : 'OFF'}
          ok={Boolean(status.windowsHotspotActive)}
        />
        <HealthPill label="App linked" value={status.isActive ? 'YES' : 'NO'} ok={status.isActive} />
        <HealthPill
          label="Engine"
          value={engineLabel}
          ok={engineLabel !== 'Idle' || status.isActive}
        />
        <HealthPill label="Clients" value={String(clients.length)} ok={clients.length > 0} />
        <HealthPill
          label="WinDivert"
          value={status.windivertAvailable ? 'Ready' : 'Fallback'}
          ok={Boolean(status.windivertAvailable)}
        />
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="shrink-0 px-2 py-2 rounded-lg border border-indigo-500/40 text-[10px] text-indigo-200 hover:bg-indigo-800/40"
          title="Refresh status"
        >
          Refresh
        </button>
      </div>

      {capability && !status.isActive && (
        <div className="mb-4 rounded-xl bg-amber-900/30 border border-amber-600/40 p-3 text-sm text-amber-100 space-y-1">
          {!capability.isAdmin && (
            <p>⚠️ Run as Administrator — hotspot and freeze need admin rights.</p>
          )}
          {!capability.hasWifi && <p>⚠️ No WiFi adapter detected.</p>}
          {capability.isAdmin && capability.hasWifi && (
            <p className="text-green-200">✓ Ready — enable Mobile hotspot once in Windows Settings if start fails.</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 mb-5">
        <div className="bg-indigo-600/80 p-3 rounded-xl">
          <Gamepad2 className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Hotspot Hub</h2>
          <p className="text-sm text-indigo-200/90">
            Per-client freeze via WinDivert (hotspot) + Npcap (LAN) — auto-fallback to firewall
          </p>
        </div>
        <div className="ml-auto text-right space-y-1">
          {status.windivertAvailable && (
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-600/80 text-white">
              WinDivert ready
            </span>
          )}
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
              status.isActive
                ? status.isTrafficBlocked
                  ? 'bg-red-500'
                  : 'bg-emerald-500'
                : 'bg-slate-600'
            }`}
          >
            {status.isActive
              ? status.isTrafficBlocked
                ? `FROZEN · ${targetingLabel}${status.freezeEngine === 'windivert' ? ' · WD' : ''}`
                : `LIVE · ${status.connectedDevices} client(s)`
              : 'OFFLINE'}
          </span>
        </div>
      </div>

      {!status.isActive ? (
        <div className="space-y-4">
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className="px-3 py-1.5 text-xs rounded-lg bg-indigo-700/50 hover:bg-indigo-600 border border-indigo-500/40 flex items-center gap-1"
                >
                  <Bookmark className="w-3 h-3" />
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-indigo-300 mb-1 block">WiFi Name</label>
              <input
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-indigo-600/50 text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-indigo-300 mb-1 block">Password</label>
              <div className="flex gap-2">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ chars"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-indigo-600/50 text-white text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={generatePassword}
                  className="shrink-0 px-3 py-2 rounded-lg border border-indigo-500/50 text-xs text-indigo-200 hover:bg-indigo-500/10"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={startHotspot}
            disabled={loading}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl font-bold text-lg flex items-center justify-center gap-2"
          >
            <Power className="w-5 h-5" />
            Start Hotspot
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-indigo-200 text-center">
            Connect devices to <strong className="text-white">{status.ssid}</strong> · Password{' '}
            <strong className="text-white font-mono">{password}</strong>
          </p>
          <button
            type="button"
            onClick={copyCredentials}
            className="mx-auto flex items-center gap-2 px-4 py-2 rounded-lg border border-indigo-500/50 text-sm text-indigo-100 hover:bg-indigo-500/10"
          >
            <Copy className="w-4 h-4" />
            Copy WiFi name &amp; password
          </button>

          <div className="rounded-xl border border-indigo-500/30 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-indigo-200 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Clients ({clients.length})
              </h3>
              <div className="flex gap-2 text-xs">
                <button onClick={selectAllClients} className="text-indigo-300 hover:text-white">
                  Select all
                </button>
                <button onClick={clearSelection} className="text-indigo-300 hover:text-white">
                  All clients
                </button>
              </div>
            </div>
            {clients.length === 0 ? (
              <p className="text-sm text-indigo-300/70 text-center py-3">
                No clients yet — connect Xbox/phone to the hotspot WiFi
              </p>
            ) : (
              <div className="space-y-2">
                {clients.map((client) => {
                  const checked = selectedMacs.has(client.mac);
                  const frozen = status.frozenTargetIps?.includes(client.ip);
                  return (
                    <label
                      key={client.mac}
                      className={`flex items-center gap-3 font-mono text-xs rounded-lg px-3 py-2 cursor-pointer border ${
                        checked
                          ? 'bg-indigo-800/50 border-indigo-400/50'
                          : 'bg-slate-800/50 border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleClient(client.mac)}
                        className="rounded"
                      />
                      <span className="flex-1">{client.ip}</span>
                      <span className="text-indigo-300">{client.mac}</span>
                      {frozen && <span className="text-red-400 font-bold">FROZEN</span>}
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-indigo-400 mt-2">
              Target: {targetingLabel}. Empty selection = all connected clients (host {status.hostIp ?? '192.168.137.1'} excluded).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!status.isTrafficBlocked ? (
              <button
                onClick={freeze}
                className="col-span-2 py-5 bg-red-600 hover:bg-red-500 rounded-2xl font-black text-xl flex items-center justify-center gap-3 shadow-lg shadow-red-900/40"
              >
                <WifiOff className="w-7 h-7" />
                FREEZE ({targetingLabel})
              </button>
            ) : (
              <button
                onClick={unfreeze}
                className="col-span-2 py-5 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black text-xl flex items-center justify-center gap-3"
              >
                <Wifi className="w-7 h-7" />
                UNFREEZE
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[100, 200, 500, 1000].map((ms) => (
              <button
                key={ms}
                onClick={() => timedFreeze(ms)}
                className="py-2.5 bg-indigo-700/80 hover:bg-indigo-600 rounded-lg font-bold text-sm"
              >
                {ms}ms
              </button>
            ))}
          </div>

          <div className="rounded-xl p-4 border border-orange-500/40 bg-orange-900/25">
            <h3 className="font-bold text-orange-200 mb-1 flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4" />
              Network shaping (clumsy-style)
            </h3>
            <p className="text-xs text-orange-200/70 mb-3">
              WinDivert lag + optional packet loss on {targetingLabel}
              {status.constantLagActive && (
                <span className="ml-2 text-emerald-300 font-semibold">
                  LIVE · {status.constantLagMs ?? lagMs}ms
                  {(status.constantLagDropPercent ?? 0) > 0
                    ? ` · ${status.constantLagDropPercent}% drop`
                    : ''}
                </span>
              )}
            </p>
            <div className="space-y-3 mb-3">
              <label className="block text-xs text-orange-200">
                Lag delay: <strong className="text-white">{lagMs}ms</strong>
                <input
                  type="range"
                  min={50}
                  max={2000}
                  step={25}
                  value={lagMs}
                  onChange={(e) => setLagMs(parseInt(e.target.value, 10))}
                  className="w-full mt-1 accent-orange-500"
                />
              </label>
              <label className="block text-xs text-orange-200">
                Packet drop: <strong className="text-white">{dropPercent}%</strong>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={5}
                  value={dropPercent}
                  onChange={(e) => setDropPercent(parseInt(e.target.value, 10))}
                  className="w-full mt-1 accent-red-500"
                />
              </label>
            </div>
            <button
              onClick={toggleConstantLag}
              disabled={loading}
              className={`w-full py-3 rounded-xl font-bold text-sm ${
                status.constantLagActive ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-orange-600 hover:bg-orange-500'
              }`}
            >
              {status.constantLagActive ? 'Stop shaping' : 'Start lag + drop'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full py-2.5 rounded-xl border border-indigo-500/40 text-sm font-medium text-indigo-200 hover:bg-indigo-800/30"
          >
            {showAdvanced ? '▾ Hide advanced' : '▸ Advanced — pulse, cap, gaming mode'}
          </button>

          {showAdvanced && (
          <>
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-purple-900/20 border border-purple-500/30">
            <div>
              <label className="text-xs text-purple-200">Pulses</label>
              <input
                type="number"
                value={pulseCount}
                onChange={(e) => setPulseCount(parseInt(e.target.value, 10))}
                className="w-full mt-1 px-2 py-1.5 rounded bg-slate-900/60 border border-purple-500/30 text-sm"
                min={1}
                max={20}
              />
            </div>
            <div>
              <label className="text-xs text-purple-200">Freeze ms</label>
              <input
                type="number"
                value={freezeDuration}
                onChange={(e) => setFreezeDuration(parseInt(e.target.value, 10))}
                className="w-full mt-1 px-2 py-1.5 rounded bg-slate-900/60 border border-purple-500/30 text-sm"
                min={50}
                max={1000}
              />
            </div>
            <button
              onClick={pulse}
              className="col-span-2 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold flex items-center justify-center gap-2"
            >
              <Zap className="w-5 h-5" />
              Pulse Lag
            </button>
          </div>

          <div className="rounded-xl p-4 border border-cyan-500/30 bg-cyan-900/20">
              <h3 className="font-bold text-cyan-200 mb-2 flex items-center gap-2 text-sm">
                <Gauge className="w-4 h-4" />
                Bandwidth Cap (Kbps)
              </h3>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="number"
                  value={capUpload}
                  onChange={(e) => setCapUpload(parseInt(e.target.value, 10))}
                  className="px-2 py-1.5 rounded bg-slate-900/60 border border-cyan-500/30 text-sm"
                />
                <input
                  type="number"
                  value={capDownload}
                  onChange={(e) => setCapDownload(parseInt(e.target.value, 10))}
                  className="px-2 py-1.5 rounded bg-slate-900/60 border border-cyan-500/30 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={applyBandwidthCap}
                  disabled={loading}
                  className="flex-1 bg-cyan-600 py-2 rounded-lg font-bold text-sm"
                >
                  Apply
                </button>
                {status.bandwidthCap && (
                  <button onClick={clearBandwidthCap} className="px-3 border border-cyan-500/40 rounded-lg text-sm">
                    Clear
                  </button>
                )}
              </div>
            </div>

          <div className="rounded-xl p-4 border border-purple-500/40 bg-purple-900/25">
            <h3 className="font-bold text-purple-200 mb-1 flex items-center gap-2 text-sm">
              <Gamepad2 className="w-4 h-4" />
              Gaming Mode
            </h3>
            <p className="text-xs text-purple-200/80 mb-3">
              One tap: constant lag + auto pulse spikes on {targetingLabel}. Tune lag/pulse in Tools → Settings.
            </p>
            {status.gamingModeActive ? (
              <button
                onClick={stopGamingMode}
                disabled={gamingLoading}
                className="w-full py-3 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                Stop gaming mode
              </button>
            ) : (
              <button
                onClick={startGamingMode}
                disabled={gamingLoading || clients.length === 0}
                className="w-full py-3 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
              >
                Start gaming mode
              </button>
            )}
          </div>
          </>
          )}

          <div className="flex items-center gap-2 justify-center text-xs text-indigo-300 bg-indigo-900/30 rounded-lg py-2">
            <Keyboard className="w-4 h-4" />
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">F9</kbd> Freeze ·{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">F10</kbd> Unfreeze
          </div>

          <button
            onClick={stopHotspot}
            disabled={loading}
            className="w-full py-2 text-sm text-indigo-300 hover:text-white border border-indigo-700/60 rounded-lg"
          >
            Stop Hotspot (turns off Windows WiFi sharing — not the same as Freeze)
          </button>
        </div>
      )}
    </div>
  );
}

function HealthPill({
  label,
  value,
  ok
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-2 py-2 border text-center ${
        ok ? 'border-emerald-500/40 bg-emerald-900/20' : 'border-slate-600/50 bg-slate-900/40'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-indigo-300/80">{label}</div>
      <div className={`font-bold ${ok ? 'text-emerald-300' : 'text-slate-300'}`}>{value}</div>
    </div>
  );
}
