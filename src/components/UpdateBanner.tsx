import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { apiFetch } from '../config/api';

const GITHUB_RELEASES = 'https://github.com/joe25dill-a11y/skys-wifi-cutter/releases';
const SKIP_KEY = 'skys-skipped-update-version';

interface UpdateInfo {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  releaseUrl?: string | null;
  downloadUrl?: string | null;
  note?: string;
}

export function UpdateBanner({ currentVersion }: { currentVersion?: string }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const loadUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const data = await apiFetch<UpdateInfo>('/app/update-check');
      setInfo(data);
      if (data.latestVersion && localStorage.getItem(SKIP_KEY) === data.latestVersion) {
        setSkipped(true);
      } else {
        setSkipped(false);
      }
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    loadUpdate();
  }, [loadUpdate]);

  if (!info?.updateAvailable || skipped) {
    return null;
  }

  const href = info.downloadUrl || info.releaseUrl || GITHUB_RELEASES;

  const skipVersion = () => {
    if (info.latestVersion) {
      localStorage.setItem(SKIP_KEY, info.latestVersion);
      setSkipped(true);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-sky-300 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800 p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-sky-900 dark:text-sky-200">
        <Download className="w-4 h-4" />
        <span>
          Update available: v{info.latestVersion} (you have v{currentVersion ?? info.currentVersion})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={loadUpdate}
          disabled={checking}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-sky-400 text-sky-800 dark:text-sky-200 text-xs font-medium hover:bg-sky-100 dark:hover:bg-sky-900/40 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          Check again
        </button>
        <button
          type="button"
          onClick={skipVersion}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium hover:bg-white dark:hover:bg-slate-800"
        >
          <X className="w-3.5 h-3.5" />
          Skip this version
        </button>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-500"
        >
          {info.downloadUrl ? 'Download installer' : 'View release'}
        </a>
      </div>
    </div>
  );
}
