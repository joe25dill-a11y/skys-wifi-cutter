import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Shield,
  Wifi,
  ArrowRight,
  RefreshCw
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

export function SetupWizard({ health, onComplete, onScan, onTestCut }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const checks = health?.checks;

  const steps = [
    {
      title: 'Welcome to Skys WiFi Cutter',
      body: 'Free NetCut-style LAN control — cut, limit speed, lag switch, per-device bandwidth, and more. No subscription. Use only on networks you own.',
      ok: true
    },
    {
      title: 'Run as Administrator',
      body: 'Cut, lag, and bandwidth features need Admin rights. The installer requests Admin automatically. If features fail, right-click the shortcut → Run as administrator.',
      ok: Boolean(checks?.isAdmin)
    },
    {
      title: 'Npcap + native engine',
      body: 'Npcap captures packets. The native engine handles cut, lag, limits, and metering. Python is only needed for hotspot and some fallbacks.',
      ok: Boolean(checks?.cutReady)
    },
    {
      title: 'Closing the app',
      body: 'The X button hides to the system tray by default (hotspot can stay on). Use Quit from the tray menu to fully exit. Change this in Tools → Settings.',
      ok: true
    },
    {
      title: 'Test cut (optional)',
      body: 'Pick any device after scanning and tap Cut in the device panel to confirm MITM works. Restore immediately after.',
      ok: false,
      isTestCut: true
    },
    {
      title: 'Scan your network',
      body: 'Find every device on your WiFi or Ethernet. If something breaks later, Tools → Diagnostics → Copy feedback report and send it to the developer.',
      ok: false
    }
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleNext = async () => {
    if (step === 0 && !legalAccepted) {
      return;
    }
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
      <div className="max-w-lg w-full rounded-3xl border border-indigo-500/30 bg-gradient-to-b from-slate-900 to-indigo-950 text-white shadow-2xl overflow-hidden">
        <div className="h-2 bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 transition-all"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-blue-600">
              <Wifi className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xs text-indigo-300 uppercase tracking-wider">
                Step {step + 1} of {steps.length}
              </p>
              <h2 className="text-xl font-bold">{current.title}</h2>
            </div>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed mb-6">{current.body}</p>

          {step === 0 && (
            <label className="flex items-start gap-3 mb-6 p-3 rounded-xl border border-slate-600/80 bg-slate-900/50 cursor-pointer">
              <input
                type="checkbox"
                checked={legalAccepted}
                onChange={(e) => setLegalAccepted(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm text-slate-300">
                I will only use this on networks I own or have permission to manage. I understand
                unauthorized interference with others&apos; internet is illegal.
              </span>
            </label>
          )}

          {!isLast && !('isTestCut' in current && current.isTestCut) && (
            <div
              className={`flex items-center gap-2 p-3 rounded-xl mb-6 ${
                current.ok
                  ? 'bg-emerald-500/15 border border-emerald-500/30'
                  : 'bg-amber-500/15 border border-amber-500/30'
              }`}
            >
              {current.ok ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-amber-400" />
              )}
              <span className="text-sm">
                {current.ok ? 'Looks good!' : 'Fix this before using cut/lag features'}
              </span>
            </div>
          )}

          {'isTestCut' in current && current.isTestCut && (
            <div className="mb-6 space-y-2">
              <p className="text-xs text-slate-400">
                Scan your network first, then cut and restore one device to confirm everything works.
              </p>
              {onTestCut && (
                <button
                  type="button"
                  onClick={async () => {
                    await onTestCut();
                    setStep((s) => s + 1);
                  }}
                  className="w-full py-2 rounded-xl border border-indigo-500/40 text-indigo-200 text-sm hover:bg-indigo-500/10"
                >
                  Open devices to test cut
                </button>
              )}
            </div>
          )}

          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-3 rounded-xl border border-slate-600 text-slate-300"
              >
                Back
              </button>
            )}
            <button
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
                  Scan & finish
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
            onClick={() => {
              markSetupComplete();
              onComplete();
            }}
            className="w-full mt-3 text-xs text-slate-500 hover:text-slate-300"
          >
            Skip setup
          </button>
        </div>
      </div>
    </div>
  );
}
