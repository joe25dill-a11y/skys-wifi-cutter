import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

const VERSION_KEY = 'skys-last-seen-version';

const HIGHLIGHTS: Record<string, string[]> = {
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
