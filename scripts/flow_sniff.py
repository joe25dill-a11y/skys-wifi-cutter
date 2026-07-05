#!/usr/bin/env python3
"""Passive LAN flow monitor — emits per-IP Mbps as JSON lines (NetCut-style metering)."""

import ipaddress
import json
import os
import sys
import threading
import time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from scapy.all import IP, conf, sniff
except ImportError:
    print("Install scapy: pip install scapy", file=sys.stderr)
    sys.exit(1)

from iface_util import resolve_iface


def main():
    if len(sys.argv) < 4:
        print("Usage: flow_sniff.py <iface> <local_ip> <cidr>", file=sys.stderr)
        sys.exit(1)

    local_ip = sys.argv[2]
    iface = resolve_iface(sys.argv[1], local_ip)
    cidr = sys.argv[3]

    try:
        network = ipaddress.ip_network(cidr, strict=False)
    except ValueError as exc:
        print(f"Invalid CIDR {cidr}: {exc}", file=sys.stderr)
        sys.exit(1)

    conf.iface = iface
    conf.verb = 0

    totals = defaultdict(lambda: {"rx": 0, "tx": 0})
    snapshot = defaultdict(lambda: {"rx": 0, "tx": 0})
    lock = threading.Lock()
    last_emit = time.time()
    interval = 2.0

    def in_lan(addr: str) -> bool:
        try:
            return ipaddress.ip_address(addr) in network
        except ValueError:
            return False

    def on_packet(pkt):
        if IP not in pkt:
            return
        ip = pkt[IP]
        nbytes = len(ip)
        if nbytes <= 0:
            nbytes = int(ip.len) if ip.len else len(pkt)
        src, dst = ip.src, ip.dst
        with lock:
            if in_lan(src) and src != local_ip:
                totals[src]["tx"] += nbytes
            if in_lan(dst) and dst != local_ip:
                totals[dst]["rx"] += nbytes

    def emit_rates():
        nonlocal last_emit
        while True:
            time.sleep(0.25)
            now = time.time()
            dt = now - last_emit
            if dt < interval:
                continue

            hosts = {}
            with lock:
                for host_ip, counts in totals.items():
                    prev = snapshot[host_ip]
                    drx = counts["rx"] - prev["rx"]
                    dtx = counts["tx"] - prev["tx"]
                    snapshot[host_ip] = {"rx": counts["rx"], "tx": counts["tx"]}
                    hosts[host_ip] = {
                        "download": round(max(0, (drx * 8) / (dt * 1024 * 1024)), 3),
                        "upload": round(max(0, (dtx * 8) / (dt * 1024 * 1024)), 3),
                    }

            print(json.dumps({"type": "rates", "hosts": hosts, "dt": round(dt, 2)}), flush=True)
            last_emit = now

    threading.Thread(target=emit_rates, daemon=True).start()
    print(json.dumps({"type": "ready", "iface": iface, "cidr": cidr}), flush=True)
    sniff(prn=on_packet, store=0, promisc=True, iface=iface)


if __name__ == "__main__":
    main()
