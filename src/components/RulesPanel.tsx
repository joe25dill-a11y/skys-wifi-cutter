import { useEffect, useState } from 'react';
import { Zap, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';
import { Device } from '../types/device';

interface Rule {
  id: string;
  enabled: boolean;
  mac: string;
  condition: 'above_mbps' | 'below_mbps';
  thresholdMbps: number;
  action: 'cut' | 'uncut' | 'lag';
  lagMs?: number;
}

export function RulesPanel({ devices }: { devices: Device[] }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [mac, setMac] = useState('');
  const [thresholdMbps, setThresholdMbps] = useState(50);
  const [condition, setCondition] = useState<'above_mbps' | 'below_mbps'>('above_mbps');
  const [action, setAction] = useState<'cut' | 'uncut' | 'lag'>('cut');
  const [lagMs, setLagMs] = useState(150);

  const load = () =>
    apiFetch<{ rules: Rule[] }>('/rules')
      .then((d) => setRules(d.rules))
      .catch(() => null);

  useEffect(() => {
    load();
  }, []);

  const addRule = async () => {
    if (!mac) {
      toast.error('Pick a device MAC');
      return;
    }
    try {
      await apiFetch('/rules', {
        method: 'POST',
        body: JSON.stringify({
          mac,
          condition,
          thresholdMbps,
          action,
          lagMs: action === 'lag' ? lagMs : undefined
        })
      });
      toast.success('Rule added');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Add rule failed');
    }
  };

  const removeRule = async (id: string) => {
    try {
      await apiFetch(`/rules/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-5 h-5 text-amber-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Automation Rules</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Auto-cut or lag when bandwidth crosses a threshold (checked every 5 min).
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
        <select
          value={mac}
          onChange={(e) => setMac(e.target.value)}
          className="col-span-2 px-2 py-2 rounded border dark:bg-slate-700"
        >
          <option value="">Select device…</option>
          {devices.map((d) => (
            <option key={d.mac_address} value={d.mac_address}>
              {d.name} — {d.mac_address}
            </option>
          ))}
        </select>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as Rule['condition'])}
          className="px-2 py-2 rounded border dark:bg-slate-700"
        >
          <option value="above_mbps">Above Mbps</option>
          <option value="below_mbps">Below Mbps</option>
        </select>
        <input
          type="number"
          value={thresholdMbps}
          onChange={(e) => setThresholdMbps(parseInt(e.target.value, 10))}
          className="px-2 py-2 rounded border dark:bg-slate-700"
          min={1}
        />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as Rule['action'])}
          className="col-span-2 px-2 py-2 rounded border dark:bg-slate-700"
        >
          <option value="cut">Cut device</option>
          <option value="uncut">Restore device</option>
          <option value="lag">Apply lag</option>
        </select>
        {action === 'lag' && (
          <label className="col-span-2 text-xs text-slate-500">
            Lag (ms)
            <input
              type="number"
              value={lagMs}
              onChange={(e) => setLagMs(parseInt(e.target.value, 10) || 150)}
              min={50}
              max={500}
              className="mt-1 w-full px-2 py-2 rounded border dark:bg-slate-700"
            />
          </label>
        )}
      </div>
      <button
        onClick={addRule}
        className="w-full py-2 rounded-lg bg-amber-600 text-white text-sm font-medium flex items-center justify-center gap-1"
      >
        <Plus className="w-4 h-4" />
        Add rule
      </button>

      <div className="mt-4 space-y-2 max-h-40 overflow-y-auto text-xs">
        {rules.length === 0 ? (
          <p className="text-slate-500 text-center py-2">No rules yet</p>
        ) : (
          rules.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-700"
            >
              <span className="font-mono truncate">
                {r.condition === 'above_mbps' ? '>' : '<'} {r.thresholdMbps} Mbps → {r.action}
                {r.action === 'lag' && r.lagMs ? ` (${r.lagMs}ms)` : ''}
              </span>
              <span className="text-slate-400 truncate">
                {devices.find((d) => d.mac_address === r.mac)?.name ?? r.mac}
              </span>
              <button onClick={() => removeRule(r.id)} className="text-red-500 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
