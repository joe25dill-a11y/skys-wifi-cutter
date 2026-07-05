import { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  Zap,
  Power,
  Radio,
  Timer,
  Activity,
  Users,
  Gauge,
  Bookmark
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../config/api';

interface HotspotClient {
  ip: string;
  mac: string;
  state?: string;
}

interface SsidPreset {
  id: string;
  label: string;
  ssid: string;
  password?: string;
}

interface HotspotStatus {
  isActive: boolean;
  isTrafficBlocked: boolean;
  ssid: string;
  password?: string;
  connectedDevices: number;
  clients?: HotspotClient[];
  constantLagActive?: boolean;
  constantLagMs?: number;
  bandwidthCap?: { uploadKbps: number; downloadKbps: number } | null;
  ssidPresets?: SsidPreset[];
}

export function HotspotControl({ advancedOnly = false }: { advancedOnly?: boolean }) {
  const [hotspotStatus, setHotspotStatus] = useState<HotspotStatus>({
    isActive: false,
    isTrafficBlocked: false,
    ssid: 'Xbox-LagControl',
    connectedDevices: 0
  });
  const [ssid, setSsid] = useState('Xbox-LagControl');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [pulseCount, setPulseCount] = useState(5);
  const [freezeDuration, setFreezeDuration] = useState(150);
  const [lagMs, setLagMs] = useState(150);
  const [capUpload, setCapUpload] = useState(512);
  const [capDownload, setCapDownload] = useState(2048);

  const fetchStatus = async () => {
    try {
      const data = await apiFetch<HotspotStatus>('/hotspot/status');
      setHotspotStatus(data);
      if (data.password) setPassword(data.password);
      if (data.ssid) setSsid(data.ssid);
    } catch (error) {
      console.error('Failed to fetch hotspot status:', error);
    }
  };

  useEffect(() => {
    fetchStatus();
    apiFetch<{ defaultHotspotSsid?: string; defaultHotspotPassword?: string }>('/settings')
      .then((s) => {
        if (s.defaultHotspotSsid) setSsid(s.defaultHotspotSsid);
        if (s.defaultHotspotPassword) setPassword(s.defaultHotspotPassword);
      })
      .catch(() => null);
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const startHotspot = async () => {
    if (!password || password.length < 8) {
      setMessage('✗ Set an 8+ character password first (Tools → Settings can generate one)');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const data = await apiFetch<{ success: boolean; ssid?: string; message?: string }>(
        '/hotspot/start',
        {
          method: 'POST',
          body: JSON.stringify({ ssid, password })
        }
      );

      if (data.success) {
        setMessage(`✓ Hotspot "${data.ssid}" started! Connect your Xbox now.`);
        await fetchStatus();
      } else {
        setMessage(`✗ ${data.message}`);
      }
    } catch (error) {
      setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const stopHotspot = async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await apiFetch<{ success: boolean; message?: string }>('/hotspot/stop', {
        method: 'POST'
      });

      if (data.success) {
        setMessage('✓ Hotspot stopped');
        await fetchStatus();
      } else {
        setMessage(`✗ ${data.message}`);
      }
    } catch (error) {
      setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const freezeConnection = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ success: boolean }>('/hotspot/freeze', {
        method: 'POST',
        body: JSON.stringify({ durationMs: null })
      });

      if (data.success) {
        setMessage('❄️ Connection FROZEN - Xbox will freeze and disconnect');
        await fetchStatus();
      }
    } catch (error) {
      setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const unfreezeConnection = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ success: boolean }>('/hotspot/unfreeze', {
        method: 'POST'
      });

      if (data.success) {
        setMessage('✓ Connection UNFROZEN - Traffic restored');
        await fetchStatus();
      }
    } catch (error) {
      setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const pulseLag = async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await apiFetch<{ success: boolean }>('/hotspot/pulse', {
        method: 'POST',
        body: JSON.stringify({
          count: pulseCount,
          freezeMs: freezeDuration,
          unfreezeMs: 100
        })
      });

      if (data.success) {
        setMessage(`⚡ Pulse complete - ${pulseCount} lag spikes triggered`);
      }
    } catch (error) {
      setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const quickFreeze = async (durationMs: number) => {
    try {
      await apiFetch('/hotspot/freeze', {
        method: 'POST',
        body: JSON.stringify({ durationMs })
      });

      setMessage(`❄️ ${durationMs}ms freeze applied`);
      toast.success(`${durationMs}ms freeze applied`);
      await fetchStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Freeze failed');
    }
  };

  const applyPreset = async (presetId: string) => {
    try {
      const data = await apiFetch<{ success: boolean; preset: SsidPreset }>('/hotspot/preset', {
        method: 'POST',
        body: JSON.stringify({ presetId })
      });
      if (data.preset) {
        setSsid(data.preset.ssid);
        if (data.preset.password) setPassword(data.preset.password);
        toast.success(`Preset: ${data.preset.label}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preset failed');
    }
  };

  const toggleConstantLag = async () => {
    setLoading(true);
    try {
      if (hotspotStatus.constantLagActive) {
        await apiFetch('/hotspot/constant-lag/stop', { method: 'POST' });
        toast.success('Constant lag stopped');
      } else {
        await apiFetch('/hotspot/constant-lag/start', {
          method: 'POST',
          body: JSON.stringify({ lagMs })
        });
        toast.success(`Constant lag — ${lagMs}ms`);
      }
      await fetchStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Constant lag failed');
    } finally {
      setLoading(false);
    }
  };

  const applyBandwidthCap = async () => {
    setLoading(true);
    try {
      await apiFetch('/hotspot/bandwidth-cap', {
        method: 'POST',
        body: JSON.stringify({ uploadKbps: capUpload, downloadKbps: capDownload })
      });
      toast.success(`Cap set: ${capUpload}/${capDownload} Kbps`);
      await fetchStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bandwidth cap failed');
    } finally {
      setLoading(false);
    }
  };

  const clearBandwidthCap = async () => {
    try {
      await apiFetch('/hotspot/bandwidth-cap/clear', { method: 'POST' });
      toast.success('Bandwidth cap removed');
      await fetchStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Clear cap failed');
    }
  };

  const presets = hotspotStatus.ssidPresets ?? [];

  if (advancedOnly && !hotspotStatus.isActive) {
    return (
      <div className="rounded-xl border border-indigo-500/20 bg-slate-900/40 p-4 text-sm text-indigo-200/80">
        Start the hotspot above first, then open these tools for constant lag, bandwidth cap, and client list.
      </div>
    );
  }

  if (advancedOnly && hotspotStatus.isActive) {
    return (
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl shadow-2xl p-6 border border-indigo-500/30 text-white space-y-4">
        {(hotspotStatus.clients?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-indigo-500/30 bg-slate-900/50 p-4">
            <h3 className="font-bold text-indigo-200 mb-3 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Connected Clients ({hotspotStatus.connectedDevices})
            </h3>
            <div className="space-y-2 text-sm">
              {hotspotStatus.clients?.map((client) => (
                <div
                  key={client.mac}
                  className="flex justify-between font-mono text-xs bg-slate-800/60 rounded-lg px-3 py-2"
                >
                  <span>{client.ip}</span>
                  <span className="text-indigo-300">{client.mac}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-orange-900/30 rounded-xl p-4 border border-orange-500/40">
            <h3 className="font-bold text-orange-200 mb-3 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Constant Lag
            </h3>
            <input
              type="number"
              value={lagMs}
              onChange={(e) => setLagMs(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 mb-3 border border-orange-400/40 rounded bg-slate-900/60 text-white"
              min="50"
              max="2000"
              step="50"
            />
            <button
              onClick={toggleConstantLag}
              disabled={loading}
              className={`w-full font-bold py-3 rounded-lg ${
                hotspotStatus.constantLagActive ? 'bg-emerald-600' : 'bg-orange-600'
              }`}
            >
              {hotspotStatus.constantLagActive ? 'Stop constant lag' : 'Start constant lag'}
            </button>
          </div>
          <div className="bg-cyan-900/30 rounded-xl p-4 border border-cyan-500/40">
            <h3 className="font-bold text-cyan-200 mb-3 flex items-center gap-2">
              <Gauge className="w-5 h-5" />
              Bandwidth Cap (Kbps)
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input
                type="number"
                value={capUpload}
                onChange={(e) => setCapUpload(parseInt(e.target.value, 10))}
                className="px-3 py-2 rounded bg-slate-900/60 border border-cyan-500/30 text-white"
                placeholder="Upload"
              />
              <input
                type="number"
                value={capDownload}
                onChange={(e) => setCapDownload(parseInt(e.target.value, 10))}
                className="px-3 py-2 rounded bg-slate-900/60 border border-cyan-500/30 text-white"
                placeholder="Download"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={applyBandwidthCap} disabled={loading} className="flex-1 bg-cyan-600 py-2 rounded-lg font-bold">
                Apply
              </button>
              {hotspotStatus.bandwidthCap && (
                <button onClick={clearBandwidthCap} className="px-3 border border-cyan-500/40 rounded-lg">
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl shadow-2xl p-6 border border-indigo-500/30 text-white">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${hotspotStatus.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
            {hotspotStatus.isActive ? (
              <Wifi className={`w-6 h-6 ${hotspotStatus.isTrafficBlocked ? 'text-red-600' : 'text-green-600'}`} />
            ) : (
              <WifiOff className="w-6 h-6 text-gray-400" />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold">Hotspot Hub</h2>
            <p className="text-sm text-indigo-200/80">
              {hotspotStatus.isActive
                ? hotspotStatus.isTrafficBlocked
                  ? '❄️ FROZEN - Traffic Blocked'
                  : `✓ Active - ${hotspotStatus.connectedDevices} device(s) connected`
                : 'Inactive'}
            </p>
          </div>
        </div>

        <div className={`px-4 py-2 rounded-lg ${
          hotspotStatus.isActive
            ? hotspotStatus.isTrafficBlocked
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-500'
        } font-semibold`}>
          {hotspotStatus.isActive
            ? hotspotStatus.isTrafficBlocked
              ? 'FROZEN'
              : 'ACTIVE'
            : 'OFFLINE'}
        </div>
      </div>

      {!hotspotStatus.isActive ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-2 mb-3">
              <Radio className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900">Hotspot Mode (Like Arcai Router)</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Create a WiFi network that your Xbox connects to. This gives you COMPLETE control over all traffic with instant freeze/unfreeze capabilities.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {presets.length > 0 && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-indigo-200 mb-2 flex items-center gap-1">
                  <Bookmark className="w-4 h-4" />
                  SSID Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600/40 hover:bg-indigo-500/60 border border-indigo-400/30"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-indigo-200 mb-1">
                Network Name (SSID)
              </label>
              <input
                type="text"
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                className="w-full px-3 py-2 border border-indigo-500/40 rounded-lg bg-slate-900/60 text-white focus:ring-2 focus:ring-indigo-400"
                placeholder="Xbox-LagControl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-indigo-200 mb-1">
                Password
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-indigo-500/40 rounded-lg bg-slate-900/60 text-white focus:ring-2 focus:ring-indigo-400"
                placeholder="8+ character password"
              />
            </div>
          </div>

          <button
            onClick={startHotspot}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Power className="w-5 h-5" />
            {loading ? 'Starting...' : 'Start Hotspot'}
          </button>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              ⚠️ <strong>Important:</strong> After starting, connect your Xbox to the "{ssid}" WiFi network using password "{password}". Then use the controls below for instant lag control.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-4">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div>
                <p className="font-semibold text-green-100">
                  Hotspot: {hotspotStatus.ssid}
                </p>
                <p className="text-sm text-green-200/80 mt-1">
                  Password: {password} · {hotspotStatus.connectedDevices} client(s)
                  {hotspotStatus.constantLagActive && ` · Lag ${hotspotStatus.constantLagMs}ms`}
                  {hotspotStatus.bandwidthCap &&
                    ` · Cap ${hotspotStatus.bandwidthCap.uploadKbps}/${hotspotStatus.bandwidthCap.downloadKbps} Kbps`}
                </p>
              </div>
              <button
                onClick={stopHotspot}
                disabled={loading}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
              >
                <Power className="w-4 h-4" />
                Stop Hotspot
              </button>
            </div>
          </div>

          {(hotspotStatus.clients?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-indigo-500/30 bg-slate-900/50 p-4">
              <h3 className="font-bold text-indigo-200 mb-3 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Connected Clients
              </h3>
              <div className="space-y-2 text-sm">
                {hotspotStatus.clients?.map((client) => (
                  <div
                    key={client.mac}
                    className="flex justify-between font-mono text-xs bg-slate-800/60 rounded-lg px-3 py-2"
                  >
                    <span>{client.ip}</span>
                    <span className="text-indigo-300">{client.mac}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-red-50 rounded-lg p-4 border-2 border-red-200">
              <h3 className="font-bold text-red-900 mb-3 flex items-center gap-2 text-lg">
                <WifiOff className="w-6 h-6" />
                Turn Off Connection
              </h3>
              <p className="text-sm text-red-700 mb-4">
                Completely blocks Xbox internet. Freezes in-game, kicks after 8-15 seconds.
              </p>
              {!hotspotStatus.isTrafficBlocked ? (
                <button
                  onClick={freezeConnection}
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg shadow-lg"
                >
                  <WifiOff className="w-6 h-6" />
                  TURN OFF
                </button>
              ) : (
                <div>
                  <button
                    onClick={unfreezeConnection}
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg shadow-lg mb-2"
                  >
                    <Wifi className="w-6 h-6" />
                    TURN ON
                  </button>
                  <div className="bg-red-100 rounded p-2 text-center">
                    <p className="text-red-900 font-semibold text-sm">CONNECTION IS OFF</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
              <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2 text-lg">
                <Timer className="w-6 h-6" />
                Timed Freeze
              </h3>
              <p className="text-sm text-blue-700 mb-4">
                Turns off for specific time, then auto-turns back on.
              </p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[150, 300, 500, 1000].map(ms => (
                  <button
                    key={ms}
                    onClick={() => quickFreeze(ms)}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-2 rounded text-sm transition-colors shadow"
                  >
                    {ms}ms
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => quickFreeze(2000)}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-2 rounded text-sm transition-colors"
                >
                  2 sec
                </button>
                <button
                  onClick={() => quickFreeze(5000)}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-2 rounded text-sm transition-colors"
                >
                  5 sec
                </button>
              </div>
            </div>

            <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200">
              <h3 className="font-bold text-purple-900 mb-3 flex items-center gap-2 text-lg">
                <Zap className="w-6 h-6" />
                Lag Spike (Pulse)
              </h3>
              <p className="text-sm text-purple-700 mb-4">
                Rapid on/off cycles. Makes you lag around in-game.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-purple-900 mb-1">
                    Pulse Count
                  </label>
                  <input
                    type="number"
                    value={pulseCount}
                    onChange={(e) => setPulseCount(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border-2 border-purple-300 rounded font-semibold"
                    min="1"
                    max="20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-purple-900 mb-1">
                    Duration (ms)
                  </label>
                  <input
                    type="number"
                    value={freezeDuration}
                    onChange={(e) => setFreezeDuration(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border-2 border-purple-300 rounded font-semibold"
                    min="50"
                    max="1000"
                    step="50"
                  />
                </div>
              </div>
              <button
                onClick={pulseLag}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg shadow-lg"
              >
                <Zap className="w-6 h-6" />
                START PULSE
              </button>
            </div>

            <div className="bg-orange-900/30 rounded-xl p-4 border border-orange-500/40">
              <h3 className="font-bold text-orange-200 mb-3 flex items-center gap-2 text-lg">
                <Activity className="w-6 h-6" />
                Constant Lag
              </h3>
              <p className="text-sm text-orange-200/80 mb-4">
                Applies steady lag to all hotspot clients via native lag switch.
              </p>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-orange-200 mb-1">
                  Lag Amount (ms)
                </label>
                <input
                  type="number"
                  value={lagMs}
                  onChange={(e) => setLagMs(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 border border-orange-400/40 rounded font-semibold bg-slate-900/60 text-white"
                  min="50"
                  max="2000"
                  step="50"
                />
              </div>
              <button
                onClick={toggleConstantLag}
                disabled={loading}
                className={`w-full font-bold py-4 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg shadow-lg ${
                  hotspotStatus.constantLagActive
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-orange-600 hover:bg-orange-500'
                }`}
              >
                <Activity className="w-6 h-6" />
                {hotspotStatus.constantLagActive ? 'STOP CONSTANT LAG' : 'START CONSTANT LAG'}
              </button>
            </div>

            <div className="bg-cyan-900/30 rounded-xl p-4 border border-cyan-500/40 md:col-span-2">
              <h3 className="font-bold text-cyan-200 mb-3 flex items-center gap-2 text-lg">
                <Gauge className="w-6 h-6" />
                Hotspot Bandwidth Cap
              </h3>
              <p className="text-sm text-cyan-200/80 mb-4">
                Throttle upload/download for every device on the hotspot subnet.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-cyan-200 mb-1">Upload Kbps</label>
                  <input
                    type="number"
                    value={capUpload}
                    onChange={(e) => setCapUpload(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded bg-slate-900/60 border border-cyan-500/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-cyan-200 mb-1">Download Kbps</label>
                  <input
                    type="number"
                    value={capDownload}
                    onChange={(e) => setCapDownload(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded bg-slate-900/60 border border-cyan-500/30 text-white"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={applyBandwidthCap}
                  disabled={loading}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg"
                >
                  Apply Cap
                </button>
                {hotspotStatus.bandwidthCap && (
                  <button
                    onClick={clearBandwidthCap}
                    className="px-4 py-3 rounded-lg border border-cyan-500/40 text-cyan-200"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 bg-gray-100 rounded-lg p-3 border border-gray-300">
            <h4 className="font-bold text-gray-900 mb-2 text-sm">Quick Guide:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
              <div className="flex gap-2">
                <span className="font-bold text-red-600">TURN OFF:</span>
                <span>Freezes Xbox completely (spam it for lag spikes)</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-blue-600">TIMED:</span>
                <span>Auto on/off for precise timing</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-purple-600">PULSE:</span>
                <span>Multiple rapid lag spikes (best for lag comp)</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-orange-600">CONSTANT:</span>
                <span>Steady lag (use device controls currently)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className={`mt-4 p-3 rounded-lg ${
          message.includes('✗')
            ? 'bg-red-50 text-red-800 border border-red-200'
            : message.includes('❄️')
            ? 'bg-blue-50 text-blue-800 border border-blue-200'
            : 'bg-green-50 text-green-800 border border-green-200'
        }`}>
          <p className="text-sm font-medium">{message}</p>
        </div>
      )}
    </div>
  );
}
