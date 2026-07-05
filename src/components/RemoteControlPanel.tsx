import { useEffect, useState } from 'react';
import { Smartphone, Wifi, WifiOff, Scissors, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';

interface RemoteStatus {
  version: string;
  hotspotActive: boolean;
  hotspotFrozen: boolean;
  connectedClients: number;
  deviceCount: number;
  cutCount: number;
}

export function RemoteControlPanel() {
  const [enabled, setEnabled] = useState(false);
  const [pin, setPin] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [targetMac, setTargetMac] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ remoteControlEnabled: boolean; remotePin: string }>('/settings')
      .then((s) => {
        setEnabled(Boolean(s.remoteControlEnabled));
        setPin(s.remotePin || '');
      })
      .catch(() => null);
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiFetch('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          remoteControlEnabled: enabled,
          remotePin: pin
        })
      });
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

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-indigo-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Phone Remote Control</h3>
      </div>
      <p className="text-xs text-slate-500">
        Off by default. Enable, set a PIN (4+ digits), save, then <strong>restart the app</strong>.
        From another device on your LAN call{' '}
        <code className="text-indigo-600">http://&lt;PC-IP&gt;:3001/api/remote/...</code> with header{' '}
        <code className="text-indigo-600">X-Remote-Pin</code>. Cut/block APIs stay localhost-only.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable remote API
      </label>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Remote PIN (4+ digits)"
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
          <p>v{status.version} · {status.deviceCount} devices · {status.cutCount} cut</p>
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

      <div className="flex gap-2">
        <input
          value={targetMac}
          onChange={(e) => setTargetMac(e.target.value)}
          placeholder="MAC to cut/restore"
          className="flex-1 px-3 py-2 rounded-lg border dark:bg-slate-700 text-sm font-mono"
        />
        <button onClick={cutDevice} className="p-2 rounded-lg bg-red-100 text-red-700" title="Cut">
          <Scissors className="w-4 h-4" />
        </button>
        <button onClick={restoreDevice} className="p-2 rounded-lg bg-green-100 text-green-700" title="Restore">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
