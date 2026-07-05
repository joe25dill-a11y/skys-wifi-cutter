import { useEffect, useState, useCallback } from 'react';
import { Gamepad2, WifiOff, Wifi, Zap, Power, Keyboard } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';

interface HotspotCapability {
  isAdmin?: boolean;
  hasWifi?: boolean;
  hostedNetworkSupported?: boolean;
  mobileHotspotAvailable?: boolean;
  internetConnected?: boolean;
  errors?: string[];
}

interface HotspotStatus {
  isActive: boolean;
  isTrafficBlocked: boolean;
  ssid: string;
  password?: string;
  connectedDevices: number;
  clients?: { ip: string; mac: string }[];
  constantLagActive?: boolean;
  constantLagMs?: number;
  bandwidthCap?: { uploadKbps: number; downloadKbps: number } | null;
}

export function XboxLagTest() {
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

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<HotspotStatus>('/hotspot/status');
      setStatus(data);
      if (data.ssid) setSsid(data.ssid);
      if (data.password) setPassword(data.password);
    } catch {
      // server not running
    }
  }, []);

  useEffect(() => {
    refresh();
    apiFetch<HotspotCapability>('/hotspot/capability')
      .then(setCapability)
      .catch(() => null);
    apiFetch<{ defaultHotspotSsid?: string; defaultHotspotPassword?: string }>('/settings')
      .then((s) => {
        if (s.defaultHotspotSsid) setSsid(s.defaultHotspotSsid);
        if (s.defaultHotspotPassword) setPassword(s.defaultHotspotPassword);
      })
      .catch(() => null);
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [refresh]);

  const startHotspot = async () => {
    if (!password || password.length < 8) {
      toast.error('Set a hotspot password in Tools → Settings first');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/hotspot/start', {
        method: 'POST',
        body: JSON.stringify({ ssid, password })
      });
      toast.success(`Hotspot "${ssid}" started — connect your Xbox now`);
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
        body: JSON.stringify({ durationMs: null })
      });
      toast('❄️ FROZEN', { icon: '🎮' });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Freeze failed');
    }
  }, [status.isActive, refresh]);

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
        body: JSON.stringify({ durationMs: ms })
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
        body: JSON.stringify({ count: 8, freezeMs: 120, unfreezeMs: 80 })
      });
      toast.success('Pulse lag sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pulse failed');
    }
  };

  // Keyboard shortcuts while app is focused (F9 = freeze, F10 = unfreeze)
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

  const cap = capability;

  return (
    <div className="bg-gradient-to-br from-indigo-950 to-slate-900 rounded-2xl border border-indigo-700/50 p-6 text-white shadow-xl">
      {cap && !status.isActive && (
        <div className="mb-4 rounded-xl bg-amber-900/40 border border-amber-600/50 p-3 text-sm text-amber-100 space-y-1">
          {!cap.isAdmin && (
            <p>⚠️ <strong>Not running as Administrator</strong> — hotspot will fail. Restart app from Admin PowerShell.</p>
          )}
          {!cap.hasWifi && (
            <p>⚠️ <strong>No WiFi adapter</strong> — desktop PCs on Ethernet only often cannot share hotspot.</p>
          )}
          {!cap.internetConnected && (
            <p>⚠️ <strong>No internet</strong> — connect PC to WiFi or Ethernet first.</p>
          )}
          {cap.isAdmin && cap.hasWifi && (
            <p className="text-green-200">✓ Admin + WiFi detected. If start fails, enable Mobile hotspot once in Windows Settings.</p>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-indigo-600 p-3 rounded-xl">
          <Gamepad2 className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Hotspot & Lag Control</h2>
          <p className="text-sm text-indigo-200">
            Arcai-style — create a WiFi, freeze/lag any device on it (Xbox, phone, etc.)
          </p>
        </div>
        <div className="ml-auto text-right">
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
              status.isActive
                ? status.isTrafficBlocked
                  ? 'bg-red-500'
                  : 'bg-green-500'
                : 'bg-slate-600'
            }`}
          >
            {status.isActive
              ? status.isTrafficBlocked
                ? 'FROZEN'
                : `LIVE · ${status.connectedDevices} connected`
              : 'OFFLINE'}
          </span>
        </div>
      </div>

      {!status.isActive ? (
        <div className="space-y-4">
          <div className="bg-indigo-900/40 rounded-xl p-4 text-sm text-indigo-100 leading-relaxed">
            <strong>Setup:</strong> Start hotspot → Connect phone/Xbox/any device to{' '}
            <strong>{ssid}</strong> → Use FREEZE here to cut their internet or test lag.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-indigo-300 mb-1 block">WiFi Name</label>
              <input
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-indigo-600 text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-indigo-300 mb-1 block">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-indigo-600 text-white text-sm"
              />
            </div>
          </div>
          <button
            onClick={startHotspot}
            disabled={loading}
            className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-xl font-bold text-lg flex items-center justify-center gap-2"
          >
            <Power className="w-5 h-5" />
            Start Hotspot
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-indigo-200 text-center">
            Xbox should be on WiFi: <strong className="text-white">{status.ssid}</strong> · Password:{' '}
            <strong className="text-white">{password}</strong>
          </p>

          <div className="grid grid-cols-2 gap-3">
            {!status.isTrafficBlocked ? (
              <button
                onClick={freeze}
                className="col-span-2 py-6 bg-red-600 hover:bg-red-500 rounded-2xl font-black text-2xl flex items-center justify-center gap-3 shadow-lg shadow-red-900/50"
              >
                <WifiOff className="w-8 h-8" />
                FREEZE
              </button>
            ) : (
              <button
                onClick={unfreeze}
                className="col-span-2 py-6 bg-green-600 hover:bg-green-500 rounded-2xl font-black text-2xl flex items-center justify-center gap-3 shadow-lg shadow-green-900/50"
              >
                <Wifi className="w-8 h-8" />
                UNFREEZE
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[100, 200, 500, 1000].map((ms) => (
              <button
                key={ms}
                onClick={() => timedFreeze(ms)}
                className="py-3 bg-indigo-700 hover:bg-indigo-600 rounded-lg font-bold text-sm"
              >
                {ms}ms
              </button>
            ))}
          </div>

          <button
            onClick={pulse}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5" />
            Pulse Lag (8x rapid freeze)
          </button>

          <div className="flex items-center gap-2 justify-center text-xs text-indigo-300 bg-indigo-900/30 rounded-lg py-2">
            <Keyboard className="w-4 h-4" />
            Hotkeys: <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">F9</kbd> Freeze ·{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">F10</kbd> Unfreeze
          </div>

          <button
            onClick={stopHotspot}
            disabled={loading}
            className="w-full py-2 text-sm text-indigo-300 hover:text-white border border-indigo-700 rounded-lg"
          >
            Stop Hotspot
          </button>
        </div>
      )}
    </div>
  );
}
