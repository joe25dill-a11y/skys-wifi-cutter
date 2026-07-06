import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { apiFetch } from '../config/api';

interface AuditEntry {
  id: number;
  action: string;
  mac?: string;
  ip?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  cut: 'bg-red-500',
  uncut: 'bg-emerald-500',
  hotspot_freeze: 'bg-blue-500',
  hotspot_pulse: 'bg-purple-500',
  rule_cut: 'bg-orange-500',
  rule_lag: 'bg-amber-500',
  schedule_group_cut: 'bg-red-500',
  schedule_group_restore: 'bg-emerald-500',
  schedule_cut: 'bg-red-500',
  schedule_restore: 'bg-emerald-500',
  schedule_lag: 'bg-amber-500',
  schedule_limit: 'bg-blue-500',
  schedule_dns_block: 'bg-cyan-500',
  schedule_port_block: 'bg-violet-500',
  schedule_firewall_kill: 'bg-red-700',
  panic_stop_all: 'bg-red-600',
  group_cut_all: 'bg-red-500',
  group_restore_all: 'bg-emerald-500'
};

const ACTION_LABELS: Record<string, string> = {
  cut: 'Device cut',
  uncut: 'Device restored',
  hotspot_freeze: 'Hotspot frozen',
  hotspot_pulse: 'Hotspot pulse',
  hotspot_constant_lag_start: 'Hotspot constant lag started',
  hotspot_constant_lag_stop: 'Hotspot constant lag stopped',
  hotspot_gaming_mode_start: 'Hotspot gaming mode on',
  hotspot_gaming_mode_stop: 'Hotspot gaming mode off',
  hotspot_bandwidth_cap: 'Hotspot bandwidth cap',
  hotspot_bandwidth_cap_clear: 'Hotspot cap cleared',
  rule_cut: 'Automation rule cut',
  rule_uncut: 'Automation rule restore',
  rule_lag: 'Automation rule lag',
  schedule_cut: 'Scheduled cut',
  schedule_restore: 'Scheduled restore',
  schedule_lag: 'Scheduled lag',
  schedule_limit: 'Scheduled speed limit',
  schedule_dns_block: 'Scheduled DNS block',
  schedule_port_block: 'Scheduled port block',
  schedule_firewall_kill: 'Scheduled firewall kill',
  schedule_group_cut: 'Scheduled group cut',
  schedule_group_restore: 'Scheduled group restore',
  group_cut_all: 'Group cut all',
  group_restore_all: 'Group restore all',
  panic_stop_all: 'Panic stop all',
  device_scan: 'Network scan',
  quick_scan: 'Quick scan',
  game_preset: 'Game preset applied',
  wake_on_lan: 'Wake-on-LAN sent',
  firewall_kill_start: 'Firewall kill started',
  firewall_kill_stop: 'Firewall kill stopped',
  settings_import: 'Settings imported'
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

export function AuditTimeline() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    const load = () =>
      apiFetch<{ entries: AuditEntry[] }>('/audit?limit=30')
        .then((d) => setEntries(d.entries))
        .catch(() => null);
    load();
    const timer = setInterval(load, 45_000);
    return () => clearInterval(timer);
  }, []);

  if (entries.length === 0) {
    return (
      <div className="text-center text-slate-500 text-sm py-6">
        No events yet — cuts, hotspot freezes, and rules appear here
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-700" />
      <div className="space-y-4">
        {entries.map((entry) => {
          const color = ACTION_COLORS[entry.action] || 'bg-indigo-500';
          return (
            <div key={entry.id} className="relative flex gap-3">
              <span
                className={`absolute -left-4 top-1.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-800 ${color}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {actionLabel(entry.action)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{entry.action}</span>
                  {(entry.mac || entry.ip) && (
                    <span className="text-xs text-slate-500 truncate">{entry.mac || entry.ip}</span>
                  )}
                  <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto">
                    <Clock className="w-3 h-3" />
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
