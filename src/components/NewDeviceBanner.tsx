import { useState } from 'react';
import { Device } from '../types/device';
import { AlertTriangle, Shield, ShieldOff, X } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface NewDeviceBannerProps {
  devices: Device[];
  onAllow: (mac: string) => void;
  onBlock: (mac: string) => void;
  onDismiss: (mac: string) => void;
  onDismissAll: () => void;
}

export function NewDeviceBanner({
  devices,
  onAllow,
  onBlock,
  onDismiss,
  onDismissAll
}: NewDeviceBannerProps) {
  const [cutTarget, setCutTarget] = useState<Device | null>(null);

  if (devices.length === 0) return null;

  const confirmCut = async () => {
    if (!cutTarget) return;
    await onBlock(cutTarget.mac_address);
    setCutTarget(null);
  };

  return (
    <>
    <div className="mb-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex gap-2 text-amber-900 dark:text-amber-100">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">New device{devices.length > 1 ? 's' : ''} on your network</p>
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
              Only block devices you do not recognize on a network you own.
            </p>
          </div>
        </div>
        <button
          onClick={onDismissAll}
          className="p-1 text-amber-600 hover:text-amber-800 dark:text-amber-300"
          title="Dismiss all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul className="space-y-2">
        {devices.slice(0, 5).map((device) => (
          <li
            key={device.mac_address}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/60 dark:bg-slate-900/50 px-3 py-2"
          >
            <div>
              <p className="font-medium text-slate-900 dark:text-white">{device.name}</p>
              <p className="text-xs text-slate-500 font-mono">
                {device.ip_address} · {device.mac_address}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onAllow(device.mac_address)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium"
              >
                <Shield className="w-3.5 h-3.5" />
                Allow
              </button>
              <button
                onClick={() => setCutTarget(device)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium"
              >
                <ShieldOff className="w-3.5 h-3.5" />
                Cut
              </button>
              <button
                onClick={() => onDismiss(device.mac_address)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs"
              >
                Ignore
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>

      <ConfirmModal
        open={Boolean(cutTarget)}
        title="Cut unknown device?"
        danger
        confirmLabel="Cut device"
        message={
          cutTarget ? (
            <>
              <p>
                Cut <strong>{cutTarget.name}</strong> ({cutTarget.ip_address}) from the network?
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Only cut devices you do not recognize on a network you own.
              </p>
            </>
          ) : null
        }
        onConfirm={confirmCut}
        onCancel={() => setCutTarget(null)}
      />
    </>
  );
}
