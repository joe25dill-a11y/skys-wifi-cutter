const PCAP_NOISE = [
  /winpcap is now deprecated/i,
  /please use npcap instead/i,
  /pcap service is not running/i,
  /could not start the pcap service/i
];

export function isNoisyPcapLog(text) {
  const line = String(text || '').trim();
  if (!line) return true;
  return PCAP_NOISE.some((re) => re.test(line));
}

export function filterNoisyPcapLog(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isNoisyPcapLog(line))
    .join('\n');
}
