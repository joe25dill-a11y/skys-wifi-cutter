import { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Gamepad2,
  Shield,
  Wifi,
  Wrench,
  ArrowRight,
  RefreshCw,
  XCircle,
  Download
} from 'lucide-react';
import { HealthResponse } from '../types/device';

const SETUP_KEY = 'skys-setup-complete';

interface SetupWizardProps {
  health: HealthResponse | null;
  onComplete: () => void;
  onScan: () => Promise<void>;
  onTestCut?: () => Promise<void>;
}

export function isSetupComplete() {
  return localStorage.getItem(SETUP_KEY) === 'true';
}

export function markSetupComplete() {
  localStorage.setItem(SETUP_KEY, 'true');
}

export function clearSetupComplete() {
  localStorage.removeItem(SETUP_KEY);
}

function CheckRow({
  ok,
  label,
  detail,
  fix
}: {
  ok: boolean;
  label: string;
  detail: string;
  fix?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        ok ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'
      }`}
    >
      <div className="flex items-start gap-2">
        {ok ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        )}
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-xs text-slate-300 mt-0.5">{detail}</p>
          {!ok && fix && <p className="text-xs text-amber-200/90 mt-1.5">→ {fix}</p>}
        </div>
      </div>
    </div>
  );
}

export function SetupWizard({ health, onComplete, onScan, onTestCut }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const checks = health?.checks;
  const version = health?.version ?? '4.10.3';

  const readiness = useMemo(
    () => [
      {
        ok: Boolean(checks?.isAdmin),
        label: 'Administrator',
        detail: checks?.isAdmin ? 'Running elevated — cut/lag/meter ready' : 'Not elevated',
        fix: 'Close app, right-click shortcut → Run as administrator'
      },
      {
        ok: Boolean(checks?.npcap),
        label: 'Npcap driver',
        detail: checks?.npcap ? 'Packet capture installed' : 'Missing or not detected',
        fix: 'Reinstall Skys WiFi Cutter (Npcap bundles with installer)'
      },
      {
        ok: Boolean(checks?.nativeMeter || checks?.scapy),
        label: 'Cut / meter engine',
        detail: checks?.nativeMeter
          ? 'Native C# engine ready (fastest)'
          : checks?.scapy
            ? 'Python fallback available'
            : 'No engine detected',
        fix: 'Run as admin and reinstall if Npcap + native engine missing'
      },
      {
        ok: Boolean(checks?.hotspotReady ?? checks?.winrtHotspot),
        label: 'Hotspot (optional)',
        detail:
          checks?.hotspotReady || checks?.winrtHotspot
            ? 'Mobile hotspot features available'
            : 'Hotspot may need admin + Wi‑Fi adapter',
        fix: undefined
      }
    ],
    [checks]
  );

  const steps = [
    { id: 'welcome', title: 'Welcome' },
    { id: 'ready', title: 'Readiness' },
    { id: 'tour', title: 'Quick tour' },
    { id: 'tips', title: 'Good to know' },
    { id: 'scan', title: 'First scan' }
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const cutReady = Boolean(checks?.cutReady);

  const handleNext = async () => {
    if (step === 0 && !legalAccepted) return;

    if (isLast) {
      setScanning(true);
      try {
        await onScan();
        markSetupComplete();
        onComplete();
      } finally {
        setScanning(false);
      }
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-3xl border border-indigo-500/30 bg-gradient-to-b from-slate-900 to-indigo-950 text-white shadow-2xl">
        <div className="h-2 bg-slate-800 sticky top-0 z-10">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 transition-all"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-8">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-blue-600">
                <Wifi className="w-8 h-8" />
              </div>
              <div>
                <p className="text-xs text-indigo-300 uppercase tracking-wider">
                  Setup · {step + 1}/{steps.length} · {current.title}
                </p>
                <h2 className="text-xl font-bold">
                  {step === 0 && 'Skys WiFi Cutter'}
                  {step === 1 && 'Is everything ready?'}
                  {step === 2 && 'Where things live'}
                  {step === 3 && 'Before you start'}
                  {step === 4 && 'Find your devices'}
                </h2>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-slate-800 text-indigo-200 border border-indigo-500/30">
              v{version}
            </span>
          </div>

          <div className="flex gap-1 mb-6">
            {steps.map((s, i) => (
              <div
                key={s.id}
                className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-indigo-400' : 'bg-slate-700'}`}
              />
            ))}
          </div>

          {step === 0 && (
            <>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                Free LAN network manager — scan devices, cut, limit speed, lag switch, hotspot
                control, and per-device bandwidth. No subscription.{' '}
                <strong className="text-white">Use only on networks you own.</strong>
              </p>
              <label className="flex items-start gap-3 mb-2 p-3 rounded-xl border border-slate-600/80 bg-slate-900/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(e) => setLegalAccepted(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-sm text-slate-300">
                  I will only use this on networks I own or have permission to manage. Unauthorized
                  interference is illegal.
                </span>
              </label>
            </>
          )}

          {step === 1 && (
            <div className="space-y-2 mb-4">
              {readiness.map((row) => (
                <CheckRow key={row.label} {...row} />
              ))}
              {!cutReady && (
                <p className="text-xs text-amber-200/80 mt-2">
                  You can finish setup and fix admin/Npcap later — scan still works.
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-3 mb-4">
              <div className="rounded-xl border border-blue-500/30 bg-blue-950/30 p-4">
                <p className="font-semibold text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-300" /> Devices
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Scan LAN, cut/restore, speed limit, lag, DNS/port blocks, device history.
                </p>
              </div>
              <div className="rounded-xl border border-purple-500/30 bg-purple-950/30 p-4">
                <p className="font-semibold text-sm flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-purple-300" /> Hotspot &amp; Lag
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Windows mobile hotspot, freeze clients, lag + packet drop sliders.
                </p>
              </div>
              <div className="rounded-xl border border-slate-500/30 bg-slate-900/50 p-4">
                <p className="font-semibold text-sm flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-300" /> Tools &amp; Defense
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Diagnostics, schedules, remote phone control, groups, rules, settings.
                </p>
              </div>
              {onTestCut && cutReady && (
                <button
                  type="button"
                  onClick={() => onTestCut()}
                  className="text-xs text-left text-indigo-300 hover:text-indigo-200 underline"
                >
                  Optional: open Devices now to test Cut → Restore on one device
                </button>
              )}
            </div>
          )}

          {step === 3 && (
            <ul className="space-y-3 text-sm text-slate-300 mb-4">
              <li className="flex gap-2">
                <Activity className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">X button</strong> hides to system tray by default
                  (hotspot can stay on). Use tray → Quit to fully exit.
                </span>
              </li>
              <li className="flex gap-2">
                <Download className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>
                  Updates: check the banner at top or{' '}
                  <a
                    href="https://github.com/joe25dill-a11y/skys-wifi-cutter/releases/latest"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-300 hover:underline"
                  >
                    GitHub releases
                  </a>
                  .
                </span>
              </li>
              <li className="flex gap-2">
                <Wrench className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Something broken? <strong className="text-white">Tools → Diagnostics</strong> →
                  Copy feedback report → GitHub issue.
                </span>
              </li>
            </ul>
          )}

          {step === 4 && (
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              We&apos;ll scan <strong className="text-white">192.168.x.x</strong> for phones,
              consoles, cameras, and PCs. Takes ~5–10 seconds. You can re-run Scan anytime from the
              Devices tab.
            </p>
          )}

          <div className="flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-3 rounded-xl border border-slate-600 text-slate-300"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={scanning || (step === 0 && !legalAccepted)}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {scanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Scanning…
                </>
              ) : isLast ? (
                <>
                  <Shield className="w-4 h-4" />
                  Scan &amp; finish
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              markSetupComplete();
              onComplete();
            }}
            className="w-full mt-3 text-xs text-slate-500 hover:text-slate-300"
          >
            Skip setup (you can re-run from Tools → Settings)
          </button>
        </div>
      </div>
    </div>
  );
}
