import { useState } from 'react';
import {
  X,
  Copy,
  Scissors,
  Gauge,
  Zap,
  ArrowUp,
  ArrowDown,
  StickyNote
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Device, DeviceBandwidth } from '../types/device';

interface DeviceDetailProps {
  device: Device;
  bandwidth?: DeviceBandwidth;
  isLimited?: boolean;
  isLagActive?: boolean;
  localMac?: string;
  onClose: () => void;
  onCut: () => Promise<void>;
  onSpeed: () => void;
  onLag: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
}

function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

export function DeviceDetail({
  device,
  bandwidth,
  isLimited,
  isLagActive,
  localMac,
  onClose,
  onCut,
  onSpeed,
  onLag,
  onSaveNotes
}: DeviceDetailProps) {
  const [notes, setNotes] = useState(device.notes ?? '');
  const [saving, setSaving] = useState(false);
  const isSelf = localMac === device.mac_address;
  const isBlocked = device.status === 'blocked';

  const saveNotes = async () => {
    setSaving(true);
    try {
      await onSaveNotes(notes);
      toast.success('Notes saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col animate-slide-in">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{device.name}</h2>
            <p className="text-sm text-slate-500 capitalize">{device.device_type} · {device.manufacturer}</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              {!device.is_online && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700">Offline</span>
              )}
              {isBlocked && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-bold">CUT</span>
              )}
              {isLimited && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white">LIMITED</span>
              )}
              {isLagActive && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-600 text-white">LAG</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {bandwidth && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 p-4 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-600 flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" /> Upload
                </p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {bandwidth.upload.toFixed(2)}
                </p>
                <p className="text-xs text-slate-500">Mbps</p>
              </div>
              <div className="rounded-xl bg-green-50 dark:bg-green-950/40 p-4 border border-green-200 dark:border-green-800">
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <ArrowDown className="w-3 h-3" /> Download
                </p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {bandwidth.download.toFixed(2)}
                </p>
                <p className="text-xs text-slate-500">Mbps</p>
              </div>
            </div>
          )}

          <div className="space-y-2 text-sm">
            {[
              ['IP', device.ip_address],
              ['MAC', device.mac_address],
              ['Hostname', device.hostname || '—'],
              ['Last seen', new Date(device.last_seen).toLocaleString()]
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800"
              >
                <span className="text-slate-500">{label}</span>
                <button
                  onClick={() => copyText(String(value), label)}
                  className="font-mono text-slate-800 dark:text-slate-200 flex items-center gap-1 hover:text-blue-600"
                >
                  {value}
                  <Copy className="w-3 h-3 opacity-50" />
                </button>
              </div>
            ))}
          </div>

          {device.open_ports && device.open_ports.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Open ports (deep scan)</p>
              <div className="flex flex-wrap gap-2">
                {device.open_ports.map((p) => (
                  <span
                    key={p.port}
                    className="text-xs px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono"
                  >
                    {p.port} {p.service}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-2">
              <StickyNote className="w-3.5 h-3.5" /> Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-xl border dark:bg-slate-800 dark:border-slate-700 p-3 text-sm"
              placeholder="Kids room Xbox, guest phone…"
            />
            <button
              onClick={saveNotes}
              disabled={saving}
              className="mt-2 text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save notes'}
            </button>
          </div>
        </div>

        {!isSelf && (
          <div className="p-5 border-t border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-2">
            <button
              onClick={onCut}
              className={`py-3 rounded-xl font-semibold text-sm flex flex-col items-center gap-1 ${
                isBlocked ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
              }`}
            >
              <Scissors className="w-4 h-4" />
              {isBlocked ? 'Restore' : 'Cut'}
            </button>
            <button
              onClick={onSpeed}
              className="py-3 rounded-xl font-semibold text-sm border-2 border-amber-400 text-amber-700 dark:text-amber-300 flex flex-col items-center gap-1"
            >
              <Gauge className="w-4 h-4" />
              Speed
            </button>
            <button
              onClick={onLag}
              className="py-3 rounded-xl font-semibold text-sm border-2 border-purple-400 text-purple-700 dark:text-purple-300 flex flex-col items-center gap-1"
            >
              <Zap className="w-4 h-4" />
              Lag
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
