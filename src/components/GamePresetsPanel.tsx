import { useEffect, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch, encodeMac } from '../config/api';
import { Device } from '../types/device';

interface GamePreset {
  id: string;
  label: string;
  description: string;
  portCount: number;
  lagMs: number;
}

interface GamePresetsPanelProps {
  device: Device | null;
}

export function GamePresetsPanel({ device }: GamePresetsPanelProps) {
  const [presets, setPresets] = useState<GamePreset[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ presets: GamePreset[] }>('/game-presets')
      .then((d) => setPresets(d.presets))
      .catch(() => null);
  }, []);

  const apply = async (presetId: string) => {
    if (!device) {
      toast.error('Select a device first');
      return;
    }
    setLoading(presetId);
    try {
      const result = await apiFetch<{ message: string }>(
        `/devices/${encodeMac(device.mac_address)}/game-preset`,
        {
          method: 'POST',
          body: JSON.stringify({ presetId })
        }
      );
      toast.success(result.message || 'Game preset applied');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preset failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Gamepad2 className="w-5 h-5 text-purple-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Game Presets</h3>
      </div>
      {!device ? (
        <p className="text-sm text-slate-500">Click a device, then apply a gaming port-block profile.</p>
      ) : (
        <p className="text-xs text-slate-500 mb-3">
          Target: <strong>{device.name}</strong> ({device.ip_address})
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => apply(p.id)}
            disabled={!device || loading === p.id}
            className="text-left p-3 rounded-lg border border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50"
          >
            <div className="font-semibold text-sm text-slate-900 dark:text-white">{p.label}</div>
            <div className="text-xs text-slate-500">{p.portCount} ports · {p.lagMs}ms lag hint</div>
          </button>
        ))}
      </div>
    </div>
  );
}
