import { useEffect, useState } from 'react';
import { FolderOpen, Plus, Scissors, RotateCcw, Trash2, UserPlus, X, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch, encodeMac } from '../config/api';
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickMac, setPickMac] = useState<Record<string, string>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  const addMac = async (groupId: string) => {
    const mac = pickMac[groupId];
    if (!mac) {
      toast.error('Pick a device to add');
      return;
    }
    setLoading(true);
    try {
      await apiFetch(`/groups/${groupId}/macs`, {
        method: 'POST',
        body: JSON.stringify({ mac })
      });
      setPickMac((prev) => ({ ...prev, [groupId]: '' }));
      await load();
      toast.success('Device added to group');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add device');
    } finally {
      setLoading(false);
    }
  };

  const removeMac = async (groupId: string, mac: string) => {
    setLoading(true);
    try {
      await apiFetch(`/groups/${groupId}/macs/${encodeMac(mac)}`, { method: 'DELETE' });
      await load();
      toast.success('Device removed from group');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove device');
    } finally {
      setLoading(false);
    }
  };

  const saveRename = async (groupId: string) => {
    const name = renameValue.trim();
    if (!name) return;
    setLoading(true);
    try {
      await apiFetch(`/groups/${groupId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      });
      setRenamingId(null);
      setRenameValue('');
      await load();
      toast.success('Group renamed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setLoading(false);
    }
  };

  const deviceName = (mac: string) =>
    devices.find((d) => d.mac_address.toUpperCase() === mac.toUpperCase())?.name || mac;

  const unassignedForGroup = (group: DeviceGroup) =>
    devices.filter(
      (d) => !group.macs.some((m) => m.toUpperCase() === d.mac_address.toUpperCase())
    );

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
        {groups.map((group) => {
          const expanded = expandedId === group.id;
          const available = unassignedForGroup(group);
          return (
            <div
              key={group.id}
              className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                {renamingId === group.id ? (
                  <div className="flex flex-1 gap-2 items-center">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="flex-1 text-sm px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-600"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && saveRename(group.id)}
                    />
                    <button
                      onClick={() => saveRename(group.id)}
                      disabled={loading || !renameValue.trim()}
                      className="px-2 py-1 text-xs rounded bg-indigo-600 text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(null);
                        setRenameValue('');
                      }}
                      className="p-1 text-slate-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : group.id)}
                    className="flex items-center gap-1 font-medium text-sm text-left hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {group.name}
                  </button>
                )}
                <div className="flex gap-1">
                  {!group.builtin && renamingId !== group.id && (
                    <button
                      onClick={() => {
                        setRenamingId(group.id);
                        setRenameValue(group.name);
                      }}
                      className="p-1.5 rounded border text-slate-500"
                      title="Rename group"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
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
              {!expanded && group.macs.length > 0 && (
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                  {group.macs.slice(0, 4).map(deviceName).join(' · ')}
                  {group.macs.length > 4 ? ' …' : ''}
                </p>
              )}

              {expanded && (
                <div className="mt-3 space-y-2">
                  {group.macs.length === 0 ? (
                    <p className="text-xs text-slate-500">No devices assigned yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {group.macs.map((mac) => (
                        <li
                          key={mac}
                          className="flex items-center justify-between gap-2 text-xs bg-white dark:bg-slate-800 rounded px-2 py-1.5 border border-slate-200 dark:border-slate-700"
                        >
                          <span className="truncate">{deviceName(mac)}</span>
                          <button
                            onClick={() => removeMac(group.id, mac)}
                            disabled={loading}
                            className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded"
                            title="Remove from group"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2 pt-1">
                    <select
                      value={pickMac[group.id] || ''}
                      onChange={(e) => setPickMac((prev) => ({ ...prev, [group.id]: e.target.value }))}
                      className="flex-1 text-xs rounded-lg border dark:bg-slate-900 dark:border-slate-600 px-2 py-1.5"
                    >
                      <option value="">Add device…</option>
                      {available.map((d) => (
                        <option key={d.mac_address} value={d.mac_address}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => addMac(group.id)}
                      disabled={loading || !pickMac[group.id]}
                      className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white text-xs flex items-center gap-1 disabled:opacity-50"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
