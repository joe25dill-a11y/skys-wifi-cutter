import { RotateCcw, X } from 'lucide-react';

interface RestoredCutsBannerProps {
  count: number;
  onRestoreAll: () => void;
  onDismiss: () => void;
}

export function RestoredCutsBanner({ count, onRestoreAll, onDismiss }: RestoredCutsBannerProps) {
  if (count <= 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-orange-900 dark:text-orange-200">
        <strong>{count} cut{count === 1 ? '' : 's'}</strong> restored from last session — devices are still blocked.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRestoreAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restore All
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
