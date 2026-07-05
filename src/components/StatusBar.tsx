import { CheckCircle2, XCircle, Shield, Wifi, Sparkles } from 'lucide-react';
import { HealthResponse } from '../types/device';

interface StatusBarProps {
  health: HealthResponse | null;
  deviceCount: number;
  onlineCount?: number;
}

function Chip({
  ok,
  label,
  detail,
  setup = false
}: {
  ok: boolean;
  label: string;
  detail?: string;
  setup?: boolean;
}) {
  const tone = ok
    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100'
    : setup
      ? 'bg-amber-500/15 border-amber-400/40 text-amber-100'
      : 'bg-red-500/15 border-red-400/40 text-red-100';

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${tone}`} title={detail}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {label}
    </div>
  );
}

export function StatusBar({ health, deviceCount, onlineCount = 0 }: StatusBarProps) {
  const checks = health?.checks;
  const version = health?.version ?? '3.1.0';
  const engineLabel = checks?.nativeMeter
    ? 'Native C# (fast)'
    : checks?.scapy
      ? 'Python fallback'
      : 'Missing';

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
          <Chip ok={Boolean(checks?.isAdmin)} label="Admin" detail="Run as administrator" setup={!checks?.isAdmin} />
          <Chip ok={Boolean(checks?.npcap)} label="Npcap" detail="Packet capture driver" setup={!checks?.npcap} />
          <Chip
            ok={Boolean(checks?.nativeMeter || checks?.scapy)}
            label="Engine"
            detail={engineLabel}
          />
          <Chip ok={Boolean(checks?.cutReady)} label="Cut ready" detail="Ready to cut/limit/lag" />
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
        </div>
      </div>
      {checks?.cutReady ? (
        <p className="text-xs text-emerald-300 mt-3 flex items-center gap-1">
          <Shield className="w-3.5 h-3.5" />
          <Wifi className="w-3.5 h-3.5" />
          Ready — scan, cut, limit speed, lag, port block, DNS lock, and one-way kill
        </p>
      ) : (
        <p className="text-xs text-amber-300 mt-3">
          {health?.degradedReason || checks?.flowBlockReason || 'Run as Administrator with Npcap installed'}
        </p>
      )}
    </div>
  );
}
