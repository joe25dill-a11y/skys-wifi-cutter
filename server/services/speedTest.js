import https from 'https';
import http from 'http';

const DOWNLOAD_BYTES = 25_000_000;
const UPLOAD_BYTES = 5_000_000;

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
    if (options.timeout) {
      req.setTimeout(options.timeout, () => {
        req.destroy(new Error('Request timed out'));
      });
    }
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function readStream(res) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const start = Date.now();
    res.on('data', (chunk) => {
      bytes += chunk.length;
    });
    res.on('end', () => {
      const seconds = Math.max(0.001, (Date.now() - start) / 1000);
      resolve({ bytes, seconds });
    });
    res.on('error', reject);
  });
}

function writeStream(res, totalBytes) {
  return new Promise((resolve, reject) => {
    const chunk = Buffer.alloc(64 * 1024, 'x');
    let sent = 0;
    const start = Date.now();

    const pump = () => {
      while (sent < totalBytes) {
        const remaining = totalBytes - sent;
        const size = Math.min(chunk.length, remaining);
        const ok = res.write(chunk.subarray(0, size));
        sent += size;
        if (!ok) {
          res.once('drain', pump);
          return;
        }
      }
      res.end();
    };

    res.on('finish', () => {
      const seconds = Math.max(0.001, (Date.now() - start) / 1000);
      resolve({ bytes: sent, seconds });
    });
    res.on('error', reject);
    pump();
  });
}

function toMbps(bytes, seconds) {
  return Number(((bytes * 8) / (seconds * 1_000_000)).toFixed(2));
}

export async function runInternetSpeedTest() {
  const startedAt = new Date().toISOString();
  const errors = [];

  let downloadMbps = 0;
  let uploadMbps = 0;
  let pingMs = null;

  try {
    const pingStart = Date.now();
    const pingRes = await request('https://speed.cloudflare.com/cdn-cgi/trace', { method: 'GET' });
    await readStream(pingRes);
    pingMs = Date.now() - pingStart;
  } catch (error) {
    errors.push(`Ping: ${error.message}`);
  }

  try {
    const downRes = await request(
      `https://speed.cloudflare.com/__down?bytes=${DOWNLOAD_BYTES}`,
      { method: 'GET', timeout: 60_000 }
    );
    const { bytes, seconds } = await readStream(downRes);
    downloadMbps = toMbps(bytes, seconds);
  } catch (error) {
    errors.push(`Download: ${error.message}`);
  }

  try {
    const upRes = await request('https://speed.cloudflare.com/__up', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(UPLOAD_BYTES)
      },
      timeout: 60_000
    });
    const { bytes, seconds } = await writeStream(upRes, UPLOAD_BYTES);
    uploadMbps = toMbps(bytes, seconds);
  } catch (error) {
    errors.push(`Upload: ${error.message}`);
  }

  return {
    provider: 'Cloudflare',
    downloadMbps,
    uploadMbps,
    pingMs,
    startedAt,
    finishedAt: new Date().toISOString(),
    success: downloadMbps > 0 || uploadMbps > 0,
    error: errors.length ? errors.join('; ') : null,
    note: 'Tests your PC internet connection (like speedtest.net), not individual LAN devices.'
  };
}
