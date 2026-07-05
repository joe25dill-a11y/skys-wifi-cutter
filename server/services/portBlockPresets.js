export const PORT_BLOCK_PRESETS = {
  xbox: {
    label: 'Xbox Live',
    ports: [3074, 3075, 3076, 88, 500, 3544, 4500, 53]
  },
  psn: {
    label: 'PlayStation Network',
    ports: [3478, 3479, 3480, 3658, 5223, 5222, 9293, 53]
  },
  fortnite: {
    label: 'Fortnite / Epic',
    ports: [5222, 5795, 5843, 7777, 9000, 9999, 443, 80]
  },
  minecraft: {
    label: 'Minecraft',
    ports: [25565, 19132, 19133]
  },
  discord: {
    label: 'Discord voice',
    ports: [5000, 5001, 5002, 5003, 5004, 5005, 6463]
  },
  roblox: {
    label: 'Roblox',
    ports: [49152, 49153, 49154, 49155, 53640, 53641, 53642, 53643]
  },
  doh: {
    label: 'DNS-over-HTTPS',
    ports: [443, 853]
  },
  vpn: {
    label: 'Common VPN',
    ports: [1194, 1723, 4500, 500, 51820, 1701]
  }
};

export function resolveBlockedPorts({ preset, ports = [] } = {}) {
  if (preset && PORT_BLOCK_PRESETS[preset]) {
    return {
      preset,
      label: PORT_BLOCK_PRESETS[preset].label,
      ports: [...PORT_BLOCK_PRESETS[preset].ports]
    };
  }

  const normalized = [...new Set(ports.map((p) => Number(p)).filter((p) => p > 0 && p <= 65535))];
  if (normalized.length === 0) {
    throw new Error('Provide a preset or at least one valid port (1-65535)');
  }

  return {
    preset: preset || 'custom',
    label: 'Custom ports',
    ports: normalized.sort((a, b) => a - b)
  };
}
