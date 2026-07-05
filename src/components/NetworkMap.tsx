import { Router } from 'lucide-react';
import { Device, DeviceBandwidth } from '../types/device';

interface NetworkMapProps {
  devices: Device[];
  gatewayIp?: string;
  deviceBandwidth?: DeviceBandwidth[];
  onSelectDevice: (device: Device) => void;
  localMac?: string;
}

export function NetworkMap({
  devices,
  gatewayIp,
  deviceBandwidth = [],
  onSelectDevice,
  localMac
}: NetworkMapProps) {
  const bwMap = new Map(deviceBandwidth.map((d) => [d.mac, d]));
  const online = devices.filter((d) => d.is_online !== false);
  const radius = Math.min(180, 60 + online.length * 12);

  return (
    <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-900 dark:to-indigo-950 p-6 min-h-[420px] overflow-hidden">
      <p className="text-xs text-slate-500 mb-4 text-center">Tap a device to open details</p>
      <div className="relative mx-auto" style={{ width: radius * 2 + 120, height: radius * 2 + 120 }}>
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center"
          style={{ width: 100 }}
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-900/30">
            <Router className="w-8 h-8 text-white" />
          </div>
          <p className="text-xs font-semibold mt-2 text-slate-700 dark:text-slate-200">Router</p>
          <p className="text-[10px] font-mono text-slate-500">{gatewayIp || 'Gateway'}</p>
        </div>

        {online.map((device, i) => {
          const angle = (i / Math.max(online.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const bw = bwMap.get(device.mac_address);
          const totalBw = (bw?.upload ?? 0) + (bw?.download ?? 0);
          const isBlocked = device.status === 'blocked';
          const isSelf = device.mac_address === localMac;

          return (
            <button
              key={device.mac_address}
              onClick={() => onSelectDevice(device)}
              className="absolute z-20 flex flex-col items-center group"
              style={{
                left: `calc(50% + ${x}px - 40px)`,
                top: `calc(50% + ${y}px - 36px)`,
                width: 80
              }}
            >
              <div
                className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xs font-bold transition-transform group-hover:scale-110 ${
                  isBlocked
                    ? 'bg-red-100 border-red-500 text-red-700'
                    : isSelf
                      ? 'bg-blue-100 border-blue-500 text-blue-700'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                }`}
              >
                {device.device_type.slice(0, 2).toUpperCase()}
              </div>
              <p className="text-[10px] font-medium mt-1 truncate w-full text-center">{device.name}</p>
              {totalBw > 0 && (
                <p className="text-[9px] text-emerald-600 font-mono">{totalBw.toFixed(1)} Mbps</p>
              )}
            </button>
          );
        })}

        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
          {online.map((device, i) => {
            const angle = (i / Math.max(online.length, 1)) * Math.PI * 2 - Math.PI / 2;
            const cx = radius + 60;
            const cy = radius + 60;
            const x2 = cx + Math.cos(angle) * radius;
            const y2 = cy + Math.sin(angle) * radius;
            return (
              <line
                key={device.mac_address}
                x1={cx}
                y1={cy}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                className="text-indigo-500"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
