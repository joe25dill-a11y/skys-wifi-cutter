import { useCallback, useState } from 'react';
import { Clock } from 'lucide-react';
import { apiFetch } from '../config/api';
import { useVisibilityPoll } from '../hooks/useVisibilityPoll';

import { actionLabel } from '../utils/auditLabels';

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

export function AuditTimeline() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  const load = useCallback(
    () =>
      apiFetch<{ entries: AuditEntry[] }>('/audit?limit=30')
        .then((d) => setEntries(d.entries))
        .catch(() => null),
    []
  );

  useVisibilityPoll(load, {
    enabled: true,
    visibleMs: 45_000,
    hiddenMs: null,
    runOnMount: true
  });

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
