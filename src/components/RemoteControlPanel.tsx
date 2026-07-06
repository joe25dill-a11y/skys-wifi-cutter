import { useEffect, useState } from 'react';
import { Smartphone, Wifi, WifiOff, Scissors, RotateCcw, ExternalLink, Copy, AlertCircle, Gauge, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';
import { Device, HealthResponse } from '../types/device';
import { QrCode } from './QrCode';

interface RemoteStatus {
  version: string;
  hotspotActive: boolean;
  hotspotFrozen: boolean;
  connectedClients: number;
  deviceCount: number;
  cutCount: number;
}

interface RemoteControlPanelProps {
  devices: Device[];
  health: HealthResponse | null;
}

export function RemoteControlPanel({ devices, health }: RemoteControlPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [targetMac, setTargetMac] = useState('');
  const [saving, setSaving] = useState(false);
  const [pcIp, setPcIp] = useState('');

  const remote = health?.remote;
  const needsRestart = remote?.needsRestart;
  const listeningOk = remote?.enabled && remote?.listening;

  useEffect(() => {
    apiFetch<{ remoteControlEnabled: boolean; remotePinSet: boolean }>('/settings')
      .then((s) => {
        setEnabled(Boolean(s.remoteControlEnabled));
        setPinSet(Boolean(s.remotePinSet));
      })
      .catch(() => null);
    apiFetch<{ network?: { ip?: string } }>('/health')
      .then((h) => setPcIp(h.network?.ip || ''))
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (devices.length && !targetMac) {
      setTargetMac(devices[0].mac_address);
    }
  }, [devices, targetMac]);

  const remotePageUrl = pcIp ? `http://${pcIp}:3001/remote` : '';

  const copyRemoteLink = async () => {
    if (!remotePageUrl) {
      toast.error('PC LAN IP not detected yet — wait for health check');
      return;
    }
    await navigator.clipboard.writeText(remotePageUrl);
    toast.success('Remote link copied');
  };

  const saveSettings = async () => {
    if (enabled && !pinSet && newPin.length < 4) {
      toast.error('Set a PIN with 4+ digits');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { remoteControlEnabled: enabled };
      if (newPin.length >= 4) body.remotePin = newPin;
      const result = await apiFetch<{ remotePinSet: boolean }>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      setPinSet(Boolean(result.remotePinSet));
      setNewPin('');
      toast.success(
        enabled
          ? 'Remote enabled — restart the app so phones on your LAN can connect'
          : 'Remote settings saved — restart if you just turned remote off'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remoteFetch = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Remote-Pin': inputPin,
      ...(options.headers as Record<string, string>)
    };
    return apiFetch<T>(path, { ...options, headers });
  };

  const refreshStatus = async () => {
    try {
      const data = await remoteFetch<RemoteStatus>('/remote/status');
      setStatus(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Status failed — check PIN');
    }
  };

  const freezeHotspot = async () => {
    try {
      await remoteFetch('/remote/hotspot/freeze', { method: 'POST' });
      toast.success('Hotspot frozen');
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Freeze failed');
    }
  };

  const unfreezeHotspot = async () => {
    try {
      await remoteFetch('/remote/hotspot/unfreeze', { method: 'POST' });
      toast.success('Hotspot unfrozen');
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unfreeze failed');
    }
  };

  const cutDevice = async () => {
    if (!targetMac) return;
    try {
      await remoteFetch(`/remote/devices/${encodeURIComponent(targetMac)}/cut`, { method: 'POST' });
      toast.success('Device cut');
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cut failed');
    }
  };

  const restoreDevice = async () => {
    if (!targetMac) return;
    try {
      await remoteFetch(`/remote/devices/${encodeURIComponent(targetMac)}/restore`, {
        method: 'POST'
      });
      toast.success('Device restored');
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed');
    }
  };

  const applyLag = async () => {
    if (!targetMac) return;
    try {
      await remoteFetch(`/remote/devices/${encodeURIComponent(targetMac)}/lag`, {
        method: 'POST',
        body: JSON.stringify({ lagMs: 150 })
      });
      toast.success('150ms lag applied');
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lag failed');
    }
  };

  const limitSpeed = async () => {
    if (!targetMac) return;
    try {
      await remoteFetch(`/remote/devices/${encodeURIComponent(targetMac)}/limit-speed`, {
        method: 'POST',
        body: JSON.stringify({ uploadKbps: 512, downloadKbps: 512 })
      });
      toast.success('512 kbps speed cap applied');
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Speed limit failed');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Smartphone className="w-5 h-5 text-indigo-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Phone Remote Control</h3>
        {remote?.enabled && (
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
              listeningOk
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : needsRestart
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  : 'bg-slate-500/20 text-slate-500'
            }`}
          >
            {listeningOk ? 'LAN ready' : needsRestart ? 'Restart needed' : 'Off'}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Off by default. Enable, set a PIN (4+ digits), save, then <strong>restart the app</strong> so phones on
        your LAN can connect.
      </p>

      {needsRestart && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/60 p-3 text-xs text-amber-900 dark:text-amber-100 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            <strong>Restart required:</strong> remote is {remote?.enabled ? 'enabled' : 'disabled'} but the server
            is still on {remote?.listening ? 'LAN' : 'localhost only'}. Quit from tray → reopen the app.
          </p>
        </div>
      )}

      <div className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 space-y-2">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Phone URL (same WiFi/LAN)</p>
        {pcIp ? (
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <code className="text-sm text-indigo-600 dark:text-indigo-400 font-mono break-all">{remotePageUrl}</code>
              <button
                onClick={copyRemoteLink}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs hover:bg-white dark:hover:bg-slate-800"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy link
              </button>
              <a
                href={remotePageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs hover:bg-white dark:hover:bg-slate-800"
              >
                Open
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="shrink-0 text-center">
              <QrCode
                value={remotePageUrl}
                size={120}
                className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white p-1"
              />
              <p className="text-[10px] text-slate-500 mt-1">Scan on phone (offline QR)</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Detecting PC LAN IP from health check…</p>
        )}
        <p className="text-[11px] text-slate-500">
          PC IP: <span className="font-mono">{pcIp || '—'}</span> · API header{' '}
          <code className="text-indigo-600">X-Remote-Pin</code>
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable remote API
      </label>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="password"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
          placeholder={pinSet ? 'New PIN (leave blank to keep)' : 'Remote PIN (4+ digits)'}
          className="px-3 py-2 rounded-lg border dark:bg-slate-700 text-sm"
        />
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
        >
          Save
        </button>
      </div>
      {pinSet && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">PIN is set (stored hashed, never shown)</p>
      )}

      <hr className="border-slate-200 dark:border-slate-700" />

      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Test remote (enter PIN)</p>
      <div className="flex gap-2">
        <input
          type="password"
          value={inputPin}
          onChange={(e) => setInputPin(e.target.value)}
          placeholder="PIN to test"
          className="flex-1 px-3 py-2 rounded-lg border dark:bg-slate-700 text-sm"
        />
        <button onClick={refreshStatus} className="px-3 py-2 rounded-lg border text-sm">
          Status
        </button>
      </div>

      {status && (
        <div className="text-xs bg-slate-50 dark:bg-slate-900 rounded-lg p-3 space-y-1">
          <p>
            v{status.version} · {status.deviceCount} devices · {status.cutCount} cut
          </p>
          <p>
            Hotspot: {status.hotspotActive ? (status.hotspotFrozen ? 'FROZEN' : 'ON') : 'OFF'} ·{' '}
            {status.connectedClients} client(s)
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={freezeHotspot}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-bold"
        >
          <WifiOff className="w-3.5 h-3.5" />
          Freeze hotspot
        </button>
        <button
          onClick={unfreezeHotspot}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold"
        >
          <Wifi className="w-3.5 h-3.5" />
          Unfreeze
        </button>
      </div>

      <div className="space-y-2">
        <select
          value={targetMac}
          onChange={(e) => setTargetMac(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border dark:bg-slate-700 text-sm"
        >
          <option value="">Select device…</option>
          {devices.map((d) => (
            <option key={d.mac_address} value={d.mac_address}>
              {d.name} — {d.ip_address}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={cutDevice}
            disabled={!targetMac}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-100 text-red-700 text-xs font-medium disabled:opacity-50"
          >
            <Scissors className="w-3.5 h-3.5" />
            Cut
          </button>
          <button
            onClick={restoreDevice}
            disabled={!targetMac}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-100 text-green-700 text-xs font-medium disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore
          </button>
          <button
            onClick={applyLag}
            disabled={!targetMac}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-purple-100 text-purple-700 text-xs font-medium disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            Lag 150ms
          </button>
          <button
            onClick={limitSpeed}
            disabled={!targetMac}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-100 text-blue-700 text-xs font-medium disabled:opacity-50"
          >
            <Gauge className="w-3.5 h-3.5" />
            Cap 512k
          </button>
        </div>
      </div>
    </div>
  );
}
