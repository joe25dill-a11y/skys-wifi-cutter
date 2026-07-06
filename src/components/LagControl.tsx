import React, { useEffect, useState } from 'react';
import { Zap, X, Play, Square, Ghost, ArrowDown, ArrowUp, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { Device } from '../types/device';

interface ActiveLag {
  outgoingMs?: number;
  incomingMs?: number;
}

interface LagControlProps {
  device: Device;
  activeLag?: ActiveLag | null;
  onClose: () => void;
  onApply: (
    mac: string,
    outgoingMs: number,
    incomingMs: number,
    uploadKbps?: number,
    downloadKbps?: number
  ) => Promise<void>;
  onRemove: (mac: string) => Promise<void>;
  onLagSpike: (mac: string, durationMs: number) => Promise<void>;
  onGhostPulse?: (
    mac: string,
    params?: { incomingMs: number; freezeMs: number; count: number }
  ) => Promise<void>;
}

const PRESETS = [
  {
    id: 'ghost',
    label: 'Ghost / DayZ',
    desc: 'High incoming lag — desync-style bursts',
    outgoingMs: 0,
    incomingMs: 1200
  },
  {
    id: 'xbox',
    label: 'Xbox lag',
    desc: 'Outgoing choke for console tests',
    outgoingMs: 800,
    incomingMs: 0
  },
  {
    id: 'full',
    label: 'Full lag',
    desc: 'Both directions',
    outgoingMs: 500,
    incomingMs: 500
  }
];

export const LagControl: React.FC<LagControlProps> = ({
  device,
  activeLag,
  onClose,
  onApply,
  onRemove,
  onLagSpike,
  onGhostPulse
}) => {
  const [outgoingLag, setOutgoingLag] = useState(0);
  const [incomingLag, setIncomingLag] = useState(1200);
  const [uploadKbps, setUploadKbps] = useState(0);
  const [downloadKbps, setDownloadKbps] = useState(0);
  const [capSpeed, setCapSpeed] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [showCustomGhost, setShowCustomGhost] = useState(false);
  const [ghostIncomingMs, setGhostIncomingMs] = useState(1200);
  const [ghostFreezeMs, setGhostFreezeMs] = useState(250);
  const [ghostCount, setGhostCount] = useState(8);

  useEffect(() => {
    if (activeLag) {
      setIsActive(true);
      if (activeLag.outgoingMs != null) setOutgoingLag(activeLag.outgoingMs);
      if (activeLag.incomingMs != null) setIncomingLag(activeLag.incomingMs);
    } else {
      setIsActive(false);
    }
  }, [activeLag, device.mac_address]);

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await onApply(
        device.mac_address,
        outgoingLag,
        incomingLag,
        capSpeed ? uploadKbps : 0,
        capSpeed ? downloadKbps : 0
      );
      setIsActive(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply lag switch');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemove = async () => {
    setIsApplying(true);
    try {
      await onRemove(device.mac_address);
      setIsActive(false);
      setOutgoingLag(0);
      setIncomingLag(0);
    } catch {
      toast.error('Failed to remove lag switch');
    } finally {
      setIsApplying(false);
    }
  };

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setOutgoingLag(preset.outgoingMs);
    setIncomingLag(preset.incomingMs);
  };

  const handleGhostPulse = async () => {
    const params = showCustomGhost
      ? { incomingMs: ghostIncomingMs, freezeMs: ghostFreezeMs, count: ghostCount }
      : undefined;
    setIsApplying(true);
    try {
      if (onGhostPulse) {
        await onGhostPulse(device.mac_address, params);
      } else {
        await onLagSpike(device.mac_address, params?.incomingMs ?? 1200);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ghost pulse failed');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-2.5 rounded-xl">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Lag Switch</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{device.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {isActive && (
            <div className="rounded-xl border border-purple-400/40 bg-purple-50 dark:bg-purple-950/30 px-3 py-2 text-xs text-purple-800 dark:text-purple-200">
              Lag active — outgoing {outgoingLag}ms · incoming {incomingLag}ms
            </div>
          )}

          <p className="text-sm text-slate-600 dark:text-slate-400">
            NetCut-style lag switch on your LAN. MITM delay on incoming, outgoing, or both. Run as
            Administrator.
          </p>

          <div className="grid grid-cols-1 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="text-left p-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors"
              >
                <p className="font-medium text-slate-900 dark:text-white">{preset.label}</p>
                <p className="text-xs text-slate-500">{preset.desc}</p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1 text-sm font-medium mb-2">
                <ArrowUp className="w-4 h-4 text-blue-500" />
                Outgoing ms
              </label>
              <input
                type="number"
                value={outgoingLag}
                onChange={(e) => setOutgoingLag(Number(e.target.value))}
                min={0}
                max={5000}
                className="w-full px-3 py-2 rounded-xl border dark:bg-slate-700 dark:border-slate-600"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-sm font-medium mb-2">
                <ArrowDown className="w-4 h-4 text-green-500" />
                Incoming ms
              </label>
              <input
                type="number"
                value={incomingLag}
                onChange={(e) => setIncomingLag(Number(e.target.value))}
                min={0}
                max={5000}
                className="w-full px-3 py-2 rounded-xl border dark:bg-slate-700 dark:border-slate-600"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Speed cap during lag (KB/s)</span>
              <button
                onClick={() => setCapSpeed(!capSpeed)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  capSpeed ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    capSpeed ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {capSpeed && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Upload KB/s</label>
                  <input
                    type="number"
                    value={uploadKbps}
                    onChange={(e) => setUploadKbps(Number(e.target.value))}
                    min={0}
                    max={100000}
                    className="w-full px-3 py-2 rounded-xl border dark:bg-slate-700 dark:border-slate-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Download KB/s</label>
                  <input
                    type="number"
                    value={downloadKbps}
                    onChange={(e) => setDownloadKbps(Number(e.target.value))}
                    min={0}
                    max={100000}
                    className="w-full px-3 py-2 rounded-xl border dark:bg-slate-700 dark:border-slate-600"
                  />
                </div>
              </div>
            )}
            <p className="text-xs text-slate-500">
              0 = no cap. Example: 128 KB/s ≈ 1 Mbps choke while lag is active.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleGhostPulse}
              disabled={isApplying}
              className="w-full py-4 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              <Ghost className="w-5 h-5" />
              Ghost Pulse ({showCustomGhost ? ghostCount : 8}x burst)
            </button>
            <button
              type="button"
              onClick={() => setShowCustomGhost(!showCustomGhost)}
              className="w-full flex items-center justify-center gap-1 text-xs text-purple-600 dark:text-purple-300 hover:underline"
            >
              {showCustomGhost ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Custom ghost pulse
            </button>
            {showCustomGhost && (
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl border border-purple-300/40 bg-purple-50/50 dark:bg-purple-950/20">
                <label className="text-xs text-slate-500">
                  Incoming ms
                  <input
                    type="number"
                    value={ghostIncomingMs}
                    onChange={(e) => setGhostIncomingMs(Number(e.target.value))}
                    min={100}
                    max={5000}
                    className="mt-1 w-full px-2 py-1.5 rounded-lg border dark:bg-slate-700 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Freeze ms
                  <input
                    type="number"
                    value={ghostFreezeMs}
                    onChange={(e) => setGhostFreezeMs(Number(e.target.value))}
                    min={50}
                    max={2000}
                    className="mt-1 w-full px-2 py-1.5 rounded-lg border dark:bg-slate-700 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Count
                  <input
                    type="number"
                    value={ghostCount}
                    onChange={(e) => setGhostCount(Number(e.target.value))}
                    min={1}
                    max={20}
                    className="mt-1 w-full px-2 py-1.5 rounded-lg border dark:bg-slate-700 text-sm"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {[200, 500, 1000, 2000].map((ms) => (
              <button
                key={ms}
                onClick={() => onLagSpike(device.mac_address, ms)}
                disabled={isApplying}
                className="flex-1 py-2 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-medium"
              >
                {ms}ms
              </button>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            {isActive ? (
              <button
                onClick={handleRemove}
                disabled={isApplying}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4" />
                Stop lag
              </button>
            ) : (
              <button
                onClick={handleApply}
                disabled={isApplying || (outgoingLag === 0 && incomingLag === 0 && !capSpeed)}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl font-medium flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                {isApplying ? 'Starting…' : 'Start lag switch'}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-6 py-3 border border-slate-300 dark:border-slate-600 rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
