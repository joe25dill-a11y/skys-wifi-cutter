import { useEffect, useState } from 'react';
import { FolderOpen, Plus, Scissors, RotateCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';
import { Device } from '../types/device';

interface DeviceGroup {
  id: string;
  name: string;
  macs: string[];
  builtin?: boolean;
}

interface GroupsPanelProps {
  devices: Device[];
  onDevicesChange: (devices: Device[]) => void;
}

export function GroupsPanel({ devices, onDevicesChange }: GroupsPanelProps) {
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const data = await apiFetch<{ groups: DeviceGroup[] }>('/groups');
    setGroups(data.groups);
  };

  useEffect(() => {
    load().catch(() => null);
  }, []);

  const createGroup = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await apiFetch('/groups', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() })
      });
      setNewName('');
      await load();
      toast.success('Group created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const bulkAction = async (groupId: string, action: 'cut' | 'restore') => {
    setLoading(true);
    try {
      const path = action === 'cut' ? 'cut-all' : 'restore-all';
      const result = await apiFetch<{ devices: Device[]; count: number }>(`/groups/${groupId}/${path}`, {
        method: 'POST'
      });
      onDevicesChange(result.devices);
      toast.success(`${action === 'cut' ? 'Cut' : 'Restored'} ${result.count} device(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Group action failed');
    } finally {
      setLoading(false);
    }
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this group?')) return;
    await apiFetch(`/groups/${id}`, { method: 'DELETE' });
    await load();
    toast.success('Group deleted');
  };

  const deviceName = (mac: string) =>
    devices.find((d) => d.mac_address.toUpperCase() === mac.toUpperCase())?.name || mac;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <FolderOpen className="w-5 h-5 text-indigo-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Device Groups</h3>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New group name"
          className="flex-1 px-3 py-2 text-sm border rounded-lg dark:bg-slate-900 dark:border-slate-600"
        />
        <button
          onClick={createGroup}
          disabled={loading}
          className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <div
            key={group.id}
            className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="font-medium text-sm">{group.name}</p>
              <div className="flex gap-1">
                <button
                  onClick={() => bulkAction(group.id, 'cut')}
                  disabled={loading || group.macs.length === 0}
                  className="p-1.5 rounded bg-red-600 text-white"
                  title="Cut all in group"
                >
                  <Scissors className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => bulkAction(group.id, 'restore')}
                  disabled={loading || group.macs.length === 0}
                  className="p-1.5 rounded bg-emerald-600 text-white"
                  title="Restore all in group"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                {!group.builtin && (
                  <button
                    onClick={() => deleteGroup(group.id)}
                    className="p-1.5 rounded border text-slate-500"
                    title="Delete group"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-1">{group.macs.length} device(s)</p>
            {group.macs.length > 0 && (
              <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                {group.macs.slice(0, 4).map(deviceName).join(' · ')}
                {group.macs.length > 4 ? ' …' : ''}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
