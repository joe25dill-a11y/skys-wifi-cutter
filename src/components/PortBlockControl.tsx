import { useState } from 'react';
import { Shield, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Device } from '../types/device';

const PRESETS = [
  { id: 'xbox', label: 'Xbox Live' },
  { id: 'psn', label: 'PlayStation Network' },
  { id: 'fortnite', label: 'Fortnite / Epic' },
  { id: 'minecraft', label: 'Minecraft' },
  { id: 'discord', label: 'Discord voice' },
  { id: 'roblox', label: 'Roblox' }
];

interface PortBlockControlProps {
  device: Device;
  isActive?: boolean;
  onClose: () => void;
  onApply: (mac: string, preset: string, customPorts: number[]) => Promise<void>;
  onRemove: (mac: string) => Promise<void>;
}

export function PortBlockControl({
  device,
  isActive = false,
  onClose,
  onApply,
  onRemove
}: PortBlockControlProps) {
  const [preset, setPreset] = useState('xbox');
  const [customPorts, setCustomPorts] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleApply = async () => {
    setBusy(true);
    try {
      const ports = useCustom
        ? customPorts
            .split(/[,\s]+/)
            .map((p) => Number(p.trim()))
            .filter((p) => p > 0 && p <= 65535)
        : [];

      await onApply(device.mac_address, useCustom ? 'custom' : preset, ports);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Port block failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await onRemove(device.mac_address);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove port block');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-violet-600" />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Port Blocker</h3>
              <p className="text-xs text-slate-500">{device.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            MITM blocks specific TCP/UDP ports on this device — great for gaming (block Xbox ports on a
            sibling&apos;s console, etc.). Run as Administrator.
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
            Custom port list
          </label>

          {useCustom ? (
            <input
              value={customPorts}
              onChange={(e) => setCustomPorts(e.target.value)}
              placeholder="3074, 3075, 53"
              className="w-full px-3 py-2 rounded-xl border dark:bg-slate-700 dark:border-slate-600 font-mono text-sm"
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPreset(item.id)}
                  className={`px-3 py-2 rounded-xl text-sm border text-left ${
                    preset === item.id
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {isActive && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Port block is active on this device — applying again replaces the rule set.
            </p>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 dark:border-slate-700 flex gap-2">
          {isActive && (
            <button
              onClick={handleRemove}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 disabled:opacity-50"
            >
              Remove block
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-medium disabled:opacity-50"
          >
            {busy ? 'Applying…' : isActive ? 'Update block' : 'Block ports'}
          </button>
        </div>
      </div>
    </div>
  );
}
