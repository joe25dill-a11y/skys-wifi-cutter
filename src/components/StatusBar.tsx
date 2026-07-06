import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Shield, Wifi, Sparkles } from 'lucide-react';
import { HealthResponse } from '../types/device';
import { apiFetch } from '../config/api';

interface StatusBarProps {
  health: HealthResponse | null;
  deviceCount: number;
  onlineCount?: number;
  onOpenTroubleshoot?: () => void;
  onOpenDefense?: () => void;
}

function Chip({
  ok,
  label,
  detail,
  setup = false,
  onClick
}: {
  ok: boolean;
  label: string;
  detail?: string;
  setup?: boolean;
  onClick?: () => void;
}) {
  const tone = ok
    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100'
    : setup
      ? 'bg-amber-500/15 border-amber-400/40 text-amber-100'
      : 'bg-red-500/15 border-red-400/40 text-red-100';

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${tone} ${
        onClick ? 'cursor-pointer hover:brightness-110' : ''
      }`}
      title={detail}
    >
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {label}
    </Tag>
  );
}

export function StatusBar({ health, deviceCount, onlineCount = 0, onOpenTroubleshoot, onOpenDefense }: StatusBarProps) {
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const checks = health?.checks;
  const version = health?.version ?? '3.1.0';
  const defenseActive = Boolean(health?.defense?.isActive);
  const engineLabel = checks?.nativeMeter
    ? 'Native C# (fast)'
    : checks?.scapy
      ? 'Python fallback'
      : 'Missing';

  useEffect(() => {
    apiFetch<{ remoteControlEnabled?: boolean }>('/settings')
      .then((s) => setRemoteEnabled(Boolean(s.remoteControlEnabled)))
      .catch(() => null);
  }, []);

  return (
    <div className="mb-4 rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 text-white p-5 shadow-xl shadow-indigo-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-300" />
            Network control center
            {health?.status === 'degraded' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-200 border border-amber-400/40">
                Setup needed
              </span>
            )}
          </p>
          <p className="text-xs text-slate-300 mt-1">
            v{version} · {onlineCount}/{deviceCount} online · Engine: {engineLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip
            ok={Boolean(checks?.isAdmin)}
            label="Admin"
            detail="Run as administrator — click for cut troubleshooting"
            setup={!checks?.isAdmin}
            onClick={!checks?.isAdmin ? onOpenTroubleshoot : undefined}
          />
          <Chip ok={Boolean(checks?.npcap)} label="Npcap" detail="Packet capture driver" setup={!checks?.npcap} />
          <Chip
            ok={Boolean(checks?.nativeMeter || checks?.scapy)}
            label="Engine"
            detail={engineLabel}
          />
          <Chip ok={Boolean(checks?.cutReady)} label="Cut ready" detail="Ready to cut/limit/lag" onClick={!checks?.cutReady ? onOpenTroubleshoot : undefined} />
          <Chip
            ok={Boolean(checks?.hotspotReady ?? checks?.winrtHotspot)}
            label="Hotspot"
            detail="WinRT + Wi‑Fi for mobile hotspot"
            setup={!(checks?.hotspotReady ?? checks?.winrtHotspot)}
          />
          <Chip
            ok={Boolean(checks?.flowReady ?? health?.flowTracking?.ready)}
            label={checks?.flowReady ? 'Per-device BW' : 'BW monitor'}
            detail={checks?.flowBlockReason || 'Flow tracking + MITM meter'}
          />
          <Chip
            ok={defenseActive}
            label={defenseActive ? 'Defense ON' : 'Defense off'}
            detail="Gateway ARP pinned — click to open defender"
            onClick={onOpenDefense}
          />
          <Chip
            ok={remoteEnabled}
            label={remoteEnabled ? 'Remote ON' : 'Remote off'}
            detail="Phone remote API (opt-in PIN)"
            setup={!remoteEnabled}
          />
        </div>
      </div>
      {checks?.cutReady ? (
        health?.operationalNotes && health.operationalNotes.length > 0 ? (
          <p className="text-xs text-amber-300 mt-3">
            {health.operationalNotes[0]}
          </p>
        ) : (
        <p className="text-xs text-emerald-300 mt-3 flex items-center gap-1">
          <Shield className="w-3.5 h-3.5" />
          <Wifi className="w-3.5 h-3.5" />
          Ready — scan, cut, limit speed, lag, port block, DNS lock, and one-way kill
        </p>
        )
      ) : (
        <p className="text-xs text-amber-300 mt-3">
          {health?.degradedReason || checks?.flowBlockReason || 'Run as Administrator with Npcap installed'}
        </p>
      )}
    </div>
  );
}
