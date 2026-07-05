/** One-click gaming profiles — port blocks + optional lag hints. */
export const GAME_PRESETS = [
  {
    id: 'cod',
    label: 'Call of Duty',
    description: 'Block voice/chat UDP ports commonly used by COD',
    ports: [3074, 3075, 3076, 27015, 27016, 27017, 27018, 27019, 27020],
    lagMs: 120
  },
  {
    id: 'fortnite',
    label: 'Fortnite',
    description: 'Throttle Epic voice and matchmaking ports',
    ports: [5222, 5795, 5800, 7777, 7778, 7787, 9000, 9001],
    lagMs: 100
  },
  {
    id: 'apex',
    label: 'Apex Legends',
    description: 'EA/Respawn UDP ports',
    ports: [9960, 9961, 9962, 9963, 9964, 9965, 9966, 9967, 9968, 9969, 37000, 37001, 37002],
    lagMs: 130
  },
  {
    id: 'valorant',
    label: 'Valorant',
    description: 'Riot client and game traffic',
    ports: [7000, 7001, 7002, 7003, 7004, 7005, 7006, 7007, 7008, 7009, 7010, 7011, 7012, 7013, 7014, 7015],
    lagMs: 90
  },
  {
    id: 'minecraft',
    label: 'Minecraft',
    description: 'Java/Bedrock default ports',
    ports: [25565, 19132, 19133],
    lagMs: 200
  },
  {
    id: 'xbox-live',
    label: 'Xbox Live',
    description: 'Core Xbox Live ports',
    ports: [88, 3074, 53, 500, 3544, 4500],
    lagMs: 150
  }
];

export function getGamePresets() {
  return GAME_PRESETS.map(({ id, label, description, ports, lagMs }) => ({
    id,
    label,
    description,
    portCount: ports.length,
    lagMs
  }));
}

export function getGamePreset(id) {
  return GAME_PRESETS.find((p) => p.id === id) || null;
}
