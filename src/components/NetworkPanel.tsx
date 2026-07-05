import { useEffect, useState } from 'react';
import { Router, Wifi, Globe, Shield } from 'lucide-react';
import { apiFetch } from '../config/api';

interface NetworkInfo {
  ip: string;
  subnet: string;
  interface: string;
  mac: string;
  scanRange: string;
}

export function NetworkPanel() {
  const [info, setInfo] = useState<NetworkInfo | null>(null);

  useEffect(() => {
    apiFetch<NetworkInfo>('/network')
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  if (!info) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
          <Wifi className="w-3.5 h-3.5" /> Your IP
        </div>
        <p className="font-mono font-bold text-slate-900 dark:text-white">{info.ip}</p>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
          <Globe className="w-3.5 h-3.5" /> Subnet / Scan
        </div>
        <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{info.scanRange}</p>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
          <Router className="w-3.5 h-3.5" /> Interface
        </div>
        <p className="font-mono text-sm font-bold text-slate-900 dark:text-white truncate">{info.interface}</p>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
          <Shield className="w-3.5 h-3.5" /> Your MAC
        </div>
        <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">{info.mac}</p>
      </div>
    </div>
  );
}
