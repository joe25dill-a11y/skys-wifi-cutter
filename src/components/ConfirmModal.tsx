import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  requireText,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTyped('');
      setLoading(false);
    }
  }, [open, title]);

  if (!open) return null;

  const textOk = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase();

  const handleConfirm = async () => {
    if (!textOk || loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-start gap-3 mb-4">
          <div className="flex items-start gap-2">
            {danger && <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
            <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300 mb-4 space-y-2">{message}</div>
        {requireText && (
          <div className="mb-4">
            <label className="block text-xs text-slate-500 mb-1">
              Type <strong className="font-mono">{requireText}</strong> to confirm
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border dark:bg-slate-700 dark:border-slate-600 font-mono text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && textOk && handleConfirm()}
            />
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !textOk}
            className={`flex-1 py-2 rounded-xl text-white font-medium disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
