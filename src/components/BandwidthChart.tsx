import React from 'react';
import { Activity, ArrowDown, ArrowUp, Info, Users, RefreshCw } from 'lucide-react';
import { BandwidthResponse } from '../types/device';

export interface BandwidthPoint {
  time: string;
  upload: number;
  download: number;
}

interface BandwidthChartProps {
  bandwidth: BandwidthResponse | null;
  history: BandwidthPoint[];
  onMeterDevice?: (mac: string) => Promise<void>;
  meteringMacs?: Set<string>;
}

function MiniChart({
  data,
  dataKey,
  color
}: {
  data: BandwidthPoint[];
  dataKey: 'upload' | 'download';
  color: string;
}) {
  if (data.length < 2) {
    return (
      <div className="h-16 flex items-center justify-center text-xs text-slate-400">
        Collecting samples…
      </div>
    );
  }

  const values = data.map((d) => d[dataKey]);
  const max = Math.max(...values, 0.1);

  return (
    <div className="h-16 flex items-end gap-0.5">
      {values.map((v, i) => (
        <div
          key={`${dataKey}-${i}`}
          className={`flex-1 rounded-t ${color} opacity-80`}
          style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
          title={`${v.toFixed(2)} Mbps`}
        />
      ))}
    </div>
  );
}

function formatDeviceMbps(value: number, status?: string) {
  if (value <= 0 && status !== 'metering' && status !== 'live') return '—';
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toFixed(2);
}

export const BandwidthChart: React.FC<BandwidthChartProps> = ({
  bandwidth,
  history,
  onMeterDevice,
  meteringMacs
}) => {
  const upload = bandwidth?.total.upload ?? 0;
  const download = bandwidth?.total.download ?? 0;
  const isPriming = bandwidth?.total.priming;
  const maxValue = Math.max(upload, download, isPriming ? 0 : 1, 0.1);
  const perDevice = bandwidth?.devices ?? [];
  const sortedDevices = [...perDevice].sort(
    (a, b) => b.download + b.upload - (a.download + a.upload)
  );

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Network Bandwidth
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {(bandwidth?.meteringMacs?.length ?? 0) > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
                Metering {bandwidth?.meteringMacs?.length} device(s)
              </span>
            )}
            {bandwidth?.total.interface && (
              <span className="text-xs text-slate-500 font-mono">{bandwidth.total.interface}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <ArrowUp className="w-4 h-4 text-blue-600" />
                Total upload (this PC)
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                {isPriming ? '…' : `${upload.toFixed(2)} Mbps`}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden mb-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${(upload / maxValue) * 100}%` }}
              />
            </div>
            <MiniChart data={history} dataKey="upload" color="bg-blue-500" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <ArrowDown className="w-4 h-4 text-green-600" />
                Total download (this PC)
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                {isPriming ? '…' : `${download.toFixed(2)} Mbps`}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden mb-3">
              <div
                className="bg-green-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${(download / maxValue) * 100}%` }}
              />
            </div>
            <MiniChart data={history} dataKey="download" color="bg-green-500" />
          </div>
        </div>

        <div className="flex items-start gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
          <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-500 dark:text-slate-400">{bandwidth?.note}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Per-device usage</h3>
          </div>
          <p className="text-xs text-slate-500">Wi‑Fi needs Meter — passive often shows 0</p>
        </div>
        {sortedDevices.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Scan the network to see per-device bandwidth.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {sortedDevices.map((device) => {
              const isMetering = meteringMacs?.has(device.mac.toUpperCase()) || device.isMetering;
              return (
                <div
                  key={device.mac}
                  className="px-6 py-3 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">
                      {device.name}
                      {isMetering && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white">
                          METERING
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 font-mono">{device.ip}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex gap-4 text-sm font-medium">
                      <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <ArrowUp className="w-3.5 h-3.5" />
                        {formatDeviceMbps(device.upload, device.status)}
                      </span>
                      <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                        <ArrowDown className="w-3.5 h-3.5" />
                        {formatDeviceMbps(device.download, device.status)}
                      </span>
                    </div>
                    {onMeterDevice && (
                      <button
                        onClick={() => onMeterDevice(device.mac)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-indigo-400 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${isMetering ? 'animate-spin' : ''}`} />
                        Meter
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
