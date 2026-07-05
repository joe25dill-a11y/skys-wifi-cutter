import { useEffect, useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';
import { Device } from '../types/device';

interface Schedule {
  id: string;
  mac: string;
  action: 'cut' | 'restore' | 'limit';
  time: string;
  days: number[];
  enabled: boolean;
  label?: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SchedulePanel({ devices }: { devices: Device[] }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [mac, setMac] = useState('');
  const [action, setAction] = useState<'cut' | 'restore'>('cut');
  const [time, setTime] = useState('22:00');

  const load = async () => {
    const data = await apiFetch<{ schedules: Schedule[] }>('/schedules');
    setSchedules(data.schedules);
  };

  useEffect(() => {
    load().catch(() => null);
  }, []);

  const add = async () => {
    if (!mac) {
      toast.error('Pick a device');
      return;
    }
    await apiFetch('/schedules', {
      method: 'POST',
      body: JSON.stringify({ mac, action, time })
    });
    toast.success('Schedule added');
    await load();
  };

  const remove = async (id: string) => {
    await apiFetch(`/schedules/${id}`, { method: 'DELETE' });
    toast.success('Removed');
    await load();
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-indigo-600" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Scheduled rules</h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Auto cut or restore devices at a set time (checks every minute). Great for bedtime WiFi.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4">
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
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as 'cut' | 'restore')}
          className="rounded-xl border dark:bg-slate-700 dark:border-slate-600 px-3 py-2 text-sm"
        >
          <option value="cut">Cut at</option>
          <option value="restore">Restore at</option>
        </select>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-xl border dark:bg-slate-700 dark:border-slate-600 px-3 py-2 text-sm"
        />
      </div>
      <button
        onClick={add}
        className="mb-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        Add schedule
      </button>

      {schedules.length === 0 ? (
        <p className="text-sm text-slate-500">No schedules yet.</p>
      ) : (
        <ul className="space-y-2">
          {schedules.map((s) => {
            const device = devices.find((d) => d.mac_address === s.mac);
            return (
              <li
                key={s.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700"
              >
                <div>
                  <p className="font-medium text-sm">{device?.name ?? s.mac}</p>
                  <p className="text-xs text-slate-500">
                    {s.action} at {s.time} · {DAY_LABELS.filter((_, i) => (s.days ?? []).includes(i)).join(', ') || 'Daily'}
                  </p>
                </div>
                <button
                  onClick={() => remove(s.id)}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
