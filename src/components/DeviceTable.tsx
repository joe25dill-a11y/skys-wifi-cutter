import React, { useState } from 'react';
import {
  Smartphone,
  Tv,
  Laptop,
  Speaker,
  Gamepad2,
  HelpCircle,
  Gauge,
  Printer,
  Router,
  Zap,
  Scissors,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Pencil,
  Camera,
  ArrowUp,
  ArrowDown,
  X,
  Star
} from 'lucide-react';
import { Device, DeviceBandwidth } from '../types/device';
import { SpeedControl } from './SpeedControl';
import { LagControl } from './LagControl';

interface DeviceTableProps {
  devices: Device[];
  onToggleDevice: (mac: string) => Promise<void>;
  onLimitSpeed: (mac: string, uploadKbps: number, downloadKbps: number) => Promise<void>;
  onLagControl: (
    mac: string,
    outgoingMs: number,
    incomingMs: number,
    uploadKbps?: number,
    downloadKbps?: number
  ) => Promise<void>;
  onRemoveLag: (mac: string) => Promise<void>;
  onLagSpike: (mac: string, durationMs: number) => Promise<void>;
  onGhostPulse?: (mac: string) => Promise<void>;
  onRename?: (mac: string, name: string) => Promise<void>;
  searchQuery: string;
  localMac?: string;
  deviceBandwidth?: DeviceBandwidth[];
  limitedMacs?: Set<string>;
  lagMacs?: Set<string>;
  dnsMacs?: Set<string>;
  portBlockMacs?: Set<string>;
  oneWayMacs?: Set<string>;
  cutReady?: boolean;
  viewMode?: 'grid' | 'list';
  compact?: boolean;
  onDeviceClick?: (device: Device) => void;
  multiSelect?: boolean;
  selectedMacs?: Set<string>;
  onSelectMac?: (mac: string) => void;
}

const getDeviceIcon = (type: string) => {
  switch (type) {
    case 'phone':
      return <Smartphone className="w-6 h-6" />;
    case 'tv':
      return <Tv className="w-6 h-6" />;
    case 'laptop':
      return <Laptop className="w-6 h-6" />;
    case 'iot':
      return <Speaker className="w-6 h-6" />;
    case 'console':
      return <Gamepad2 className="w-6 h-6" />;
    case 'printer':
      return <Printer className="w-6 h-6" />;
    case 'router':
      return <Router className="w-6 h-6" />;
    case 'camera':
      return <Camera className="w-6 h-6" />;
    default:
      return <HelpCircle className="w-6 h-6" />;
  }
};

const formatLastSeen = (timestamp: string) => {
  const diffMins = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

const formatMbps = (value: number, status?: string) => {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value <= 0 && status !== 'metering' && status !== 'live') return '—';
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toFixed(2);
};

function RenameModal({
  device,
  onClose,
  onSave
}: {
  device: Device;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(device.name);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">Rename device</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border dark:bg-slate-700 dark:border-slate-600 mb-4"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export const DeviceTable: React.FC<DeviceTableProps> = ({
  devices,
  onToggleDevice,
  onLimitSpeed,
  onLagControl,
  onRemoveLag,
  onLagSpike,
  onGhostPulse,
  onRename,
  searchQuery,
  localMac,
  deviceBandwidth = [],
  limitedMacs = new Set(),
  lagMacs = new Set(),
  dnsMacs = new Set(),
  portBlockMacs = new Set(),
  oneWayMacs = new Set(),
  cutReady = true,
  viewMode = 'grid',
  compact = false,
  onDeviceClick,
  multiSelect = false,
  selectedMacs = new Set(),
  onSelectMac
}) => {
  const [togglingMac, setTogglingMac] = useState<string | null>(null);
  const [speedControlDevice, setSpeedControlDevice] = useState<Device | null>(null);
  const [lagControlDevice, setLagControlDevice] = useState<Device | null>(null);
  const [renameDevice, setRenameDevice] = useState<Device | null>(null);
  const [expandedMac, setExpandedMac] = useState<string | null>(null);

  const bandwidthByMac = new Map(
    deviceBandwidth.map((d) => [d.mac.toUpperCase(), d])
  );

  const filteredDevices = devices.filter((device) => {
    const query = searchQuery.toLowerCase();
    return (
      device.name.toLowerCase().includes(query) ||
      device.ip_address.toLowerCase().includes(query) ||
      device.mac_address.toLowerCase().includes(query) ||
      (device.manufacturer || '').toLowerCase().includes(query) ||
      (device.hostname || '').toLowerCase().includes(query)
    );
  });

  const handleCutToggle = async (device: Device) => {
    if (localMac && device.mac_address === localMac) {
      return;
    }

    setTogglingMac(device.mac_address);
    try {
      await onToggleDevice(device.mac_address);
    } finally {
      setTogglingMac(null);
    }
  };

  return (
    <div className={compact ? 'p-2 sm:p-3' : 'p-4 sm:p-6'}>
      {viewMode === 'list' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b dark:border-slate-700">
                {multiSelect && <th className="pb-3 pr-2 w-8" />}
                <th className="pb-3 pr-4">Device</th>
                <th className="pb-3 pr-4">IP</th>
                <th className="pb-3 pr-4">↑ Mbps</th>
                <th className="pb-3 pr-4">↓ Mbps</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((device) => {
                const bw = bandwidthByMac.get(device.mac_address.toUpperCase());
                const isBlocked = device.status === 'blocked';
                const isDns = dnsMacs.has(device.mac_address.toUpperCase()) || device.dns_blocked;
                const isPort = portBlockMacs.has(device.mac_address.toUpperCase());
                const isOneWay = oneWayMacs.has(device.mac_address.toUpperCase());
                return (
                  <tr
                    key={device.mac_address}
                    onClick={() => onDeviceClick?.(device)}
                    className={`border-b dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                      device.is_online === false ? 'opacity-50' : ''
                    } ${selectedMacs.has(device.mac_address) ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''}`}
                  >
                    {multiSelect && (
                      <td className="py-3 pr-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedMacs.has(device.mac_address)}
                          onChange={() => onSelectMac?.(device.mac_address)}
                        />
                      </td>
                    )}
                    <td className="py-3 pr-4 font-medium">
                      <span className="flex items-center gap-1">
                        {device.is_favorite && (
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                        )}
                        {device.name}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{device.ip_address}</td>
                    <td className="py-3 pr-4 text-blue-600">
                      {formatMbps(bw?.upload ?? 0, bw?.status)}
                    </td>
                    <td className="py-3 pr-4 text-green-600">
                      {formatMbps(bw?.download ?? 0, bw?.status)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {bw?.status === 'metering' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white">
                            METER
                          </span>
                        )}
                        {bw?.status === 'live' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                            LIVE
                          </span>
                        )}
                        {isBlocked ? (
                          <span className="text-red-600">CUT</span>
                        ) : device.is_online === false ? (
                          'Offline'
                        ) : (
                          'Online'
                        )}
                        {isDns && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600 text-white">DNS</span>
                        )}
                        {isPort && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-600 text-white">PORT</span>
                        )}
                        {isOneWay && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-600 text-white">1WAY</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleCutToggle(device)}
                        disabled={!cutReady}
                        className="text-xs px-2 py-1 rounded-lg bg-red-600 text-white mr-1 disabled:opacity-40"
                      >
                        {isBlocked ? 'Restore' : 'Cut'}
                      </button>
                      <button
                        onClick={() => setSpeedControlDevice(device)}
                        className="text-xs px-2 py-1 rounded-lg border"
                      >
                        Speed
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filteredDevices.map((device) => {
          const isBlocked = device.status === 'blocked';
          const isSelf = localMac === device.mac_address;
          const isBusy = togglingMac === device.mac_address;
          const isExpanded = expandedMac === device.mac_address;
          const isLimited = limitedMacs.has(device.mac_address);
          const isLag = lagMacs.has(device.mac_address);
          const isDns = dnsMacs.has(device.mac_address.toUpperCase()) || device.dns_blocked;
          const isPort = portBlockMacs.has(device.mac_address.toUpperCase());
          const isOneWay = oneWayMacs.has(device.mac_address.toUpperCase());
          const bw = bandwidthByMac.get(device.mac_address.toUpperCase());
          const maxBw = Math.max(bw?.upload ?? 0, bw?.download ?? 0, 0.01);

          return (
            <div
              key={device.mac_address}
              onClick={() => onDeviceClick?.(device)}
              className={`rounded-2xl border-2 p-4 transition-all shadow-sm hover:shadow-md cursor-pointer ${
                device.is_online === false ? 'opacity-60' : ''
              } ${
                selectedMacs.has(device.mac_address)
                  ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                  : isBlocked
                  ? 'border-red-400 bg-red-50/60 dark:bg-red-950/25 dark:border-red-700'
                  : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/50'
              }`}
            >
              <div className="flex items-start gap-3">
                {multiSelect && (
                  <input
                    type="checkbox"
                    checked={selectedMacs.has(device.mac_address)}
                    onChange={() => onSelectMac?.(device.mac_address)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2"
                  />
                )}
                <div
                  className={`flex-shrink-0 h-14 w-14 flex items-center justify-center rounded-2xl ${
                    isBlocked
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                      : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 dark:from-slate-800 dark:to-slate-700 dark:text-slate-300'
                  }`}
                >
                  {getDeviceIcon(device.device_type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate text-lg">
                      {device.is_favorite && (
                        <Star className="w-3.5 h-3.5 inline mr-1 fill-amber-400 text-amber-400" />
                      )}
                      {device.name}
                    </h3>
                    {onRename && (
                      <button
                        onClick={() => setRenameDevice(device)}
                        className="p-1 text-slate-400 hover:text-blue-500"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isSelf && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">
                        This PC
                      </span>
                    )}
                    {isBlocked && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-bold">
                        CUT
                      </span>
                    )}
                    {isLimited && !isBlocked && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold">
                        LIMITED
                      </span>
                    )}
                    {isLag && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-600 text-white font-bold">
                        LAG
                      </span>
                    )}
                    {bw?.status === 'metering' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold">
                        METER
                      </span>
                    )}
                    {bw?.status === 'live' && !bw?.isMetering && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold">
                        LIVE
                      </span>
                    )}
                    {isDns && !isBlocked && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-600 text-white font-bold">
                        DNS
                      </span>
                    )}
                    {isPort && !isBlocked && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-600 text-white font-bold">
                        PORT
                      </span>
                    )}
                    {isOneWay && !isBlocked && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-600 text-white font-bold">
                        1WAY
                      </span>
                    )}
                    {device.open_ports && device.open_ports.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-600 text-white">
                        {device.open_ports.length} ports
                      </span>
                    )}
                    {device.is_online === false && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500 text-white">
                        OFFLINE
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-mono mt-0.5">
                    {device.ip_address}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">{device.mac_address}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 capitalize">
                    {device.manufacturer || 'Unknown'} · {device.device_type} ·{' '}
                    {formatLastSeen(device.last_seen)}
                  </p>

                  {bw && !isSelf && (
                    <div className="mt-2">
                      <div className="flex gap-4 text-xs font-medium mb-1">
                        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          <ArrowUp className="w-3 h-3" />
                          {formatMbps(bw.upload, bw.status)} Mbps
                        </span>
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <ArrowDown className="w-3 h-3" />
                          {formatMbps(bw.download, bw.status)} Mbps
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (maxBw / 50) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                {isBlocked ? (
                  <button
                    onClick={() => handleCutToggle(device)}
                    disabled={isBusy || isSelf}
                    className="col-span-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white shadow-lg transition-colors"
                  >
                    <RotateCcw className={`w-5 h-5 ${isBusy ? 'animate-spin' : ''}`} />
                    {isBusy ? 'Restoring…' : 'Restore'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleCutToggle(device)}
                      disabled={isBusy || isSelf || !cutReady}
                      className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-bold bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white shadow transition-colors"
                    >
                      <Scissors className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                      Cut
                    </button>
                    <button
                      onClick={() => setSpeedControlDevice(device)}
                      disabled={isSelf}
                      className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-semibold border-2 border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                    >
                      <Gauge className="w-4 h-4" />
                      Speed
                    </button>
                  </>
                )}
              </div>

              {isSelf && (
                <p className="text-xs text-center text-slate-500 mt-2">You cannot cut your own PC</p>
              )}

              <button
                onClick={() => setExpandedMac(isExpanded ? null : device.mac_address)}
                className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-1"
              >
                {isExpanded ? (
                  <>
                    Hide lag tools <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    Lag tools <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </button>

              {isExpanded && (
                <button
                  onClick={() => setLagControlDevice(device)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 px-3 text-sm rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Zap className="w-4 h-4" />
                  Lag control
                </button>
              )}
            </div>
          );
        })}
      </div>
      )}

      {filteredDevices.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500 dark:text-slate-400">No devices match your search.</p>
        </div>
      )}

      {speedControlDevice && (
        <SpeedControl
          device={speedControlDevice}
          onClose={() => setSpeedControlDevice(null)}
          onApply={onLimitSpeed}
          isLimited={limitedMacs.has(speedControlDevice.mac_address)}
        />
      )}

      {lagControlDevice && (
        <LagControl
          device={lagControlDevice}
          onClose={() => setLagControlDevice(null)}
          onApply={onLagControl}
          onRemove={onRemoveLag}
          onLagSpike={onLagSpike}
          onGhostPulse={onGhostPulse}
        />
      )}

      {renameDevice && onRename && (
        <RenameModal
          device={renameDevice}
          onClose={() => setRenameDevice(null)}
          onSave={(name) => onRename(renameDevice.mac_address, name)}
        />
      )}
    </div>
  );
};
