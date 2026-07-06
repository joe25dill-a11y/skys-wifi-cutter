import { useEffect, useState } from 'react';
import { Zap, Plus, Trash2, Pencil, Play, X } from 'lucide-react';
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
  lastTriggeredAt?: string;
  lastTriggeredMbps?: number;
}

export function RulesPanel({ devices }: { devices: Device[] }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [mac, setMac] = useState('');
  const [thresholdMbps, setThresholdMbps] = useState(50);
  const [condition, setCondition] = useState<'above_mbps' | 'below_mbps'>('above_mbps');
  const [action, setAction] = useState<'cut' | 'uncut' | 'lag'>('cut');
  const [lagMs, setLagMs] = useState(150);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  const load = () =>
    apiFetch<{ rules: Rule[] }>('/rules')
      .then((d) => setRules(d.rules))
      .catch(() => null);

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setMac('');
    setThresholdMbps(50);
    setCondition('above_mbps');
    setAction('cut');
    setLagMs(150);
  };

  const startEdit = (rule: Rule) => {
    setEditingId(rule.id);
    setMac(rule.mac);
    setThresholdMbps(rule.thresholdMbps);
    setCondition(rule.condition);
    setAction(rule.action);
    setLagMs(rule.lagMs ?? 150);
  };

  const saveRule = async () => {
    if (!mac) {
      toast.error('Pick a device');
      return;
    }
    try {
      if (editingId) {
        await apiFetch(`/rules/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            mac,
            condition,
            thresholdMbps,
            action,
            lagMs: action === 'lag' ? lagMs : undefined
          })
        });
        toast.success('Rule updated');
      } else {
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
      }
      resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const removeRule = async (id: string) => {
    try {
      await apiFetch(`/rules/${id}`, { method: 'DELETE' });
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const toggleEnabled = async (rule: Rule) => {
    try {
      await apiFetch(`/rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled })
      });
      await load();
      toast.success(rule.enabled ? 'Rule disabled' : 'Rule enabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Toggle failed');
    }
  };

  const evaluateNow = async () => {
    setEvaluating(true);
    try {
      const result = await apiFetch<{ fired: { ruleId: string; action: string }[]; rules: Rule[] }>(
        '/rules/evaluate-now',
        { method: 'POST' }
      );
      setRules(result.rules);
      if (result.fired.length === 0) {
        toast.success('No rules matched current bandwidth');
      } else {
        toast.success(`${result.fired.length} rule(s) fired`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Evaluate failed');
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Automation Rules</h3>
        </div>
        <button
          onClick={evaluateNow}
          disabled={evaluating || rules.length === 0}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-400 text-amber-700 dark:text-amber-300 text-xs font-medium disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          {evaluating ? 'Checking…' : 'Run now'}
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Auto-cut or lag when bandwidth crosses a threshold (checked every 5 min, or Run now).
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
      <div className="flex gap-2 mb-3">
        <button
          onClick={saveRule}
          className="flex-1 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium flex items-center justify-center gap-1"
        >
          <Plus className="w-4 h-4" />
          {editingId ? 'Update rule' : 'Add rule'}
        </button>
        {editingId && (
          <button
            onClick={resetForm}
            className="px-3 py-2 rounded-lg border text-sm"
            title="Cancel edit"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2 max-h-48 overflow-y-auto text-xs">
        {rules.length === 0 ? (
          <p className="text-slate-500 text-center py-2">No rules yet</p>
        ) : (
          rules.map((r) => (
            <div
              key={r.id}
              className={`py-2 border-b border-slate-100 dark:border-slate-700 ${
                r.enabled ? '' : 'opacity-50'
              } ${editingId === r.id ? 'bg-amber-500/10 -mx-1 px-1 rounded' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono truncate">
                  {r.condition === 'above_mbps' ? '>' : '<'} {r.thresholdMbps} Mbps → {r.action}
                  {r.action === 'lag' && r.lagMs ? ` (${r.lagMs}ms)` : ''}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(r)}
                    className="p-1 text-slate-500 hover:text-blue-500"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => toggleEnabled(r)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      r.enabled
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700'
                    }`}
                  >
                    {r.enabled ? 'On' : 'Off'}
                  </button>
                  <button onClick={() => removeRule(r.id)} className="text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-slate-400 truncate mt-0.5">
                {devices.find((d) => d.mac_address === r.mac)?.name ?? r.mac}
                {r.lastTriggeredAt && (
                  <span className="ml-2 text-slate-500">
                    · last fired {new Date(r.lastTriggeredAt).toLocaleString()}
                    {r.lastTriggeredMbps != null ? ` @ ${r.lastTriggeredMbps.toFixed(1)} Mbps` : ''}
                  </span>
                )}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
