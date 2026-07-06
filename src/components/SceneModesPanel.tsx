import { useEffect, useState } from 'react';
import { Sparkles, Target, BookOpen, Gamepad2, Wifi, Heart } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';
import { Device } from '../types/device';
import { ConfirmModal } from './ConfirmModal';

interface Scene {
  id: string;
  label: string;
  description: string;
}

const ICONS: Record<string, JSX.Element> = {
  focus: <Target className="w-5 h-5 text-red-500" />,
  peace: <Heart className="w-5 h-5 text-emerald-500" />,
  homework: <BookOpen className="w-5 h-5 text-amber-500" />,
  gaming_host: <Gamepad2 className="w-5 h-5 text-purple-500" />,
  guest_cap: <Wifi className="w-5 h-5 text-sky-500" />
};

interface SceneModesPanelProps {
  devices: Device[];
  onDevicesChange?: (devices: Device[]) => void;
  onHealthRefresh?: () => void;
}

export function SceneModesPanel({ devices, onDevicesChange, onHealthRefresh }: SceneModesPanelProps) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmScene, setConfirmScene] = useState<Scene | null>(null);
  const [homeworkMacs, setHomeworkMacs] = useState<string[]>([]);

  useEffect(() => {
    apiFetch<{ scenes: Scene[] }>('/scenes')
      .then((d) => setScenes(d.scenes))
      .catch(() => null);
  }, []);

  const apply = async (scene: Scene) => {
    setLoading(scene.id);
    try {
      const body: Record<string, unknown> = {};
      if (scene.id === 'homework') {
        body.macs = homeworkMacs.length > 0 ? homeworkMacs : devices.slice(0, 3).map((d) => d.mac_address);
      }
      const result = await apiFetch<{ message: string; devices?: Device[] }>(`/scenes/${scene.id}/apply`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      toast.success(result.message || `${scene.label} applied`);
      if (result.devices) onDevicesChange?.(result.devices);
      onHealthRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scene failed');
    } finally {
      setLoading(null);
      setConfirmScene(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-violet-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Scene modes</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">One-click network presets for common situations.</p>

      {scenes.some((s) => s.id === 'homework') && (
        <div className="mb-4">
          <label className="text-xs text-slate-500 block mb-1">Homework — block social DNS on:</label>
          <select
            multiple
            value={homeworkMacs}
            onChange={(e) =>
              setHomeworkMacs(Array.from(e.target.selectedOptions, (o) => o.value))
            }
            className="w-full min-h-[72px] px-2 py-2 text-xs rounded-lg border dark:bg-slate-700"
          >
            {devices.map((d) => (
              <option key={d.mac_address} value={d.mac_address}>
                {d.name} — {d.ip_address}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400 mt-1">Hold Ctrl to pick multiple. Empty = first 3 devices.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {scenes.map((scene) => (
          <button
            key={scene.id}
            onClick={() => setConfirmScene(scene)}
            disabled={loading === scene.id}
            className="text-left p-3 rounded-xl border border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50"
          >
            <div className="flex items-center gap-2 mb-1">
              {ICONS[scene.id] || <Sparkles className="w-5 h-5" />}
              <span className="font-semibold text-sm text-slate-900 dark:text-white">{scene.label}</span>
            </div>
            <p className="text-xs text-slate-500">{scene.description}</p>
          </button>
        ))}
      </div>

      <ConfirmModal
        open={Boolean(confirmScene)}
        title={confirmScene ? `Apply ${confirmScene.label}?` : ''}
        danger={confirmScene?.id === 'focus'}
        confirmLabel="Apply scene"
        message={confirmScene ? <p>{confirmScene.description}</p> : null}
        onConfirm={() => {
          if (confirmScene) void apply(confirmScene);
        }}
        onCancel={() => setConfirmScene(null)}
      />
    </div>
  );
}
