import { useState } from 'react';
import { Globe, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Device } from '../types/device';

const PRESETS = [
  { id: 'full', label: 'Full DNS lock' },
  { id: 'social', label: 'Social media' },
  { id: 'gaming', label: 'Online gaming' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'adult', label: 'Adult content' }
];

interface DnsBlockControlProps {
  device: Device;
  isActive?: boolean;
  activeLabel?: string;
  onClose: () => void;
  onApply: (mac: string, preset: string, domains: string[]) => Promise<void>;
  onRemove: (mac: string) => Promise<void>;
}

export function DnsBlockControl({
  device,
  isActive = false,
  activeLabel,
  onClose,
  onApply,
  onRemove
}: DnsBlockControlProps) {
  const [preset, setPreset] = useState('full');
  const [customDomains, setCustomDomains] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleApply = async () => {
    setBusy(true);
    try {
      const domains = useCustom
        ? customDomains
            .split(/[,\s]+/)
            .map((d) => d.trim().toLowerCase())
            .filter(Boolean)
        : [];

      await onApply(device.mac_address, useCustom ? 'custom' : preset, domains);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'DNS block failed');
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
      toast.error(err instanceof Error ? err.message : 'Failed to remove DNS block');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-600" />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">DNS Blocker</h3>
              <p className="text-xs text-slate-500">{device.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Block DNS lookups on this device. <strong>Full lock</strong> stops all browsing. Presets
            block only matching sites — other traffic still works. Run as Administrator.
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
            Custom domain list
          </label>

          {useCustom ? (
            <textarea
              value={customDomains}
              onChange={(e) => setCustomDomains(e.target.value)}
              placeholder="facebook.com, tiktok.com"
              rows={3}
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
                      ? 'bg-cyan-600 text-white border-cyan-600'
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
              Active: {activeLabel || 'DNS block'} — applying again replaces the rule.
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
            className="flex-1 py-2.5 rounded-xl bg-cyan-600 text-white font-medium disabled:opacity-50"
          >
            {busy ? 'Applying…' : isActive ? 'Update block' : 'Apply DNS block'}
          </button>
        </div>
      </div>
    </div>
  );
}
