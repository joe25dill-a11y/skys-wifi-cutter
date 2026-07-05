export const DNS_BLOCK_PRESETS = {
  full: {
    label: 'Full DNS lock',
    domains: ['*']
  },
  social: {
    label: 'Social media',
    domains: [
      'facebook.com',
      'fb.com',
      'instagram.com',
      'tiktok.com',
      'twitter.com',
      'x.com',
      'snapchat.com',
      'reddit.com',
      'threads.net',
      'pinterest.com'
    ]
  },
  gaming: {
    label: 'Online gaming',
    domains: [
      'epicgames.com',
      'roblox.com',
      'minecraft.net',
      'steampowered.com',
      'battle.net',
      'xboxlive.com',
      'playstation.com',
      'riotgames.com',
      'ea.com',
      'activision.com'
    ]
  },
  streaming: {
    label: 'Streaming & video',
    domains: [
      'netflix.com',
      'youtube.com',
      'youtu.be',
      'twitch.tv',
      'hulu.com',
      'disneyplus.com',
      'spotify.com',
      'max.com',
      'primevideo.com'
    ]
  },
  adult: {
    label: 'Adult content (common)',
    domains: ['pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com']
  },
  whitelist_school: {
    label: 'School mode (allow list)',
    domains: [
      'google.com',
      'googleapis.com',
      'gstatic.com',
      'classroom.google.com',
      'khanacademy.org',
      'wikipedia.org',
      'microsoft.com',
      'office.com',
      'live.com'
    ],
    whitelist: true
  },
  doh_bypass: {
    label: 'Block DoH / VPN bypass',
    domains: [
      'dns.google',
      'dns.quad9.net',
      'cloudflare-dns.com',
      'mozilla.cloudflare-dns.com',
      'dns.nextdns.io'
    ]
  }
};

export function resolveBlockedDomains({ preset, domains = [] } = {}) {
  if (preset && DNS_BLOCK_PRESETS[preset]) {
    return {
      preset,
      label: DNS_BLOCK_PRESETS[preset].label,
      domains: [...DNS_BLOCK_PRESETS[preset].domains],
      selective: preset !== 'full',
      whitelist: Boolean(DNS_BLOCK_PRESETS[preset].whitelist)
    };
  }

  const normalized = [
    ...new Set(
      domains
        .map((d) => String(d).trim().toLowerCase().replace(/^\*\./, ''))
        .filter((d) => d.length > 0 && d.length <= 253)
    )
  ];

  if (normalized.length === 0) {
    return {
      preset: 'full',
      label: DNS_BLOCK_PRESETS.full.label,
      domains: ['*'],
      selective: false,
      whitelist: false
    };
  }

  return {
    preset: preset || 'custom',
    label: 'Custom domains',
    domains: normalized,
    selective: !normalized.includes('*'),
    whitelist: false
  };
}
