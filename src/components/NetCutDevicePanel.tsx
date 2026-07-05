import { useState, type ReactNode } from 'react';
import {
  X,
  Copy,
  Search,
  Wifi,
  Clock,
  Gamepad2,
  Lock,
  Unlock,
  Timer,
  HelpCircle,
  ToggleLeft,
  Filter,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Star,
  ZapOff,
  ShieldBan,
  Power
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Device, DeviceBandwidth } from '../types/device';

type ControlMode = 'advance' | 'intermediate';

interface NetCutDevicePanelProps {
  device: Device;
  bandwidth?: DeviceBandwidth;
  isMetering?: boolean;
  meterSecondsLeft?: number;
  isFavorite?: boolean;
  isDnsBlocked?: boolean;
  perDeviceActive?: boolean;
  isLimited?: boolean;
  isLagActive?: boolean;
  localMac?: string;
  onClose: () => void;
  onCut: () => Promise<void>;
  onSpeed: () => void;
  onLag: () => void;
  onSchedule: () => void;
  onRetest: () => Promise<void>;
  onFavorite?: (favorite: boolean) => Promise<void>;
  onKick?: () => Promise<void>;
  onDnsBlock?: () => void;
  dnsBlockLabel?: string;
  onPortBlock?: () => void;
  isPortBlocked?: boolean;
  onOneWayKill?: () => Promise<void>;
  isOneWayKill?: boolean;
  onFirewallKill?: () => Promise<void>;
  isFirewallKill?: boolean;
  onWakeOnLan?: () => Promise<void>;
  onSaveNotes?: (notes: string) => Promise<void>;
  cutReady?: boolean;
  onWifi: () => void;
  onDeepScan: () => void;
  onRename: (name: string) => Promise<void>;
}

function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

function brandLabel(manufacturer?: string) {
  const m = (manufacturer || 'unknown').toLowerCase();
  if (m.includes('microsoft')) return { name: 'microsoft', color: 'from-red-500 via-green-500 to-blue-500' };
  if (m.includes('apple')) return { name: 'apple', color: 'from-slate-400 to-slate-600' };
  if (m.includes('samsung')) return { name: 'samsung', color: 'from-blue-600 to-blue-800' };
  if (m.includes('google')) return { name: 'google', color: 'from-red-400 via-yellow-400 to-green-400' };
  return { name: m, color: 'from-slate-500 to-slate-700' };
}

function IconBtn({
  title,
  onClick,
  active,
  children
}: {
  title: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-2.5 rounded-lg transition-all ${
        active
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
          : 'bg-slate-800 text-blue-400 hover:bg-slate-700 hover:text-blue-300 border border-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function formatMbps(value: number | undefined, active: boolean) {
  if (!active && (!value || value <= 0)) return '—';
  if (!value || value <= 0) return '0.00';
  if (value < 0.01) return '<0.01';
  return value.toFixed(2);
}

export function NetCutDevicePanel({
  device,
  bandwidth,
  isMetering,
  meterSecondsLeft = 45,
  isFavorite,
  isDnsBlocked,
  perDeviceActive,
  isLimited,
  isLagActive,
  localMac,
  onClose,
  onCut,
  onSpeed,
  onLag,
  onSchedule,
  onRetest,
  onFavorite,
  onKick,
  onDnsBlock,
  dnsBlockLabel,
  onPortBlock,
  isPortBlocked,
  onOneWayKill,
  isOneWayKill,
  onFirewallKill,
  isFirewallKill,
  onWakeOnLan,
  onSaveNotes,
  cutReady = true,
  onWifi,
  onDeepScan,
  onRename
}: NetCutDevicePanelProps) {
  const [name, setName] = useState(device.name);
  const [notes, setNotes] = useState(device.notes ?? '');
  const [mode, setMode] = useState<ControlMode>('advance');
  const [cutting, setCutting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isSelf = localMac === device.mac_address.toUpperCase();
  const isBlocked = device.status === 'blocked';
  const isOnline = device.is_online !== false;
  const brand = brandLabel(device.manufacturer);

  const saveName = async () => {
    if (name.trim() && name !== device.name) {
      await onRename(name.trim());
    }
  };

  const saveNotes = async () => {
    if (!onSaveNotes) return;
    if (notes === (device.notes ?? '')) return;
    await onSaveNotes(notes);
  };

  const handleRetest = async () => {
    setRefreshing(true);
    try {
      await onRetest();
    } finally {
      setRefreshing(false);
    }
  };

  const bwActive = perDeviceActive || isMetering;

  const handleCut = async () => {
    setCutting(true);
    try {
      await onCut();
    } finally {
      setCutting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl text-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">name</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              className="mt-0.5 w-full bg-transparent text-lg font-semibold text-white border-b border-transparent focus:border-blue-500 outline-none"
            />
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isSelf && (
          <div className="px-4 pt-4 space-y-2">
            <div className="grid grid-cols-6 gap-1.5">
              <IconBtn title="Deep scan / inspect" onClick={onDeepScan}>
                <Search className="w-4 h-4" />
              </IconBtn>
              <IconBtn title="WiFi analyzer" onClick={onWifi}>
                <Wifi className="w-4 h-4" />
              </IconBtn>
              <IconBtn title="Schedule cut/restore" onClick={onSchedule}>
                <Clock className="w-4 h-4" />
              </IconBtn>
              <IconBtn title="Lag / gaming (DayZ ghost)" onClick={onLag} active={isLagActive}>
                <Gamepad2 className="w-4 h-4" />
              </IconBtn>
              <IconBtn
                title={isBlocked ? 'Restore connection' : 'Cut device'}
                onClick={handleCut}
                active={isBlocked}
              >
                {isBlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </IconBtn>
              <IconBtn title="Port blocker — block gaming/service ports" onClick={onPortBlock} active={isPortBlocked}>
                <span className="text-[10px] font-bold">PORT</span>
              </IconBtn>
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              <IconBtn
                title={isOneWayKill ? 'Stop one-way kill (upload blocked)' : 'One-way kill — block upload only'}
                onClick={() => onOneWayKill?.()}
                active={isOneWayKill}
              >
                <span className="text-[10px] font-bold">1WAY</span>
              </IconBtn>
              <IconBtn title="Lag switch" onClick={onLag} active={isLagActive}>
                <Timer className="w-4 h-4" />
              </IconBtn>
              <IconBtn title="Bandwidth / speed limit" onClick={onSpeed} active={isLimited}>
                <Filter className="w-4 h-4" />
              </IconBtn>
              <IconBtn
                title={isDnsBlocked ? `DNS block: ${dnsBlockLabel || 'active'}` : 'DNS blocker — full lock or site presets'}
                onClick={onDnsBlock}
                active={isDnsBlocked}
              >
                <span className="text-[10px] font-bold">DNS</span>
              </IconBtn>
              <IconBtn title="Refresh this device's Mbps" onClick={handleRetest}>
                <ToggleLeft className={`w-4 h-4 ${refreshing ? 'animate-pulse' : ''}`} />
              </IconBtn>
              <IconBtn title="Help" onClick={() => toast('Run as Administrator for cut, lag, and bandwidth')}>
                <HelpCircle className="w-4 h-4" />
              </IconBtn>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              <IconBtn
                title={isFirewallKill ? 'Remove full firewall kill' : 'Full firewall kill — block all traffic'}
                onClick={() => onFirewallKill?.()}
                active={isFirewallKill}
              >
                <ShieldBan className="w-4 h-4" />
              </IconBtn>
              <IconBtn title="Wake-on-LAN — send magic packet" onClick={() => onWakeOnLan?.()}>
                <Power className="w-4 h-4" />
              </IconBtn>
            </div>
            {!cutReady && (
              <p className="text-[10px] text-amber-400 px-1">
                Cut/limit disabled — run as Administrator with Npcap installed
              </p>
            )}
          </div>
        )}

        <div className="px-4 py-3 text-xs space-y-1">
          <p className="text-slate-500">
            Controllable: <span className="text-blue-400 capitalize">{mode}</span>
          </p>
          <div className="flex gap-3 text-blue-400">
            <button
              onClick={handleRetest}
              disabled={refreshing}
              className="hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Metering…' : 'ReTest'}
            </button>
            {onFavorite && (
              <button
                onClick={() => onFavorite(!isFavorite)}
                className="hover:underline flex items-center gap-1"
              >
                <Star className={`w-3 h-3 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                {isFavorite ? 'Favorited' : 'Favorite'}
              </button>
            )}
            {onKick && (
              <button onClick={onKick} className="hover:underline flex items-center gap-1 text-red-400">
                <ZapOff className="w-3 h-3" />
                Kick
              </button>
            )}
            <button
              onClick={() => setMode('advance')}
              className={`hover:underline ${mode === 'advance' ? 'font-semibold' : ''}`}
            >
              Advance Mode
            </button>
            <button
              onClick={() => setMode('intermediate')}
              className={`hover:underline ${mode === 'intermediate' ? 'font-semibold' : ''}`}
            >
              Intermediate mode
            </button>
          </div>
        </div>

        {mode === 'advance' && (
          <div className="px-4 pb-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-800 border border-slate-700 p-2">
              <p className="text-[10px] text-blue-400 flex items-center gap-1">
                <ArrowUp className="w-3 h-3" /> Upload
              </p>
              <p className="text-lg font-bold">
                {formatMbps(bandwidth?.upload, Boolean(bwActive))} Mbps
              </p>
              {isMetering && (
                <p className="text-[10px] text-amber-400">
                  Metering ~{meterSecondsLeft}s — browse/stream on device now
                </p>
              )}
            </div>
            <div className="rounded-lg bg-slate-800 border border-slate-700 p-2">
              <p className="text-[10px] text-green-400 flex items-center gap-1">
                <ArrowDown className="w-3 h-3" /> Download
              </p>
              <p className="text-lg font-bold">
                {formatMbps(bandwidth?.download, Boolean(bwActive))} Mbps
              </p>
            </div>
          </div>
        )}

        <div className="px-4 pb-4 space-y-2 text-sm">
          <div className="flex justify-between py-1 border-b border-slate-800">
            <span className="text-slate-500">IP</span>
            <button
              onClick={() => copyText(device.ip_address, 'IP')}
              className="font-mono text-slate-200 flex items-center gap-1 hover:text-blue-400"
            >
              {device.ip_address}
              <Copy className="w-3 h-3 opacity-50" />
            </button>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-800">
            <span className="text-slate-500">Hostname</span>
            <span className="text-slate-300 font-mono text-xs truncate max-w-[180px]">
              {device.hostname || '—'}
            </span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-800">
            <span className="text-slate-500">MAC</span>
            <button
              onClick={() => copyText(device.mac_address, 'MAC')}
              className="font-mono text-slate-200 flex items-center gap-1 hover:text-blue-400"
            >
              {device.mac_address}
              <Copy className="w-3 h-3 opacity-50" />
            </button>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-slate-800">
            <span className="text-slate-500">Brand</span>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-sm bg-gradient-to-br ${brand.color}`} />
              <span className="text-slate-300 capitalize">{brand.name}</span>
            </div>
          </div>
          {device.open_ports && device.open_ports.length > 0 && (
            <div className="py-2 border-b border-slate-800">
              <p className="text-slate-500 text-xs mb-1">Open ports (deep scan)</p>
              <div className="flex flex-wrap gap-1">
                {device.open_ports.slice(0, 12).map((p) => (
                  <span
                    key={p.port}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300"
                    title={p.service}
                  >
                    {p.port}
                    {p.service ? ` · ${p.service}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
          {onSaveNotes && (
            <div className="py-2">
              <p className="text-slate-500 text-xs mb-1">Notes</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                rows={2}
                placeholder="Room, owner, notes…"
                className="w-full text-xs rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-slate-200 resize-none"
              />
            </div>
          )}
        </div>

        <div className="px-4 pb-4 flex items-center justify-between">
          <span className={`text-sm font-medium ${isOnline ? 'text-green-400' : 'text-red-500'}`}>
            {isOnline ? 'Online' : 'Away'}
          </span>
          <div className="flex gap-2 text-[10px]">
            {isBlocked && <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold">CUT</span>}
            {isLimited && <span className="px-2 py-0.5 rounded bg-amber-500 text-white">LIMITED</span>}
            {isLagActive && <span className="px-2 py-0.5 rounded bg-purple-600 text-white">LAG</span>}
            {isMetering && (
              <span className="px-2 py-0.5 rounded bg-amber-500 text-white font-bold">METER</span>
            )}
            {isDnsBlocked && (
              <span className="px-2 py-0.5 rounded bg-cyan-600 text-white font-bold" title={dnsBlockLabel}>
                DNS
              </span>
            )}
            {isPortBlocked && (
              <span className="px-2 py-0.5 rounded bg-violet-600 text-white font-bold">PORTS</span>
            )}
            {isOneWayKill && (
              <span className="px-2 py-0.5 rounded bg-orange-600 text-white font-bold">1WAY</span>
            )}
            {cutting && <span className="text-slate-500">Working…</span>}
          </div>
        </div>

        {mode === 'intermediate' && !isSelf && (
          <div className="px-4 pb-4 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3">
            <button
              onClick={handleCut}
              disabled={!cutReady}
              className={`py-2 rounded-lg text-xs font-semibold disabled:opacity-40 ${isBlocked ? 'bg-green-600' : 'bg-red-600'}`}
            >
              {isBlocked ? 'Restore' : 'Cut'}
            </button>
            <button onClick={onSpeed} className="py-2 rounded-lg text-xs font-semibold border border-amber-500 text-amber-400">
              Speed
            </button>
            <button onClick={onLag} className="py-2 rounded-lg text-xs font-semibold border border-purple-500 text-purple-400">
              Lag
            </button>
            <button onClick={onPortBlock} className="py-2 rounded-lg text-xs font-semibold border border-violet-500 text-violet-300">
              Port
            </button>
            <button onClick={onDnsBlock} className="py-2 rounded-lg text-xs font-semibold border border-cyan-500 text-cyan-300">
              DNS
            </button>
            <button onClick={() => onOneWayKill?.()} className="py-2 rounded-lg text-xs font-semibold border border-orange-500 text-orange-300">
              1-Way
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
