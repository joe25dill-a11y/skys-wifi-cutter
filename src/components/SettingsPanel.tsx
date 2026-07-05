import { useEffect, useState } from 'react';
import { Settings, Save, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';

export interface AppSettings {
  bandwidthAlertMbps: number;
  bandwidthAlertsEnabled: boolean;
  newDeviceAlertsEnabled: boolean;
  compactDeviceList: boolean;
  minimizeToTrayOnClose: boolean;
  stopHotspotOnQuit: boolean;
  preferWinDivertForHotspot: boolean;
  powerSaverMode: boolean;
  livePollMs: number;
  defaultHotspotSsid: string;
  defaultHotspotPassword: string;
  gamingModeLagMs: number;
  gamingModePulseIntervalSec: number;
}

const DEFAULTS: AppSettings = {
  bandwidthAlertMbps: 50,
  bandwidthAlertsEnabled: true,
  newDeviceAlertsEnabled: true,
  compactDeviceList: false,
  minimizeToTrayOnClose: true,
  stopHotspotOnQuit: true,
  preferWinDivertForHotspot: true,
  powerSaverMode: false,
  livePollMs: 12000,
  defaultHotspotSsid: 'Xbox-LagControl',
  defaultHotspotPassword: '',
  gamingModeLagMs: 120,
  gamingModePulseIntervalSec: 30
};

interface SettingsPanelProps {
  onSettingsChange?: (settings: AppSettings) => void;
}

export function SettingsPanel({ onSettingsChange }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<AppSettings>('/settings')
      .then((data) => {
        const merged = { ...DEFAULTS, ...data };
        setSettings(merged);
        onSettingsChange?.(merged);
      })
      .catch(() => null);
  }, [onSettingsChange]);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await apiFetch<AppSettings>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings)
      });
      const merged = { ...DEFAULTS, ...saved };
      setSettings(merged);
      onSettingsChange?.(merged);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const generatePassword = async () => {
    try {
      const result = await apiFetch<{ password: string; settings: AppSettings }>(
        '/settings/generate-hotspot-password',
        { method: 'POST' }
      );
      const merged = { ...DEFAULTS, ...result.settings };
      setSettings(merged);
      onSettingsChange?.(merged);
      toast.success('New random hotspot password generated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generate failed');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-slate-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">App Settings</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-6 text-sm">
        <section className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Window & quit</h4>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.minimizeToTrayOnClose}
              onChange={(e) => update('minimizeToTrayOnClose', e.target.checked)}
            />
            <span>Minimize to tray when closing (X button)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.stopHotspotOnQuit}
              onChange={(e) => update('stopHotspotOnQuit', e.target.checked)}
            />
            <span>Stop Windows Mobile Hotspot when quitting app</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.powerSaverMode}
              onChange={(e) => update('powerSaverMode', e.target.checked)}
            />
            <span>Power saver — slower background polling</span>
          </label>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Hotspot defaults</h4>
          <label className="block">
            <span className="text-slate-500 text-xs">Default SSID</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2"
              value={settings.defaultHotspotSsid}
              onChange={(e) => update('defaultHotspotSsid', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">Default password (8+ chars, not weak defaults)</span>
            <div className="mt-1 flex gap-2">
              <input
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 font-mono text-xs"
                value={settings.defaultHotspotPassword}
                onChange={(e) => update('defaultHotspotPassword', e.target.value)}
              />
              <button
                type="button"
                onClick={generatePassword}
                className="shrink-0 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
                title="Generate random password"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.preferWinDivertForHotspot}
              onChange={(e) => update('preferWinDivertForHotspot', e.target.checked)}
            />
            <span>Prefer WinDivert for hotspot freeze/lag (fallback: firewall/ARP)</span>
          </label>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Gaming mode</h4>
          <label className="block">
            <span className="text-slate-500 text-xs">Constant lag (ms)</span>
            <input
              type="number"
              min={50}
              max={500}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2"
              value={settings.gamingModeLagMs}
              onChange={(e) => update('gamingModeLagMs', Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">Auto-pulse interval (seconds)</span>
            <input
              type="number"
              min={10}
              max={120}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2"
              value={settings.gamingModePulseIntervalSec}
              onChange={(e) => update('gamingModePulseIntervalSec', Number(e.target.value))}
            />
          </label>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Alerts & UI</h4>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.bandwidthAlertsEnabled}
              onChange={(e) => update('bandwidthAlertsEnabled', e.target.checked)}
            />
            <span>Bandwidth spike alerts</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.newDeviceAlertsEnabled}
              onChange={(e) => update('newDeviceAlertsEnabled', e.target.checked)}
            />
            <span>New device join toasts</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.compactDeviceList}
              onChange={(e) => update('compactDeviceList', e.target.checked)}
            />
            <span>Compact device list</span>
          </label>
        </section>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
