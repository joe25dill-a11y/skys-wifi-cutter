import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { apiFetch } from '../config/api';
import { useVisibilityPoll } from '../hooks/useVisibilityPoll';

interface BandwidthAlert {
  type: string;
  mac?: string;
  name?: string;
  mbps?: number;
  message: string;
}

interface MitmIssue {
  type: string;
  mac: string;
  message: string;
}

export function AlertsBanner() {
  const [bandwidth, setBandwidth] = useState<BandwidthAlert[]>([]);
  const [mitm, setMitm] = useState<MitmIssue[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ bandwidth: BandwidthAlert[]; mitm: MitmIssue[] }>('/alerts');
      const bw = data.bandwidth || [];
      const mitmIssues = data.mitm || [];
      setBandwidth(bw);
      setMitm(mitmIssues);
      const messages = [...mitmIssues.map((m) => m.message), ...bw.map((b) => b.message)];
      if (
        messages.length > 0 &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification('Skys WiFi Cutter', { body: messages[0] });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => null);
    }
  }, []);

  useVisibilityPoll(() => load().catch(() => null), {
    enabled: true,
    visibleMs: 45_000,
    hiddenMs: null,
    runOnMount: true
  });

  const items = [...mitm.map((m) => m.message), ...bandwidth.map((b) => b.message)];
  if (dismissed || items.length === 0) return null;

  return (
    <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-4 mb-4 text-sm">
      <div className="flex gap-2 items-start justify-between">
        <div className="flex gap-2 text-rose-800 dark:text-rose-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Network alerts</p>
            <p className="text-xs opacity-80 mb-2">
              Real external threats are rare. Speed meter and cut can trigger false ARP warnings on older builds.
            </p>
            <ul className="space-y-0.5">
              {items.slice(0, 5).map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-rose-500 hover:text-rose-700"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
