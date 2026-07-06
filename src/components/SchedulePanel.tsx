import { useEffect, useState } from 'react';
import { Clock, Plus, Trash2, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';
import { Device } from '../types/device';

type ScheduleAction =
  | 'cut'
  | 'restore'
  | 'limit'
  | 'lag'
  | 'dns_block'
  | 'port_block'
  | 'firewall_kill'
  | 'group_cut'
  | 'group_restore';

interface DeviceGroup {
  id: string;
  name: string;
  macs: string[];
}

interface Schedule {
  id: string;
  mac?: string;
  groupId?: string;
  action: ScheduleAction;
  time: string;
  days: number[];
  enabled: boolean;
  label?: string;
  uploadKbps?: number;
  downloadKbps?: number;
  lagMs?: number;
  preset?: string;
  lastRunAt?: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ACTION_OPTIONS: { value: ScheduleAction; label: string }[] = [
  { value: 'cut', label: 'Cut internet' },
  { value: 'restore', label: 'Restore internet' },
  { value: 'lag', label: 'Apply lag' },
  { value: 'limit', label: 'Speed limit' },
  { value: 'dns_block', label: 'DNS block' },
  { value: 'port_block', label: 'Port block' },
  { value: 'firewall_kill', label: 'Firewall kill' },
  { value: 'group_cut', label: 'Cut group' },
  { value: 'group_restore', label: 'Restore group' }
];

const DNS_PRESETS = [
  { id: 'full', label: 'Full DNS lock' },
  { id: 'social', label: 'Social media' },
  { id: 'gaming', label: 'Online gaming' },
  { id: 'streaming', label: 'Streaming' }
];

const PORT_PRESETS = [
  { id: 'gaming', label: 'Gaming (general)' },
  { id: 'xbox', label: 'Xbox Live' },
  { id: 'psn', label: 'PlayStation Network' },
  { id: 'fortnite', label: 'Fortnite / Epic' },
  { id: 'discord', label: 'Discord voice' }
];

function actionLabel(action: ScheduleAction) {
  return ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;
}

function isGroupAction(action: ScheduleAction) {
  return action === 'group_cut' || action === 'group_restore';
}

function getNextRunHint(days: number[], time: string, enabled: boolean): string {
  if (!enabled) return `Paused — runs at ${time} on selected days`;
  if (!days.length) return 'No days selected';
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  for (let offset = 0; offset < 14; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    if (!days.includes(candidate.getDay())) continue;
    candidate.setHours(h, m, 0, 0);
    if (candidate > now) {
      return `Next run: ${candidate.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })}`;
    }
  }
  return 'No upcoming run in the next 2 weeks';
}

function getMissedHint(days: number[], time: string, enabled: boolean): string | null {
  if (!enabled || !days.length) return null;
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  if (!days.includes(now.getDay())) return null;
  const runTime = new Date(now);
  runTime.setHours(h, m, 0, 0);
  if (runTime < now) {
    return `Today's ${time} slot passed — runs at ${time} on selected days`;
  }
  return null;
}

function formatLastRun(lastRunAt?: string) {
  if (!lastRunAt) return null;
  return `Last run: ${new Date(lastRunAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })}`;
}

function scheduleToForm(s: Schedule) {
  return {
    mac: s.mac ?? '',
    groupId: s.groupId ?? '',
    action: s.action,
    time: s.time,
    days: [...(s.days ?? [])].sort((a, b) => a - b),
    uploadKbps: String(s.uploadKbps ?? 512),
    downloadKbps: String(s.downloadKbps ?? 2048),
    lagMs: String(s.lagMs ?? 150),
    preset: s.preset ?? 'full'
  };
}

export function SchedulePanel({ devices }: { devices: Device[] }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [mac, setMac] = useState('');
  const [groupId, setGroupId] = useState('');
  const [action, setAction] = useState<ScheduleAction>('cut');
  const [time, setTime] = useState('22:00');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [uploadKbps, setUploadKbps] = useState('512');
  const [downloadKbps, setDownloadKbps] = useState('2048');
  const [lagMs, setLagMs] = useState('150');
  const [preset, setPreset] = useState('full');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setMac('');
    setGroupId('');
    setAction('cut');
    setTime('22:00');
    setDays([0, 1, 2, 3, 4, 5, 6]);
    setUploadKbps('512');
    setDownloadKbps('2048');
    setLagMs('150');
    setPreset('full');
  };

  const startEdit = (schedule: Schedule) => {
    const form = scheduleToForm(schedule);
    setEditingId(schedule.id);
    setMac(form.mac);
    setGroupId(form.groupId);
    setAction(form.action);
    setTime(form.time);
    setDays(form.days.length ? form.days : [0, 1, 2, 3, 4, 5, 6]);
    setUploadKbps(form.uploadKbps);
    setDownloadKbps(form.downloadKbps);
    setLagMs(form.lagMs);
    setPreset(form.preset);
  };

  const load = async () => {
    const [schedData, groupData] = await Promise.all([
      apiFetch<{ schedules: Schedule[] }>('/schedules'),
      apiFetch<{ groups: DeviceGroup[] }>('/groups')
    ]);
    setSchedules(schedData.schedules);
    setGroups(groupData.groups);
  };

  useEffect(() => {
    load().catch(() => null);
  }, []);

  const toggleDay = (day: number) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const save = async () => {
    if (isGroupAction(action)) {
      if (!groupId) {
        toast.error('Pick a group');
        return;
      }
    } else if (!mac) {
      toast.error('Pick a device');
      return;
    }
    if (days.length === 0) {
      toast.error('Pick at least one day');
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = { action, time, days };
      if (isGroupAction(action)) {
        body.groupId = groupId;
        body.mac = null;
      } else {
        body.mac = mac;
        body.groupId = null;
      }
      if (action === 'limit') {
        body.uploadKbps = Number(uploadKbps) || 512;
        body.downloadKbps = Number(downloadKbps) || 2048;
      }
      if (action === 'lag') {
        body.lagMs = Number(lagMs) || 150;
      }
      if (action === 'dns_block' || action === 'port_block') {
        body.preset = preset;
      }
      if (editingId) {
        await apiFetch(`/schedules/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
        toast.success('Schedule updated');
      } else {
        await apiFetch('/schedules', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        toast.success('Schedule added');
      }
      resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/schedules/${id}`, { method: 'DELETE' });
    toast.success('Removed');
    await load();
  };

  const toggleEnabled = async (schedule: Schedule) => {
    try {
      await apiFetch(`/schedules/${schedule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !schedule.enabled })
      });
      await load();
      toast.success(schedule.enabled ? 'Schedule paused' : 'Schedule enabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Toggle failed');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-indigo-600" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Scheduled rules</h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Auto-run actions at a set time (checks every minute). Great for bedtime WiFi or scheduled blocks.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {isGroupAction(action) ? (
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="sm:col-span-2 rounded-xl border dark:bg-slate-700 dark:border-slate-600 px-3 py-2 text-sm"
          >
            <option value="">Select group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.macs.length})
              </option>
            ))}
          </select>
        ) : (
          <select
            value={mac}
            onChange={(e) => setMac(e.target.value)}
            className="sm:col-span-2 rounded-xl border dark:bg-slate-700 dark:border-slate-600 px-3 py-2 text-sm"
          >
            <option value="">Select device…</option>
            {devices.map((d) => (
              <option key={d.mac_address} value={d.mac_address}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as ScheduleAction)}
          className="rounded-xl border dark:bg-slate-700 dark:border-slate-600 px-3 py-2 text-sm"
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-xl border dark:bg-slate-700 dark:border-slate-600 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {DAY_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => toggleDay(i)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              days.includes(i)
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {action === 'limit' && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="text-xs text-slate-500">
            Upload (Kbps)
            <input
              type="number"
              value={uploadKbps}
              onChange={(e) => setUploadKbps(e.target.value)}
              className="mt-1 w-full rounded-lg border dark:bg-slate-700 dark:border-slate-600 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            Download (Kbps)
            <input
              type="number"
              value={downloadKbps}
              onChange={(e) => setDownloadKbps(e.target.value)}
              className="mt-1 w-full rounded-lg border dark:bg-slate-700 dark:border-slate-600 px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}

      {action === 'lag' && (
        <label className="block text-xs text-slate-500 mb-3">
          Lag (ms)
          <input
            type="number"
            value={lagMs}
            onChange={(e) => setLagMs(e.target.value)}
            min={50}
            max={500}
            className="mt-1 w-full max-w-xs rounded-lg border dark:bg-slate-700 dark:border-slate-600 px-3 py-2 text-sm"
          />
        </label>
      )}

      {(action === 'dns_block' || action === 'port_block') && (
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          className="w-full mb-3 rounded-xl border dark:bg-slate-700 dark:border-slate-600 px-3 py-2 text-sm"
        >
          {(action === 'dns_block' ? DNS_PRESETS : PORT_PRESETS).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      )}

      <button
        onClick={save}
        disabled={loading}
        className="mb-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
      >
        {editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {editingId ? 'Update schedule' : 'Add schedule'}
      </button>
      {editingId && (
        <button
          onClick={resetForm}
          className="mb-6 ml-2 inline-flex items-center gap-1 px-3 py-2 rounded-xl border text-sm"
        >
          <X className="w-4 h-4" />
          Cancel edit
        </button>
      )}

      {schedules.length === 0 ? (
        <p className="text-sm text-slate-500">No schedules yet.</p>
      ) : (
        <ul className="space-y-2">
          {schedules.map((s) => {
            const device = devices.find((d) => d.mac_address === s.mac);
            const group = groups.find((g) => g.id === s.groupId);
            const targetLabel = group?.name ?? device?.name ?? s.mac ?? s.groupId;
            const dayStr =
              (s.days ?? []).length === 7
                ? 'Daily'
                : DAY_LABELS.filter((_, i) => (s.days ?? []).includes(i)).join(', ') || 'Daily';
            return (
              <li
                key={s.id}
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  s.enabled
                    ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700'
                    : 'bg-slate-100/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700 opacity-60'
                }`}
              >
                <div>
                  <p className="font-medium text-sm">{targetLabel}</p>
                  <p className="text-xs text-slate-500">
                    {actionLabel(s.action)} at {s.time} · {dayStr}
                    {s.action === 'limit' && s.uploadKbps
                      ? ` · ${s.uploadKbps}/${s.downloadKbps} Kbps`
                      : ''}
                    {s.action === 'lag' && s.lagMs ? ` · ${s.lagMs}ms lag` : ''}
                    {(s.action === 'dns_block' || s.action === 'port_block') && s.preset
                      ? ` · ${s.preset}`
                      : ''}
                    {!s.enabled ? ' · paused' : ''}
                  </p>
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {getNextRunHint(s.days ?? [], s.time, s.enabled)}
                  </p>
                  {formatLastRun(s.lastRunAt) && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{formatLastRun(s.lastRunAt)}</p>
                  )}
                  {getMissedHint(s.days ?? [], s.time, s.enabled) && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                      {getMissedHint(s.days ?? [], s.time, s.enabled)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(s)}
                    className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg"
                    title="Edit schedule"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleEnabled(s)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      s.enabled
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {s.enabled ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
