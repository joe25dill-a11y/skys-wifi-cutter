export interface Device {
  id: string;
  name: string;
  ip_address: string;
  mac_address: string;
  status: 'allowed' | 'blocked';
  last_seen: string;
  device_type: string;
  created_at: string;
  updated_at: string;
  manufacturer?: string;
  hostname?: string;
  custom_name?: string;
  is_online?: boolean;
  is_favorite?: boolean;
  dns_blocked?: boolean;
  notes?: string;
  open_ports?: { port: number; service: string }[];
}

export interface BandwidthTotal {
  upload: number;
  download: number;
  interface: string | null;
  priming?: boolean;
}

export interface DeviceBandwidth {
  ip: string;
  mac: string;
  name: string;
  upload: number;
  download: number;
  status?: 'none' | 'metering' | 'live' | 'passive';
  isMetering?: boolean;
}

export interface FlowTrackingStatus {
  active: boolean;
  ready: boolean;
  trackedHosts: number;
  lastError: string | null;
}

export interface BandwidthResponse {
  total: BandwidthTotal;
  perDevice: boolean;
  devices?: DeviceBandwidth[];
  flowTracking?: FlowTrackingStatus;
  meteringMacs?: string[];
  note: string;
  timestamp: string;
}

export interface SystemChecks {
  python: string | null;
  pythonVersion: string | null;
  scapy: boolean;
  winrtHotspot?: boolean;
  npcap?: boolean;
  pythonBundled?: boolean;
  isAdmin: boolean;
  platform: string;
  cutReady: boolean;
  nativeMeter?: boolean;
  nativeMeterPath?: string | null;
  flowReady?: boolean;
  flowBlockReason?: string | null;
  hotspotReady?: boolean;
  warnings: string[];
}

export interface HealthResponse {
  status: string;
  degradedReason?: string | null;
  version?: string;
  timestamp: string;
  uptime: number;
  platform: string;
  network: {
    ip: string;
    subnet: string;
    interface: string;
    mac: string;
  } | null;
  activeCuts: number;
  defense?: { isActive: boolean; gatewayIp: string | null; gatewayMac: string | null };
  activeSpeedLimits?: number;
  speedLimits?: { mac: string; uploadKbps: number; downloadKbps: number }[];
  lagSwitches?: { mac: string; outgoingMs?: number; incomingMs?: number }[];
  dnsLocks?: string[];
  dnsBlocks?: { mac: string; preset?: string; label?: string; selective?: boolean }[];
  portBlocks?: { mac: string; ports: number[]; preset?: string; label?: string }[];
  oneWayKills?: { mac: string }[];
  firewallKills?: { mac: string; ipAddress?: string }[];
  flowTracking?: FlowTrackingStatus;
  checks: SystemChecks;
}
