#!/usr/bin/env python3
"""Send corrective ARP replies when restoring a device."""

import sys

try:
    from scapy.all import ARP, Ether, conf, getmacbyip, sendp
except ImportError:
    print("Install scapy: pip install scapy", file=sys.stderr)
    sys.exit(1)


def normalize_mac(mac: str) -> str:
    return mac.replace("-", ":").lower()


def resolve_mac(ip: str) -> str | None:
    try:
        mac = getmacbyip(ip)
        if mac:
            return normalize_mac(mac)
    except Exception:
        pass
    return None


def main():
    if len(sys.argv) < 4:
        print("Usage: arp_restore.py <target_ip> <target_mac> <gateway_ip>", file=sys.stderr)
        sys.exit(1)

    target_ip = sys.argv[1]
    target_mac = normalize_mac(sys.argv[2])
    gateway_ip = sys.argv[3]

    conf.verb = 0

    gateway_mac = resolve_mac(gateway_ip)
    if not gateway_mac:
        print(f"Could not resolve gateway MAC for {gateway_ip}", file=sys.stderr)
        sys.exit(1)

    # Restore victim's view of the gateway.
    for _ in range(3):
        sendp(
            Ether(dst=target_mac)
            / ARP(
                op=2,
                pdst=target_ip,
                hwdst=target_mac,
                psrc=gateway_ip,
                hwsrc=gateway_mac,
            ),
            verbose=0,
        )

        sendp(
            Ether(dst=gateway_mac)
            / ARP(
                op=2,
                pdst=gateway_ip,
                hwdst=gateway_mac,
                psrc=target_ip,
                hwsrc=target_mac,
            ),
            verbose=0,
        )

    print(f"Restored ARP for {target_ip}", flush=True)


if __name__ == "__main__":
    main()
