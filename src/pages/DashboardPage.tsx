import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Search,
  Moon,
  Sun,
  Shield,
  AlertTriangle,
  Clock,
  LayoutGrid,
  Wifi,
  Activity,
  Download,
  Scissors,
  RotateCcw,
  Wrench,
  List,
  Map as MapIcon,
  Scan
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useTheme } from '../contexts/ThemeContext';
import { DeviceTable } from '../components/DeviceTable';
import { BandwidthChart, BandwidthPoint } from '../components/BandwidthChart';
import { HotspotHub } from '../components/HotspotHub';
import type { AppSettings } from '../components/SettingsPanel';
import { NetworkPanel } from '../components/NetworkPanel';
import { ToolsPanel } from '../components/ToolsPanel';
import { StatusBar } from '../components/StatusBar';
import { SetupWizard, isSetupComplete } from '../components/SetupWizard';
import { NetCutDevicePanel } from '../components/NetCutDevicePanel';
import { WiFiAnalyzer } from '../components/WiFiAnalyzer';
import { SpeedTest } from '../components/SpeedTest';
import { UsageHistory } from '../components/UsageHistory';
import { PortBlockControl } from '../components/PortBlockControl';
import { DnsBlockControl } from '../components/DnsBlockControl';
import { UpdateBanner } from '../components/UpdateBanner';
import { AlertsBanner } from '../components/AlertsBanner';
import { NewDeviceBanner } from '../components/NewDeviceBanner';
import { WhatsNewModal } from '../components/WhatsNewModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { SpeedControl } from '../components/SpeedControl';
import { LagControl } from '../components/LagControl';
import { SchedulePanel } from '../components/SchedulePanel';
import { NetworkMap } from '../components/NetworkMap';
import { Device, BandwidthResponse, HealthResponse, DeviceBandwidth } from '../types/device';
import { apiFetch, API_BASE_URL, encodeMac } from '../config/api';

const AUTO_REFRESH_KEY = 'netcut-auto-refresh';
const DEVICE_SORT_KEY = 'netcut-device-sort';
const AUTO_REFRESH_MS = 30_000;
const LIVE_POLL_MS = 12_000;

type TabId = 'devices' | 'hotspot' | 'bandwidth' | 'wifi' | 'tools';
type ViewMode = 'grid' | 'list' | 'map';
type DeviceFilter = 'all' | 'online' | 'cut' | 'limited' | 'console' | 'phone';
type DeviceSort = 'default' | 'name' | 'bandwidth';

function sortDevicesList(
  list: Device[],
  sort: DeviceSort,
  bandwidth?: DeviceBandwidth[]
): Device[] {
  const bwByMac = new Map(bandwidth?.map((d) => [d.mac.toUpperCase(), d]) ?? []);
  const sorted = [...list];

  sorted.sort((a, b) => {
    if (sort === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sort === 'bandwidth') {
      const aBw = bwByMac.get(a.mac_address.toUpperCase());
      const bBw = bwByMac.get(b.mac_address.toUpperCase());
      const aMax = Math.max(aBw?.upload ?? 0, aBw?.download ?? 0);
      const bMax = Math.max(bBw?.upload ?? 0, bBw?.download ?? 0);
      return bMax - aMax;
    }
    const favDiff = Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite));
    if (favDiff !== 0) return favDiff;
    return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
  });

  return sorted;
}

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'devices', label: 'Devices', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'hotspot', label: 'Hotspot & Lag', icon: <Wifi className="w-4 h-4" /> },
  { id: 'bandwidth', label: 'Bandwidth', icon: <Activity className="w-4 h-4" /> },
  { id: 'wifi', label: 'WiFi', icon: <Wifi className="w-4 h-4" /> },
  { id: 'tools', label: 'Tools & Defense', icon: <Wrench className="w-4 h-4" /> }
];

export const DashboardPage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<TabId>('devices');
  const [devices, setDevices] = useState<Device[]>([]);
  const [bandwidth, setBandwidth] = useState<BandwidthResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(
    () => localStorage.getItem(AUTO_REFRESH_KEY) !== 'false'
  );
  const isRefreshingRef = useRef(false);
  const knownMacsRef = useRef<Set<string>>(new Set());
  const [bandwidthHistory, setBandwidthHistory] = useState<BandwidthPoint[]>([]);
  const [showSetup, setShowSetup] = useState(() => !isSetupComplete());
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [panelSpeedDevice, setPanelSpeedDevice] = useState<Device | null>(null);
  const [panelLagDevice, setPanelLagDevice] = useState<Device | null>(null);
  const [panelPortDevice, setPanelPortDevice] = useState<Device | null>(null);
  const [panelDnsDevice, setPanelDnsDevice] = useState<Device | null>(null);
  const [panelScheduleDevice, setPanelScheduleDevice] = useState<Device | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('all');
  const [deviceSort, setDeviceSort] = useState<DeviceSort>(
    () => (localStorage.getItem(DEVICE_SORT_KEY) as DeviceSort) || 'default'
  );
  const [deepScan, setDeepScan] = useState(false);
  const [selectedMacs, setSelectedMacs] = useState<Set<string>>(new Set());
  const [multiSelect, setMultiSelect] = useState(false);
  const [compactList, setCompactList] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [pendingNewDevices, setPendingNewDevices] = useState<Device[]>([]);
  const [toolsPresetMac, setToolsPresetMac] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    'cutAll' | 'restoreAll' | 'bulkCut' | 'bulkRestore' | null
  >(null);
  const [meterEndsAt, setMeterEndsAt] = useState<Record<string, number>>({});
  const [, setMeterTick] = useState(0);
  const lastBulkCutMacsRef = useRef<string[]>([]);

  const fetchDevices = async () => {
    const data = await apiFetch<Device[]>('/devices');
    setDevices(data);
    setError(null);
  };

  const fetchBandwidth = async () => {
    try {
      const data = await apiFetch<BandwidthResponse>('/bandwidth');
      setBandwidth(data);
      if (!data.total.priming) {
        setBandwidthHistory((prev) => {
          const next = [
            ...prev,
            {
              time: new Date().toLocaleTimeString(),
              upload: data.total.upload,
              download: data.total.download
            }
          ];
          return next.slice(-24);
        });
      }
    } catch (err) {
      console.error('Error fetching bandwidth:', err);
    }
  };

  const fetchBandwidthLive = async () => {
    try {
      const data = await apiFetch<Partial<BandwidthResponse>>('/bandwidth/live');
      setBandwidth((prev) => ({
        ...(prev || {
          total: { upload: 0, download: 0, interface: null },
          perDevice: false,
          note: '',
          timestamp: new Date().toISOString()
        }),
        ...data,
        total: data.total ?? prev?.total ?? { upload: 0, download: 0, interface: null },
        devices: data.devices ?? prev?.devices,
        meteringMacs: data.meteringMacs ?? prev?.meteringMacs,
        timestamp: data.timestamp ?? new Date().toISOString()
      } as BandwidthResponse));
      if (data.total && !data.total.priming) {
        setBandwidthHistory((prev) => {
          const next = [
            ...prev,
            {
              time: new Date().toLocaleTimeString(),
              upload: data.total!.upload,
              download: data.total!.download
            }
          ];
          return next.slice(-24);
        });
      }
    } catch (err) {
      console.error('Error fetching live bandwidth:', err);
    }
  };

  const fetchHealth = async () => {
    try {
      setHealth(await apiFetch<HealthResponse>('/health'));
    } catch (err) {
      console.error('Error fetching health:', err);
    }
  };

  const runScan = useCallback(async (options?: { silent?: boolean }) => {
    if (isRefreshingRef.current) return;

    isRefreshingRef.current = true;
    setIsRefreshing(true);

    try {
      const result = await apiFetch<{ devices: Device[]; count: number }>('/devices/refresh', {
        method: 'POST',
        body: JSON.stringify({ deep: deepScan })
      });
      setDevices(result.devices);
      setLastScanAt(new Date());

      const newDevices = result.devices.filter(
        (d) => knownMacsRef.current.size > 0 && !knownMacsRef.current.has(d.mac_address)
      );
      result.devices.forEach((d) => knownMacsRef.current.add(d.mac_address));
      if (newDevices.length > 0) {
        if (appSettings?.newDeviceAlertsEnabled !== false) {
          setPendingNewDevices((prev) => {
            const seen = new Set(prev.map((d) => d.mac_address));
            const merged = [...prev];
            for (const d of newDevices) {
              if (!seen.has(d.mac_address)) merged.push(d);
            }
            return merged;
          });
        }
        newDevices.forEach((d) => {
          toast(`New device: ${d.name}`, { icon: '🔔', duration: 5000 });
        });
      }

      await fetchBandwidth();
      setError(null);
      if (!options?.silent) toast.success(`Found ${result.count} device(s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network scan failed';
      setError(message);
      if (!options?.silent) toast.error(message);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [deepScan, appSettings?.newDeviceAlertsEnabled]);

  const lightRefresh = useCallback(async () => {
    try {
      await Promise.all([fetchDevices(), fetchBandwidthLive(), fetchHealth()]);
    } catch {
      // ignore background refresh errors
    }
  }, []);

  const handleToggleDevice = async (mac: string) => {
    if (!health?.checks?.cutReady) {
      toast.error(health?.degradedReason || 'Run as Administrator to cut devices');
      return;
    }
    const updated = await apiFetch<Device>(`/devices/${encodeMac(mac)}/toggle`, { method: 'POST' });
    setDevices((prev) => prev.map((d) => (d.mac_address === mac ? updated : d)));
    toast.success(updated.status === 'blocked' ? `${updated.name} cut` : `${updated.name} restored`);
    await fetchHealth();
  };

  const handleRename = async (mac: string, name: string) => {
    const updated = await apiFetch<Device>(`/devices/${encodeMac(mac)}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
    setDevices((prev) => prev.map((d) => (d.mac_address === mac ? updated : d)));
    toast.success(`Renamed to ${name}`);
  };

  const handleLimitSpeed = async (mac: string, uploadKbps: number, downloadKbps: number) => {
    const result = await apiFetch<{ message?: string }>(`/devices/${encodeMac(mac)}/limit-speed`, {
      method: 'POST',
      body: JSON.stringify({ uploadKbps, downloadKbps })
    });
    toast.success(result.message || 'Speed limit applied');
    await fetchHealth();
  };

  const handleRemoveSpeedLimit = async (mac: string) => {
    const result = await apiFetch<{ message?: string }>(`/devices/${encodeMac(mac)}/remove-speed-limit`, {
      method: 'POST'
    });
    toast.success(result.message || 'Speed limit removed');
    await fetchHealth();
  };

  const handleLagControl = async (
    mac: string,
    outgoingMs: number,
    incomingMs: number,
    uploadKbps = 0,
    downloadKbps = 0
  ) => {
    const result = await apiFetch<{ message?: string }>(`/devices/${encodeMac(mac)}/lag-control`, {
      method: 'POST',
      body: JSON.stringify({ outgoingMs, incomingMs, uploadKbps, downloadKbps })
    });
    toast.success(result.message || 'Lag applied');
    await fetchHealth();
  };

  const handleRemoveLag = async (mac: string) => {
    await apiFetch(`/devices/${encodeMac(mac)}/remove-lag`, { method: 'POST' });
    toast.success('Lag removed');
  };

  const handleLagSpike = async (mac: string, durationMs: number) => {
    const result = await apiFetch<{ message?: string }>(`/devices/${encodeMac(mac)}/lag-spike`, {
      method: 'POST',
      body: JSON.stringify({ durationMs })
    });
    toast.success(result.message || `Lag spike ${durationMs}ms`);
  };

  const handleGhostPulse = async (mac: string) => {
    const result = await apiFetch<{ message?: string; engine?: string }>(
      `/devices/${encodeMac(mac)}/ghost-pulse`,
      {
        method: 'POST',
        body: JSON.stringify({ incomingMs: 1200, freezeMs: 250, count: 8 })
      }
    );
    toast.success(result.message || `Ghost pulse sent (${result.engine || 'native'})`);
    await fetchHealth();
  };

  const exportCsv = () => {
    window.open(`${API_BASE_URL}/devices/export`, '_blank');
    toast.success('Downloading device list…');
  };

  const handleCutAll = async () => {
    if (!health?.checks?.cutReady) {
      toast.error(health?.degradedReason || 'Run as Administrator to cut devices');
      return;
    }
    try {
      const result = await apiFetch<{ devices: Device[] }>('/devices/cut-all', { method: 'POST' });
      setDevices(result.devices);
      toast.success('All devices cut');
      toast(
        (t) => (
          <span className="flex items-center gap-2 text-sm">
            Cut all applied — undo?
            <button
              onClick={async () => {
                toast.dismiss(t.id);
                await handleRestoreAll();
              }}
              className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold"
            >
              Restore All
            </button>
          </span>
        ),
        { duration: 5000, icon: '⚠️' }
      );
      await fetchHealth();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cut all failed');
    } finally {
      setConfirmAction(null);
    }
  };

  const handleRestoreAll = async () => {
    try {
      const result = await apiFetch<{ devices: Device[] }>('/devices/restore-all', { method: 'POST' });
      setDevices(result.devices);
      toast.success('All devices restored');
      await fetchHealth();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore all failed');
    } finally {
      setConfirmAction(null);
    }
  };

  const toggleMacSelection = (mac: string) => {
    setSelectedMacs((prev) => {
      const next = new Set(prev);
      if (next.has(mac)) next.delete(mac);
      else next.add(mac);
      return next;
    });
  };

  const handleBulkCut = async () => {
    if (selectedMacs.size === 0) return;
    if (!health?.checks?.cutReady) {
      toast.error(health?.degradedReason || 'Run as Administrator to cut devices');
      return;
    }
    const count = selectedMacs.size;
    const macsToCut = [...selectedMacs];
    lastBulkCutMacsRef.current = macsToCut;
    for (const mac of macsToCut) {
      try {
        await handleToggleDevice(mac);
      } catch {
        // continue
      }
    }
    setSelectedMacs(new Set());
    toast.success(`Cut ${count} selected device${count === 1 ? '' : 's'}`);
    toast(
      (t) => (
        <span className="flex items-center gap-2 text-sm">
          Bulk cut applied — undo?
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              for (const mac of lastBulkCutMacsRef.current) {
                const device = devices.find((d) => d.mac_address === mac);
                if (device?.status === 'blocked') {
                  try {
                    await handleToggleDevice(mac);
                  } catch {
                    // continue
                  }
                }
              }
              lastBulkCutMacsRef.current = [];
              toast.success('Bulk cut undone');
              await fetchHealth();
            }}
            className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold"
          >
            Undo
          </button>
        </span>
      ),
      { duration: 5000, icon: '⚠️' }
    );
    await fetchHealth();
    setConfirmAction(null);
  };

  const handleBulkRestore = async () => {
    if (selectedMacs.size === 0) return;
    for (const mac of selectedMacs) {
      const device = devices.find((d) => d.mac_address === mac);
      if (device?.status === 'blocked') {
        try {
          await handleToggleDevice(mac);
        } catch {
          // continue
        }
      }
    }
    setSelectedMacs(new Set());
    toast.success('Bulk restore applied');
    await fetchHealth();
    setConfirmAction(null);
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh((prev) => {
      const next = !prev;
      localStorage.setItem(AUTO_REFRESH_KEY, String(next));
      toast.success(next ? 'Auto-refresh ON (30s — light update)' : 'Auto-refresh OFF');
      return next;
    });
  };

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([fetchDevices(), fetchBandwidth(), fetchHealth()]);
        try {
          const settings = await apiFetch<AppSettings>('/settings');
          setAppSettings(settings);
          setCompactList(Boolean(settings.compactDeviceList));
        } catch {
          // ignore
        }
        const existing = await apiFetch<Device[]>('/devices');
        existing.forEach((d) => knownMacsRef.current.add(d.mac_address));
        await runScan({ silent: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [runScan]);

  const powerSaver = appSettings?.powerSaverMode ?? false;
  const livePollMs = powerSaver ? 20_000 : appSettings?.livePollMs ?? LIVE_POLL_MS;

  useEffect(() => {
    const shouldPollLive = () => {
      if (document.hidden) return false;
      if (powerSaver && tab !== 'devices' && tab !== 'bandwidth') return false;
      return tab === 'devices' || tab === 'bandwidth' || tab === 'tools';
    };

    const tick = () => {
      if (!shouldPollLive()) return;
      fetchBandwidthLive();
      fetchHealth();
    };

    tick();
    const interval = setInterval(tick, livePollMs);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tab, powerSaver, livePollMs]);

  const blockedCount = devices.filter((d) => d.status === 'blocked').length;
  const onlineCount = devices.filter((d) => d.is_online !== false).length;
  const warnings = health?.checks.warnings ?? [];
  const localMac = health?.network?.mac?.toUpperCase();
  const meteringMacs = new Set(
    (bandwidth?.meteringMacs ?? []).map((m) => m.toUpperCase())
  );
  const limitedMacs = new Set((health?.speedLimits ?? []).map((l) => l.mac));
  const lagMacs = new Set((health?.lagSwitches ?? []).map((l) => l.mac));
  const dnsMacs = new Set((health?.dnsBlocks ?? health?.dnsLocks ?? []).map((m) =>
    typeof m === 'string' ? m.toUpperCase() : m.mac.toUpperCase()
  ));
  const dnsBlockByMac = new Map(
    (health?.dnsBlocks ?? []).map((b) => [b.mac.toUpperCase(), b])
  );
  const portBlockMacs = new Set((health?.portBlocks ?? []).map((b) => b.mac.toUpperCase()));
  const oneWayMacs = new Set((health?.oneWayKills ?? []).map((k) => k.mac.toUpperCase()));
  const firewallMacs = new Set((health?.firewallKills ?? []).map((k) => k.mac.toUpperCase()));
  const cutReady = health?.checks?.cutReady ?? false;
  const cutTargetCount = devices.filter((d) => d.mac_address.toUpperCase() !== localMac).length;

  const selectedMeterSecondsLeft =
    selectedDevice && meteringMacs.has(selectedDevice.mac_address.toUpperCase())
      ? (() => {
          const endsAt = meterEndsAt[selectedDevice.mac_address.toUpperCase()];
          if (!endsAt) return undefined;
          return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        })()
      : undefined;

  const handleToggleFavorite = async (mac: string, favorite: boolean) => {
    const updated = await apiFetch<Device>(`/devices/${encodeMac(mac)}/favorite`, {
      method: 'PATCH',
      body: JSON.stringify({ favorite })
    });
    setDevices((prev) =>
      sortDevicesList(
        prev.map((d) => (d.mac_address === mac ? updated : d)),
        deviceSort,
        bandwidth?.devices
      )
    );
    if (selectedDevice?.mac_address === mac) {
      setSelectedDevice(updated);
    }
    toast.success(favorite ? 'Added to favorites' : 'Removed from favorites');
  };

  const handleKickDevice = async (mac: string) => {
    const result = await apiFetch<{ message?: string }>(`/devices/${encodeMac(mac)}/kick`, {
      method: 'POST'
    });
    toast.success(result.message || 'Device kicked');
  };

  const handleDnsBlock = async (mac: string, preset: string, domains: string[]) => {
    const result = await apiFetch<{ message?: string; device?: Device }>(
      `/devices/${encodeMac(mac)}/dns-block`,
      {
        method: 'POST',
        body: JSON.stringify({ preset, domains })
      }
    );
    if (result.device) {
      setDevices((prev) => prev.map((d) => (d.mac_address === mac ? result.device! : d)));
      if (selectedDevice?.mac_address === mac) {
        setSelectedDevice(result.device);
      }
    }
    toast.success(result.message || 'DNS block applied');
    await fetchHealth();
  };

  const handleDnsUnblock = async (mac: string) => {
    const result = await apiFetch<{ message?: string; device?: Device }>(
      `/devices/${encodeMac(mac)}/dns-unblock`,
      { method: 'POST' }
    );
    if (result.device) {
      setDevices((prev) => prev.map((d) => (d.mac_address === mac ? result.device! : d)));
      if (selectedDevice?.mac_address === mac) {
        setSelectedDevice(result.device);
      }
    }
    toast.success(result.message || 'DNS block removed');
    await fetchHealth();
  };

  const handlePortBlock = async (mac: string, preset: string, ports: number[]) => {
    const result = await apiFetch<{ message?: string }>(`/devices/${encodeMac(mac)}/port-block`, {
      method: 'POST',
      body: JSON.stringify({ preset, ports })
    });
    toast.success(result.message || 'Port block applied');
    await fetchHealth();
  };

  const handlePortUnblock = async (mac: string) => {
    const result = await apiFetch<{ message?: string }>(`/devices/${encodeMac(mac)}/port-unblock`, {
      method: 'POST'
    });
    toast.success(result.message || 'Port block removed');
    await fetchHealth();
  };

  const handleOneWayKill = async (mac: string, active: boolean) => {
    const path = active ? 'one-way-kill-stop' : 'one-way-kill';
    const result = await apiFetch<{ message?: string }>(`/devices/${encodeMac(mac)}/${path}`, {
      method: 'POST'
    });
    toast.success(result.message || (active ? 'One-way kill stopped' : 'One-way kill active'));
    await fetchHealth();
  };

  const handleFirewallKill = async (mac: string, active: boolean) => {
    const path = active ? 'firewall-kill-stop' : 'firewall-kill';
    const result = await apiFetch<{ message?: string }>(`/devices/${encodeMac(mac)}/${path}`, {
      method: 'POST'
    });
    toast.success(result.message || (active ? 'Firewall kill removed' : 'Full firewall kill active'));
    await fetchHealth();
  };

  const handleWakeOnLan = async (mac: string) => {
    const result = await apiFetch<{ message?: string }>(`/devices/${encodeMac(mac)}/wake`, {
      method: 'POST'
    });
    toast.success(result.message || 'Wake-on-LAN sent');
  };

  const runQuickScan = async () => {
    setIsRefreshing(true);
    try {
      const result = await apiFetch<{ devices: Device[]; count: number }>('/devices/quick-scan', {
        method: 'POST'
      });
      setDevices(result.devices);
      setLastScanAt(new Date());
      toast.success(`Quick scan — ${result.count} device(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Quick scan failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleCompactList = async () => {
    const next = !compactList;
    setCompactList(next);
    try {
      await apiFetch('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ compactDeviceList: next })
      });
      toast.success(next ? 'Compact list ON' : 'Compact list OFF');
    } catch {
      // ignore
    }
  };

  const handleMeterAll = async () => {
    const result = await apiFetch<{ message?: string; count?: number }>('/devices/meter-all', {
      method: 'POST',
      body: JSON.stringify({ seconds: 45 })
    });
    const data = await apiFetch<BandwidthResponse>('/bandwidth');
    setBandwidth(data);
    const endsAt = Date.now() + 45_000;
    setMeterEndsAt((prev) => {
      const next = { ...prev };
      (data.meteringMacs ?? []).forEach((m) => {
        next[m.toUpperCase()] = endsAt;
      });
      return next;
    });
    toast.success(result.message || `Metering ${result.count ?? 0} device(s)`);
  };

  const noteMeterEndsAt = (mac: string, secondsLeft: number) => {
    setMeterEndsAt((prev) => ({
      ...prev,
      [mac.toUpperCase()]: Date.now() + secondsLeft * 1000
    }));
  };

  const handleRefreshDeviceBandwidth = async (mac: string) => {
    const result = await apiFetch<{
      message?: string;
      metering?: boolean;
      secondsLeft?: number;
      engine?: string | null;
      device?: Device;
    }>(`/devices/${encodeMac(mac)}/refresh-bandwidth`, {
      method: 'POST',
      body: JSON.stringify({ seconds: 45 })
    });
    if (result.device) {
      setDevices((prev) =>
        prev.map((d) => (d.mac_address === mac ? { ...d, ...result.device } : d))
      );
      if (selectedDevice?.mac_address === mac) {
        setSelectedDevice({ ...selectedDevice, ...result.device });
      }
    }
    await fetchBandwidth();
    if (result.metering && result.secondsLeft) {
      noteMeterEndsAt(mac, result.secondsLeft);
    }
    if (result.metering) {
      toast.success(
        result.message ||
          `Metering ${result.secondsLeft ?? 45}s (${result.engine || 'meter'}) — use that device now`
      );
    } else if (result.message) {
      toast.error(result.message);
    } else {
      toast.success('Device refreshed');
    }
  };

  const handleSaveNotes = async (mac: string, notes: string) => {
    const updated = await apiFetch<Device>(`/devices/${encodeMac(mac)}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes })
    });
    setDevices((prev) => prev.map((d) => (d.mac_address === mac ? updated : d)));
    if (selectedDevice?.mac_address === mac) {
      setSelectedDevice(updated);
    }
    toast.success('Notes saved');
  };

  const filterDevices = (list: Device[]) => {
    return list.filter((d) => {
      if (deviceFilter === 'online') return d.is_online !== false;
      if (deviceFilter === 'cut') return d.status === 'blocked';
      if (deviceFilter === 'limited') return limitedMacs.has(d.mac_address);
      if (deviceFilter === 'console') return d.device_type === 'console';
      if (deviceFilter === 'phone') return d.device_type === 'phone';
      return true;
    });
  };

  const filteredDevices = sortDevicesList(filterDevices(devices), deviceSort, bandwidth?.devices);
  const meteringMacKey = (bandwidth?.meteringMacs ?? []).map((m) => m.toUpperCase()).sort().join(',');

  useEffect(() => {
    if (Object.keys(meterEndsAt).length === 0) return;
    const interval = setInterval(() => setMeterTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [meterEndsAt]);

  useEffect(() => {
    const activeMacs = new Set((bandwidth?.meteringMacs ?? []).map((m) => m.toUpperCase()));
    setMeterEndsAt((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const mac of Object.keys(next)) {
        if (!activeMacs.has(mac)) {
          delete next[mac];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [meteringMacKey]);

  useEffect(() => {
    if (selectedDevice) {
      setToolsPresetMac(selectedDevice.mac_address);
    }
  }, [selectedDevice?.mac_address]);

  useEffect(() => {
    if (!selectedDevice || localMac === selectedDevice.mac_address.toUpperCase()) return;
    handleRefreshDeviceBandwidth(selectedDevice.mac_address).catch(() => null);
  }, [selectedDevice?.mac_address]);

  useEffect(() => {
    if (meteringMacs.size === 0) return;
    if (tab !== 'devices' && tab !== 'bandwidth') return;
    const interval = setInterval(() => fetchBandwidth(), 2000);
    return () => clearInterval(interval);
  }, [meteringMacs.size, tab]);

  useEffect(() => {
    if (!autoRefresh) return;
    if (document.hidden) return;
    if (powerSaver && tab !== 'devices') return;
    const interval = setInterval(() => lightRefresh(), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, lightRefresh, tab, powerSaver]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <Toaster position="top-right" />

      {showSetup && (
        <SetupWizard
          health={health}
          onComplete={() => setShowSetup(false)}
          onScan={() => runScan({ silent: true })}
          onTestCut={async () => {
            setShowSetup(false);
            setTab('devices');
            toast('Select a device and tap Cut, then Restore to verify MITM works');
          }}
        />
      )}

      {selectedDevice && (
        <NetCutDevicePanel
          device={selectedDevice}
          bandwidth={bandwidth?.devices?.find((d) => d.mac === selectedDevice.mac_address)}
          isMetering={meteringMacs.has(selectedDevice.mac_address.toUpperCase())}
          meterSecondsLeft={selectedMeterSecondsLeft}
          perDeviceActive={bandwidth?.perDevice}
          isLimited={limitedMacs.has(selectedDevice.mac_address)}
          isLagActive={lagMacs.has(selectedDevice.mac_address)}
          localMac={localMac}
          onClose={() => setSelectedDevice(null)}
          onCut={() => handleToggleDevice(selectedDevice.mac_address)}
          onSpeed={() => {
            setPanelSpeedDevice(selectedDevice);
            setSelectedDevice(null);
          }}
          onLag={() => {
            setPanelLagDevice(selectedDevice);
            setSelectedDevice(null);
          }}
          onSchedule={() => {
            setPanelScheduleDevice(selectedDevice);
            setSelectedDevice(null);
          }}
          isFavorite={selectedDevice.is_favorite}
          isDnsBlocked={dnsMacs.has(selectedDevice.mac_address.toUpperCase()) || selectedDevice.dns_blocked}
          dnsBlockLabel={dnsBlockByMac.get(selectedDevice.mac_address.toUpperCase())?.label}
          isPortBlocked={portBlockMacs.has(selectedDevice.mac_address.toUpperCase())}
          isOneWayKill={oneWayMacs.has(selectedDevice.mac_address.toUpperCase())}
          onPortBlock={() => {
            setPanelPortDevice(selectedDevice);
            setSelectedDevice(null);
          }}
          onOneWayKill={() =>
            handleOneWayKill(
              selectedDevice.mac_address,
              oneWayMacs.has(selectedDevice.mac_address.toUpperCase())
            )
          }
          onFirewallKill={() =>
            handleFirewallKill(
              selectedDevice.mac_address,
              firewallMacs.has(selectedDevice.mac_address.toUpperCase())
            )
          }
          isFirewallKill={firewallMacs.has(selectedDevice.mac_address.toUpperCase())}
          onWakeOnLan={() => handleWakeOnLan(selectedDevice.mac_address)}
          onFavorite={(favorite) => handleToggleFavorite(selectedDevice.mac_address, favorite)}
          onKick={() => handleKickDevice(selectedDevice.mac_address)}
          onDnsBlock={() => {
            setPanelDnsDevice(selectedDevice);
            setSelectedDevice(null);
          }}
          onRetest={() => handleRefreshDeviceBandwidth(selectedDevice.mac_address)}
          onWifi={() => {
            setSelectedDevice(null);
            setTab('wifi');
          }}
          onDeepScan={async () => {
            setDeepScan(true);
            await runScan({ silent: false });
          }}
          onRename={(name) => handleRename(selectedDevice.mac_address, name)}
          onSaveNotes={(notes) => handleSaveNotes(selectedDevice.mac_address, notes)}
          cutReady={cutReady}
        />
      )}

      {panelSpeedDevice && (
        <SpeedControl
          device={panelSpeedDevice}
          onClose={() => setPanelSpeedDevice(null)}
          onApply={handleLimitSpeed}
          onRemoveLimit={handleRemoveSpeedLimit}
          isLimited={limitedMacs.has(panelSpeedDevice.mac_address)}
        />
      )}

      {panelLagDevice && (
        <LagControl
          device={panelLagDevice}
          onClose={() => setPanelLagDevice(null)}
          onApply={handleLagControl}
          onRemove={handleRemoveLag}
          onLagSpike={handleLagSpike}
          onGhostPulse={handleGhostPulse}
        />
      )}

      {panelPortDevice && (
        <PortBlockControl
          device={panelPortDevice}
          isActive={portBlockMacs.has(panelPortDevice.mac_address.toUpperCase())}
          onClose={() => setPanelPortDevice(null)}
          onApply={handlePortBlock}
          onRemove={handlePortUnblock}
        />
      )}

      {panelDnsDevice && (
        <DnsBlockControl
          device={panelDnsDevice}
          isActive={dnsMacs.has(panelDnsDevice.mac_address.toUpperCase())}
          activeLabel={dnsBlockByMac.get(panelDnsDevice.mac_address.toUpperCase())?.label}
          onClose={() => setPanelDnsDevice(null)}
          onApply={handleDnsBlock}
          onRemove={handleDnsUnblock}
        />
      )}

      {panelScheduleDevice && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 border">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Schedule — {panelScheduleDevice.name}</h3>
              <button onClick={() => setPanelScheduleDevice(null)} className="text-slate-400">
                ✕
              </button>
            </div>
            <SchedulePanel devices={[panelScheduleDevice]} />
          </div>
        </div>
      )}

      <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-3">
              <img src="/icon.png" alt="" className="w-10 h-10 rounded-xl shadow-md" />
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">Skys WiFi Cutter</h1>
                <p className="text-xs text-slate-500">
                  v{health?.version ?? '4.0.0'} · Free LAN network manager
                </p>
              </div>
            </div>
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
          </div>
          <div className="flex gap-1 pb-2 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!health?.checks?.isAdmin && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-xl p-4 mb-4 text-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 text-red-800 dark:text-red-200">
              <Shield className="w-5 h-5 flex-shrink-0" />
              <p>
                <strong>Run as Administrator</strong> — cut, lag, port block, DNS lock, and bandwidth
                metering need admin rights. Close the app and launch from the Desktop shortcut → Run as
                administrator.
              </p>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4 text-sm">
            <div className="flex gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="text-amber-800 dark:text-amber-300">
                <p className="font-medium mb-1">Setup tips (not app crashes)</p>
                <ul className="space-y-0.5">
                  {warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <UpdateBanner currentVersion={health?.version} />
        <AlertsBanner />
        <NewDeviceBanner
          devices={pendingNewDevices}
          onAllow={(mac) => setPendingNewDevices((prev) => prev.filter((d) => d.mac_address !== mac))}
          onBlock={async (mac) => {
            await handleToggleDevice(mac);
            setPendingNewDevices((prev) => prev.filter((d) => d.mac_address !== mac));
          }}
          onDismiss={(mac) =>
            setPendingNewDevices((prev) => prev.filter((d) => d.mac_address !== mac))
          }
          onDismissAll={() => setPendingNewDevices([])}
        />
        <WhatsNewModal version={health?.version} />
        <StatusBar health={health} deviceCount={devices.length} onlineCount={onlineCount} />

        <NetworkPanel />

        {tab === 'devices' && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl border p-4 text-center">
                <p className="text-2xl font-bold">{devices.length}</p>
                <p className="text-xs text-slate-500">Devices</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{onlineCount}</p>
                <p className="text-xs text-slate-500">Online</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{blockedCount}</p>
                <p className="text-xs text-slate-500">Cut</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border">
              <div className="p-4 border-b flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <h2 className="font-semibold">All LAN Devices</h2>
                  {lastScanAt && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {lastScanAt.toLocaleTimeString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={deviceSort}
                    onChange={(e) => {
                      const next = e.target.value as DeviceSort;
                      setDeviceSort(next);
                      localStorage.setItem(DEVICE_SORT_KEY, next);
                    }}
                    className="text-xs border rounded-lg px-2 py-1.5 dark:bg-slate-800 dark:border-slate-600"
                    title="Sort devices"
                  >
                    <option value="default">Sort: Favorites</option>
                    <option value="name">Sort: Name</option>
                    <option value="bandwidth">Sort: Bandwidth</option>
                  </select>
                  <div className="flex rounded-lg border overflow-hidden text-xs">
                    {(['all', 'online', 'cut', 'limited', 'console', 'phone'] as DeviceFilter[]).map(
                      (f) => (
                        <button
                          key={f}
                          onClick={() => setDeviceFilter(f)}
                          className={`px-2.5 py-1.5 capitalize ${
                            deviceFilter === f
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-slate-800 text-slate-600'
                          }`}
                        >
                          {f}
                        </button>
                      )
                    )}
                  </div>
                  <div className="flex rounded-lg border overflow-hidden">
                    {(
                      [
                        ['grid', LayoutGrid],
                        ['list', List],
                        ['map', MapIcon]
                      ] as const
                    ).map(([mode, Icon]) => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`p-2 ${viewMode === mode ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800'}`}
                        title={mode}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 px-2">
                    <input
                      type="checkbox"
                      checked={compactList}
                      onChange={toggleCompactList}
                    />
                    Compact
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 px-2">
                    <input
                      type="checkbox"
                      checked={multiSelect}
                      onChange={(e) => {
                        setMultiSelect(e.target.checked);
                        if (!e.target.checked) setSelectedMacs(new Set());
                      }}
                    />
                    Multi-select
                  </label>
                  <button
                    onClick={runQuickScan}
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600"
                    title="ARP-only fast refresh"
                  >
                    <Scan className="w-4 h-4" />
                    Quick
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 px-2">
                    <input
                      type="checkbox"
                      checked={deepScan}
                      onChange={(e) => setDeepScan(e.target.checked)}
                    />
                    Deep
                  </label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="pl-8 pr-3 py-1.5 text-sm border rounded-lg dark:bg-slate-700 dark:border-slate-600"
                    />
                  </div>
                  <button
                    onClick={exportCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                  <button
                    onClick={() => {
                      if (!cutReady) {
                        toast.error(health?.degradedReason || 'Run as Administrator to cut devices');
                        return;
                      }
                      setConfirmAction('cutAll');
                    }}
                    disabled={!cutReady || cutTargetCount === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white disabled:opacity-40"
                  >
                    <Scissors className="w-4 h-4" />
                    Cut All
                  </button>
                  <button
                    onClick={() => setConfirmAction('restoreAll')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restore All
                  </button>
                  <button
                    onClick={toggleAutoRefresh}
                    className={`px-3 py-1.5 text-sm rounded-lg border ${
                      autoRefresh ? 'border-blue-400 text-blue-600' : 'border-slate-300'
                    }`}
                  >
                    Auto 30s: {autoRefresh ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => runScan({ silent: false })}
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Scan
                  </button>
                </div>
              </div>

              {error && <p className="p-4 text-sm text-red-600">{error}</p>}

              {multiSelect && selectedMacs.size > 0 && (
                <div className="mx-4 mb-2 flex flex-wrap items-center gap-2 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-sm">
                  <span className="font-medium">{selectedMacs.size} selected</span>
                  <button
                    onClick={() => setConfirmAction('bulkCut')}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
                  >
                    Cut selected
                  </button>
                  <button
                    onClick={() => setConfirmAction('bulkRestore')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                  >
                    Restore selected
                  </button>
                  <button
                    onClick={() => setSelectedMacs(new Set())}
                    className="px-3 py-1.5 rounded-lg border text-xs"
                  >
                    Clear
                  </button>
                </div>
              )}

              {devices.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  Scan your network to find devices
                </div>
              ) : viewMode === 'map' ? (
                <div className="p-4">
                  <NetworkMap
                    devices={filteredDevices}
                    gatewayIp={health?.network?.ip}
                    deviceBandwidth={bandwidth?.devices}
                    localMac={localMac}
                    onSelectDevice={setSelectedDevice}
                  />
                </div>
              ) : (
                <DeviceTable
                  devices={filteredDevices}
                  onToggleDevice={handleToggleDevice}
                  onRename={handleRename}
                  onLimitSpeed={handleLimitSpeed}
                  onLagControl={handleLagControl}
                  onRemoveLag={handleRemoveLag}
                  onLagSpike={handleLagSpike}
                  onGhostPulse={handleGhostPulse}
                  searchQuery={searchQuery}
                  localMac={localMac}
                  deviceBandwidth={bandwidth?.devices}
                  limitedMacs={limitedMacs}
                  lagMacs={lagMacs}
                  dnsMacs={dnsMacs}
                  portBlockMacs={portBlockMacs}
                  oneWayMacs={oneWayMacs}
                  cutReady={cutReady}
                  viewMode={viewMode}
                  compact={compactList}
                  onDeviceClick={setSelectedDevice}
                  multiSelect={multiSelect}
                  selectedMacs={selectedMacs}
                  onSelectMac={toggleMacSelection}
                />
              )}
            </div>
          </>
        )}

        {tab === 'hotspot' && <HotspotHub />}

        {tab === 'bandwidth' && (
          <div className="space-y-6">
            <SpeedTest />
            <div className="flex justify-end">
              <button
                onClick={handleMeterAll}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
              >
                Meter all online devices
              </button>
            </div>
            <BandwidthChart
              bandwidth={bandwidth}
              history={bandwidthHistory}
              onMeterDevice={handleRefreshDeviceBandwidth}
              meteringMacs={meteringMacs}
            />
            <UsageHistory />
          </div>
        )}

        {tab === 'wifi' && <WiFiAnalyzer />}

        {tab === 'tools' && (
          <ToolsPanel
            devices={devices}
            health={health}
            onDevicesChange={setDevices}
            selectedDeviceMac={toolsPresetMac ?? selectedDevice?.mac_address ?? null}
            onSelectedDeviceMacChange={setToolsPresetMac}
            onHealthRefresh={fetchHealth}
          />
        )}
      </main>

      <ConfirmModal
        open={confirmAction === 'cutAll'}
        title="Cut all devices?"
        danger
        requireText="CUT"
        confirmLabel="Cut all"
        message={
          <>
            <p>
              Cut <strong>{cutTargetCount}</strong> device{cutTargetCount === 1 ? '' : 's'} from the network
              (your PC is excluded).
            </p>
            <p className="text-xs text-slate-500 mt-2">You can undo within 5 seconds after confirming.</p>
          </>
        }
        onConfirm={handleCutAll}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={confirmAction === 'restoreAll'}
        title="Restore all devices?"
        confirmLabel="Restore all"
        message={<p>Restore internet access for every device currently cut on this network?</p>}
        onConfirm={handleRestoreAll}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={confirmAction === 'bulkCut'}
        title="Cut selected devices?"
        danger
        requireText="CUT"
        confirmLabel="Cut selected"
        message={
          <p>
            Cut <strong>{selectedMacs.size}</strong> selected device{selectedMacs.size === 1 ? '' : 's'}{' '}
            from the network?
          </p>
        }
        onConfirm={handleBulkCut}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={confirmAction === 'bulkRestore'}
        title="Restore selected devices?"
        confirmLabel="Restore selected"
        message={
          <p>
            Restore internet access for the <strong>{selectedMacs.size}</strong> selected device
            {selectedMacs.size === 1 ? '' : 's'} that are currently cut?
          </p>
        }
        onConfirm={handleBulkRestore}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
};
