import { useEffect, useState } from 'react';
import { Shield, ShieldOff, Scissors, RotateCcw, Check, X, Download, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';
import { Device, HealthResponse } from '../types/device';
import { ConfirmModal } from './ConfirmModal';
import { SchedulePanel } from './SchedulePanel';
import { GroupsPanel } from './GroupsPanel';
import { AuditLogPanel } from './AuditLogPanel';
import { AuditTimeline } from './AuditTimeline';
import { RemoteControlPanel } from './RemoteControlPanel';
import { RulesPanel } from './RulesPanel';
import { GamePresetsPanel } from './GamePresetsPanel';
import { SettingsPanel } from './SettingsPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { CutTroubleshootingPanel } from './CutTroubleshootingPanel';

interface ToolsPanelProps {
  devices: Device[];
  health: HealthResponse | null;
  onDevicesChange: (devices: Device[]) => void;
  selectedDeviceMac?: string | null;
  onSelectedDeviceMacChange?: (mac: string) => void;
  onHealthRefresh?: () => void;
}

const FEATURES = [
  { name: 'LAN device scan', netcut: true, arcai: true, us: true },
  { name: 'Cut / block devices (ARP)', netcut: true, arcai: true, us: true },
  { name: 'Cut all / restore all', netcut: true, arcai: true, us: true },
  { name: 'Rename devices', netcut: true, arcai: true, us: true },
  { name: 'Network defense', netcut: true, arcai: false, us: true },
  { name: 'Bandwidth monitor', netcut: true, arcai: true, us: true },
  { name: 'WiFi hotspot + freeze', netcut: false, arcai: true, us: true },
  { name: 'Lag switch / ghost pulse', netcut: true, arcai: false, us: true },
  { name: 'Per-device speed limit', netcut: true, arcai: true, us: 'Yes (Windows)' },
  { name: 'Per-device bandwidth', netcut: true, arcai: true, us: 'Yes (Npcap)' },
  { name: 'Port blocker (gaming presets)', netcut: true, arcai: true, us: true },
  { name: 'Subscription fee', netcut: '$', arcai: '$', us: 'FREE' }
];

export function ToolsPanel({
  devices,
  health,
  onDevicesChange,
  selectedDeviceMac,
  onSelectedDeviceMacChange,
  onHealthRefresh
}: ToolsPanelProps) {
  const [defenseActive, setDefenseActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'cutAll' | 'restoreAll' | null>(null);

  const localMac = health?.network?.mac?.toUpperCase();
  const cutTargetCount = devices.filter((d) => d.mac_address.toUpperCase() !== localMac).length;

  useEffect(() => {
    apiFetch<{ isActive: boolean }>('/defense/status')
      .then((s) => setDefenseActive(s.isActive))
      .catch(() => null);
  }, []);

  const toggleDefense = async () => {
    setLoading(true);
    try {
      if (defenseActive) {
        await apiFetch('/defense/disable', { method: 'POST' });
        setDefenseActive(false);
        toast.success('Network defense disabled');
      } else {
        await apiFetch('/defense/enable', { method: 'POST' });
        setDefenseActive(true);
        toast.success('Network defense enabled — gateway ARP pinned');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Defense toggle failed');
    } finally {
      setLoading(false);
    }
  };

  const cutAll = async () => {
    if (!health?.checks?.cutReady) {
      toast.error(health?.degradedReason || 'Run as Administrator to cut devices');
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<{ devices: Device[]; message: string }>('/devices/cut-all', {
        method: 'POST'
      });
      onDevicesChange(result.devices);
      toast.success(result.message || 'All devices cut');
      toast(
        (t) => (
          <span className="flex items-center gap-2 text-sm">
            Cut all applied — undo?
            <button
              onClick={async () => {
                toast.dismiss(t.id);
                await restoreAll();
              }}
              className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold"
            >
              Restore All
            </button>
          </span>
        ),
        { duration: 5000, icon: '⚠️' }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cut all failed');
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const restoreAll = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ devices: Device[]; message: string }>('/devices/restore-all', {
        method: 'POST'
      });
      onDevicesChange(result.devices);
      toast.success(result.message || 'All devices restored');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore all failed');
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const exportSettings = async () => {
    try {
      const data = await apiFetch<Record<string, unknown>>('/settings/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skys-wifi-cutter-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Settings exported');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const importSettings = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        await apiFetch('/settings/import', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast.success('Settings imported — refresh to see changes');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Import failed');
      }
    };
    input.click();
  };

  const presetDevice =
    devices.find((d) => d.mac_address === selectedDeviceMac) ||
    devices.find((d) => d.device_type === 'console') ||
    devices[0] ||
    null;
  const presetPortBlock =
    health?.portBlocks?.find(
      (b) => b.mac.toUpperCase() === presetDevice?.mac_address.toUpperCase()
    ) ?? null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setConfirmAction('cutAll')}
          disabled={loading || cutTargetCount === 0}
          className="flex items-center justify-center gap-2 py-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-bold text-lg"
        >
          <Scissors className="w-5 h-5" />
          Cut All Devices
        </button>
        <button
          onClick={() => setConfirmAction('restoreAll')}
          disabled={loading}
          className="flex items-center justify-center gap-2 py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl font-bold text-lg"
        >
          <RotateCcw className="w-5 h-5" />
          Restore All
        </button>
        <button
          onClick={toggleDefense}
          disabled={loading}
          className={`flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-lg disabled:opacity-50 ${
            defenseActive
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white'
          }`}
        >
          {defenseActive ? <Shield className="w-5 h-5" /> : <ShieldOff className="w-5 h-5" />}
          {defenseActive ? 'Defense ON' : 'Enable Defense'}
        </button>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        <strong>Defense</strong> pins your router&apos;s MAC address so other NetCut users on your
        LAN can&apos;t easily cut you. Like NetCut&apos;s &quot;Defend&quot; feature.
      </p>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">
            Free vs NetCut / Arcai Router
          </h3>
          <p className="text-xs text-slate-500 mt-1">What you get without paying</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2 text-left text-slate-600 dark:text-slate-400">Feature</th>
                <th className="px-4 py-2 text-center">NetCut</th>
                <th className="px-4 py-2 text-center">Arcai</th>
                <th className="px-4 py-2 text-center text-blue-600 dark:text-blue-400">You (Free)</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.name} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 text-slate-800 dark:text-slate-200">{f.name}</td>
                  <td className="px-4 py-2 text-center">
                    {f.netcut === true ? (
                      <Check className="w-4 h-4 text-green-500 mx-auto" />
                    ) : f.netcut === false ? (
                      <X className="w-4 h-4 text-red-400 mx-auto" />
                    ) : (
                      <span className="text-xs">{String(f.netcut)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {f.arcai === true ? (
                      <Check className="w-4 h-4 text-green-500 mx-auto" />
                    ) : f.arcai === false ? (
                      <X className="w-4 h-4 text-red-400 mx-auto" />
                    ) : (
                      <span className="text-xs">{String(f.arcai)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center font-medium">
                    {f.us === true ? (
                      <Check className="w-4 h-4 text-blue-500 mx-auto" />
                    ) : (
                      <span className="text-xs text-blue-600 dark:text-blue-400">{String(f.us)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SettingsPanel />
        <DiagnosticsPanel />
      </div>

      <CutTroubleshootingPanel />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GroupsPanel devices={devices} onDevicesChange={onDevicesChange} />
        <div className="space-y-4">
          <AuditLogPanel />
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Activity Timeline</h3>
            <AuditTimeline />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RemoteControlPanel />
        <RulesPanel devices={devices} />
      </div>

      <GamePresetsPanel
        devices={devices}
        device={presetDevice}
        onDeviceChange={(mac) => onSelectedDeviceMacChange?.(mac)}
        portBlock={presetPortBlock}
        onPortBlockChange={onHealthRefresh}
      />

      <div className="flex flex-wrap gap-3">
        <button
          onClick={exportSettings}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
        >
          <Download className="w-4 h-4" />
          Export settings
        </button>
        <button
          onClick={importSettings}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
        >
          <Upload className="w-4 h-4" />
          Import settings
        </button>
      </div>

      <SchedulePanel devices={devices} />

      <ConfirmModal
        open={confirmAction === 'cutAll'}
        title="Cut all devices?"
        danger
        requireText="CUT"
        confirmLabel="Cut all"
        message={
          <>
            <p>
              Cut <strong>{cutTargetCount}</strong> device{cutTargetCount === 1 ? '' : 's'} from the network
              (your PC is excluded).
            </p>
            <p className="text-xs text-slate-500 mt-2">You can undo within 5 seconds after confirming.</p>
          </>
        }
        onConfirm={cutAll}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={confirmAction === 'restoreAll'}
        title="Restore all devices?"
        confirmLabel="Restore all"
        message={
          <p>Restore internet access for every device currently cut on this network?</p>
        }
        onConfirm={restoreAll}
        onCancel={() => setConfirmAction(null)}
      />

      {health && (
        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-900 rounded-lg p-3">
          Platform: {health.platform} · Python: {health.checks.python || 'missing'} · Scapy:{' '}
          {health.checks.scapy ? 'yes' : 'no'} · Admin: {health.checks.isAdmin ? 'yes' : 'no'} ·
          Active cuts: {health.activeCuts}
        </div>
      )}
    </div>
  );
}
