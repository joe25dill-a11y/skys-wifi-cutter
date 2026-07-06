import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

const VERSION_KEY = 'skys-last-seen-version';

const HIGHLIGHTS: Record<string, string[]> = {
  '4.9.0': [
    'Per-device History tab — cuts, lag, DNS, renames, online/offline; export CSV',
    'Unified diagnostics dashboard — green/yellow/red status chips + cut troubleshoot tips',
    'Smarter search — notes, group, favorite, status, multi-word filters',
    'Network map shows CUT/LAG/DNS/PORT badges on devices',
    'Settings backup v2 (still imports v1); vendor lookup cache for faster scans'
  ],
  '4.8.0': [
    'Tools tab sticky sub-nav — jump to Defense, Schedules, Remote, Rules, and more',
    'Remote panel QR code for phone URL · download page install walkthrough cards',
    'Lag switch syncs active state · custom ghost pulse (incoming/freeze/count)',
    'Schedule last-run tracking · missed-slot hints · rules in backup export',
    '1WAY / FIREWALL / port preset badges · restored-cuts banner on startup',
    'Hotspot advanced accordion · quit warning when hotspot active · skip update version'
  ],
  '4.7.0': [
    'Accident-proof confirms — Cut All requires typing CUT; kick, firewall kill, and new-device cut ask first',
    '5-second undo toast after Cut All with Restore All',
    'Speed limit remove uses proper API (not fake unlimited Mbps)',
    'Schedule edit + next-run hints; group rename; defense/remote status chips',
    'Remote panel shows PC IP + copy link; tray Restore All & Panic Stop'
  ],
  '4.6.1': [
    'Game presets — device picker, active block badge, remove block, confirm before apply',
    'Optional lag mode on game presets (instead of port block)',
    'Update checker finds newest release when GitHub /latest skips prereleases',
    'Clearer API errors when cut, lag, or port block conflict',
    'Download page install steps + SmartScreen guidance'
  ],
  '4.6.0': [
    'Mobile remote page — open http://<PC-IP>:3001/remote from your phone',
    'Remote PIN stored hashed (scrypt) — never shown after save',
    'Gateway MAC drift alerts when router ARP may be spoofed',
    'Cut troubleshooting wizard — AP isolation and subnet self-test',
    'Schedules support lag and group cut/restore; rules have configurable lagMs'
  ],
  '4.5.0': [
    'Device groups — assign MACs and cut/restore whole groups',
    'Full schedule panel — all action types, day picker, enable/disable',
    'Update banner links directly to the latest installer download',
    'Report bugs via GitHub Issues from Diagnostics and setup wizard',
    'Remote PIN rate limiting after failed attempts'
  ],
  '4.4.0': [
    'Stronger hotspot passwords (auto-generated, no weak defaults)',
    'Copy feedback report in Tools → Diagnostics for bug reports',
    'Dashboard health strip shows Admin, Npcap, cut-ready at a glance',
    'API locked to localhost — remote control is opt-in with PIN',
    'Setup wizard + tray tips so closing X does not surprise you'
  ]
};

function defaultHighlights(version: string) {
  return HIGHLIGHTS[version] ?? [`Skys WiFi Cutter v${version} — scan, cut, lag, hotspot, and bandwidth tools.`];
}

export function WhatsNewModal({ version }: { version?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!version) return;
    const seen = localStorage.getItem(VERSION_KEY);
    if (seen !== version) {
      setOpen(true);
    }
  }, [version]);

  if (!open || !version) return null;

  const dismiss = () => {
    localStorage.setItem(VERSION_KEY, version);
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-indigo-500/40 bg-gradient-to-b from-slate-900 to-indigo-950 text-white shadow-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-sky-400" />
              <div>
                <p className="text-xs text-indigo-300 uppercase tracking-wider">What&apos;s new</p>
                <h2 className="text-xl font-bold">v{version}</h2>
              </div>
            </div>
            <button onClick={dismiss} className="p-1 text-slate-400 hover:text-white" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          <ul className="space-y-2 text-sm text-slate-200 mb-6">
            {defaultHighlights(version).map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-sky-400">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={dismiss}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
