import { useEffect, useState } from 'react';
import { Gamepad2, ShieldOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch, encodeMac } from '../config/api';
import { Device } from '../types/device';
import { ConfirmModal } from './ConfirmModal';

interface GamePreset {
  id: string;
  label: string;
  description: string;
  portCount: number;
  lagMs: number;
}

interface PortBlockInfo {
  mac: string;
  ports: number[];
  preset?: string;
  label?: string;
}

interface GamePresetsPanelProps {
  devices: Device[];
  device: Device | null;
  onDeviceChange: (mac: string) => void;
  portBlock?: PortBlockInfo | null;
  onPortBlockChange?: () => void;
}

export function GamePresetsPanel({
  devices,
  device,
  onDeviceChange,
  portBlock,
  onPortBlockChange
}: GamePresetsPanelProps) {
  const [presets, setPresets] = useState<GamePreset[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [useLag, setUseLag] = useState(false);
  const [confirmApply, setConfirmApply] = useState<GamePreset | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    apiFetch<{ presets: GamePreset[] }>('/game-presets')
      .then((d) => setPresets(d.presets))
      .catch(() => null);
  }, []);

  const applyPreset = async (preset: GamePreset) => {
    if (!device) return;
    setLoading(preset.id);
    try {
      const result = await apiFetch<{ message: string }>(
        `/devices/${encodeMac(device.mac_address)}/game-preset`,
        {
          method: 'POST',
          body: JSON.stringify({ presetId: preset.id, applyLag: useLag })
        }
      );
      toast.success(result.message || 'Game preset applied');
      onPortBlockChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preset failed');
    } finally {
      setLoading(null);
      setConfirmApply(null);
    }
  };

  const removeBlock = async () => {
    if (!device) return;
    setLoading('remove');
    try {
      const result = await apiFetch<{ message: string }>(
        `/devices/${encodeMac(device.mac_address)}/port-unblock`,
        { method: 'POST' }
      );
      toast.success(result.message || 'Port block removed');
      onPortBlockChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setLoading(null);
      setConfirmRemove(false);
    }
  };

  const isBlocked = Boolean(device && portBlock);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Gamepad2 className="w-5 h-5 text-purple-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Game Presets</h3>
      </div>

      <div className="mb-3">
        <label className="text-xs text-slate-500 block mb-1">Target device</label>
        <select
          value={device?.mac_address ?? ''}
          onChange={(e) => onDeviceChange(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border dark:bg-slate-700 dark:border-slate-600"
        >
          <option value="">Select a device…</option>
          {devices.map((d) => (
            <option key={d.mac_address} value={d.mac_address}>
              {d.name} — {d.ip_address}
            </option>
          ))}
        </select>
      </div>

      {device && isBlocked && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm">
          <div className="text-amber-800 dark:text-amber-200">
            <strong>Port block active</strong>
            {portBlock?.label && ` — ${portBlock.label}`}
            {portBlock?.ports?.length ? ` (${portBlock.ports.length} ports)` : ''}
          </div>
          <button
            onClick={() => setConfirmRemove(true)}
            disabled={loading === 'remove'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400 text-amber-800 dark:text-amber-200 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            Remove block
          </button>
        </div>
      )}

      {!device && (
        <p className="text-sm text-slate-500 mb-3">
          Pick a device above, then apply a gaming port-block profile.
        </p>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-500 mb-3">
        <input type="checkbox" checked={useLag} onChange={(e) => setUseLag(e.target.checked)} />
        Use lag switch instead of port block (uses preset lag hint)
      </label>

      <div className="grid grid-cols-2 gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              if (!device) {
                toast.error('Select a device first');
                return;
              }
              setConfirmApply(p);
            }}
            disabled={!device || loading === p.id}
            className="text-left p-3 rounded-lg border border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50"
          >
            <div className="font-semibold text-sm text-slate-900 dark:text-white">{p.label}</div>
            <div className="text-xs text-slate-500">
              {useLag ? `${p.lagMs}ms lag` : `${p.portCount} ports`}
              {!useLag && ` · ${p.lagMs}ms lag hint`}
            </div>
          </button>
        ))}
      </div>

      <ConfirmModal
        open={Boolean(confirmApply && device)}
        title="Apply game preset?"
        confirmLabel="Apply"
        message={
          confirmApply && device ? (
            <p>
              {useLag
                ? `Apply ${confirmApply.lagMs}ms lag to ${device.name}?`
                : `Block ${confirmApply.label} ports on ${device.name}?`}
            </p>
          ) : null
        }
        onConfirm={() => {
          if (confirmApply) void applyPreset(confirmApply);
        }}
        onCancel={() => setConfirmApply(null)}
      />
      <ConfirmModal
        open={confirmRemove && Boolean(device)}
        title="Remove port block?"
        danger
        confirmLabel="Remove"
        message={device ? <p>Remove port block from {device.name}?</p> : null}
        onConfirm={removeBlock}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
