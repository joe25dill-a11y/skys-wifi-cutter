import React, { useState } from 'react';
import { Gauge, X, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { Device } from '../types/device';

interface SpeedControlProps {
  device: Device;
  onClose: () => void;
  onApply: (mac: string, uploadKbps: number, downloadKbps: number) => Promise<void>;
  onRemoveLimit?: (mac: string) => Promise<void>;
  isLimited?: boolean;
}

export const SpeedControl: React.FC<SpeedControlProps> = ({
  device,
  onClose,
  onApply,
  onRemoveLimit,
  isLimited = false
}) => {
  const [uploadMbps, setUploadMbps] = useState(1);
  const [downloadMbps, setDownloadMbps] = useState(1);
  const [isApplying, setIsApplying] = useState(false);
  const [isUnlimited, setIsUnlimited] = useState(!isLimited);

  const toKbps = (mbps: number) => Math.round(mbps * 1024);

  const handleApply = async () => {
    setIsApplying(true);
    try {
      if (isUnlimited) {
        if (onRemoveLimit) {
          await onRemoveLimit(device.mac_address);
        } else {
          await onApply(device.mac_address, 0, 0);
        }
      } else {
        await onApply(device.mac_address, toKbps(uploadMbps), toKbps(downloadMbps));
      }
      onClose();
    } catch (error) {
      console.error('Error applying speed limit:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to apply speed limit');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-xl">
              <Gauge className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Speed Limit
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{device.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-xl p-3 text-sm text-sky-900 dark:text-sky-200 flex gap-2">
            <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Uses MITM throttling (same technique as NetCut). Device stays online but speed is
              capped. Run as Administrator.
            </p>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Unlimited speed
            </span>
            <button
              onClick={() => setIsUnlimited(!isUnlimited)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                isUnlimited ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  isUnlimited ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {!isUnlimited && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Upload Mbps
                </label>
                <input
                  type="number"
                  value={uploadMbps}
                  onChange={(e) => setUploadMbps(Number(e.target.value))}
                  min="0.1"
                  max="1000"
                  step="0.1"
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Download Mbps
                </label>
                <input
                  type="number"
                  value={downloadMbps}
                  onChange={(e) => setDownloadMbps(Number(e.target.value))}
                  min="0.1"
                  max="1000"
                  step="0.1"
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 text-white rounded-xl transition-colors disabled:cursor-not-allowed font-medium"
            >
              {isApplying ? 'Applying…' : isUnlimited ? 'Remove limit' : 'Apply limit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
