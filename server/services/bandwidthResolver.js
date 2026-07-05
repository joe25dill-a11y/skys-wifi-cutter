import { normalizeMac } from './arpTable.js';

const FLOW_STALE_MS = 15_000;
const MITM_STALE_MS = 60_000;

function pickFlowRatesForMac(mac, ratesByIp, ipToMac, now) {
  let upload = 0;
  let download = 0;
  let fresh = false;

  for (const [ip, rates] of ratesByIp.entries()) {
    if (ipToMac.get(ip) !== mac) continue;
    if (!rates || now - rates.updatedAt > FLOW_STALE_MS) continue;
    fresh = true;
    upload = Math.max(upload, Number(rates.upload) || 0);
    download = Math.max(download, Number(rates.download) || 0);
  }

  return fresh ? { upload, download } : null;
}

function buildIpToMac(devices, macByIp, ipByMac) {
  const ipToMac = new Map();

  for (const [ip, mac] of macByIp.entries()) {
    ipToMac.set(ip, normalizeMac(mac));
  }

  for (const device of devices) {
    const mac = normalizeMac(device.mac_address);
    const liveIp = ipByMac.get(mac);
    if (liveIp) {
      ipToMac.set(liveIp, mac);
    }
    ipToMac.set(device.ip_address, mac);
  }

  return ipToMac;
}

function pickMitmRatesForMac(mac, mitmRatesByMac, mitmRatesByIp, ipToMac, now) {
  const normalized = normalizeMac(mac);
  const direct = mitmRatesByMac.get(normalized);
  if (direct && now - direct.updatedAt <= MITM_STALE_MS) {
    return { upload: direct.upload, download: direct.download };
  }

  let upload = 0;
  let download = 0;
  let fresh = false;

  for (const [ip, rates] of mitmRatesByIp.entries()) {
    if (ipToMac.get(ip) !== normalized) continue;
    if (!rates || now - rates.updatedAt > MITM_STALE_MS) continue;
    fresh = true;
    upload = Math.max(upload, Number(rates.upload) || 0);
    download = Math.max(download, Number(rates.download) || 0);
  }

  return fresh ? { upload, download } : null;
}

function mergeDirections(a, b) {
  const left = a || { upload: 0, download: 0 };
  const right = b || { upload: 0, download: 0 };
  return {
    upload: Math.max(left.upload, right.upload),
    download: Math.max(left.download, right.download)
  };
}

export function resolvePerDeviceBandwidth(
  devices,
  flowRatesByIp,
  mitmRatesByIp,
  arpMaps,
  mitmRatesByMac = new Map(),
  meteringMacs = []
) {
  const now = Date.now();
  const ipToMac = buildIpToMac(devices, arpMaps.macByIp, arpMaps.ipByMac);
  const meteringSet = new Set(meteringMacs.map((m) => normalizeMac(m)));

  return devices.map((device) => {
    const mac = normalizeMac(device.mac_address);
    const liveIp = arpMaps.ipByMac.get(mac) || device.ip_address;
    const flow = pickFlowRatesForMac(mac, flowRatesByIp, ipToMac, now);
    const mitm = pickMitmRatesForMac(mac, mitmRatesByMac, mitmRatesByIp, ipToMac, now);
    const merged = mergeDirections(flow, mitm);
    const isMetering = meteringSet.has(mac);
    const hasData = merged.upload > 0 || merged.download > 0;

    let status = 'none';
    if (isMetering) status = 'metering';
    else if (mitm && hasData) status = 'live';
    else if (flow && hasData) status = 'passive';

    return {
      ip: liveIp,
      mac: device.mac_address,
      name: device.name,
      upload: Number(merged.upload.toFixed(3)),
      download: Number(merged.download.toFixed(3)),
      status,
      isMetering
    };
  });
}
