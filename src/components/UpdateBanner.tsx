import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { apiFetch } from '../config/api';

interface UpdateInfo {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  releaseUrl?: string | null;
  note?: string;
}

export function UpdateBanner({ currentVersion }: { currentVersion?: string }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    apiFetch<UpdateInfo>('/app/update-check')
      .then(setInfo)
      .catch(() => null);
  }, []);

  if (!info?.updateAvailable) {
    return null;
  }

  const href = info.releaseUrl || 'https://github.com/SkysWiFiCutter/skys-wifi-cutter/releases';

  return (
    <div className="mb-4 rounded-xl border border-sky-300 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800 p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-sky-900 dark:text-sky-200">
        <Download className="w-4 h-4" />
        <span>
          Update available: v{info.latestVersion} (you have v{currentVersion ?? info.currentVersion})
        </span>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-500"
      >
        Download update
      </a>
    </div>
  );
}
