#!/usr/bin/env python3
"""Watch for ARP spoofing against the default gateway (someone impersonating the router)."""

import json
import os
import sys
import time
import warnings

warnings.filterwarnings('ignore', message='.*WinPcap.*')
warnings.filterwarnings('ignore', message='.*deprecated.*')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from scapy.all import ARP, Ether, conf, sniff
except ImportError:
    print(json.dumps({"type": "error", "message": "scapy not installed"}), flush=True)
    sys.exit(1)

from iface_util import resolve_iface


def norm_mac(mac: str) -> str:
    return mac.upper().replace("-", ":")


def main():
    if len(sys.argv) < 4:
        print("Usage: arp_watch.py <iface> <local_ip> <gateway_ip> [gateway_mac]", file=sys.stderr)
        sys.exit(1)

    iface = resolve_iface(sys.argv[1], sys.argv[2])
    gateway_ip = sys.argv[3]
    gateway_mac = norm_mac(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else None
    local_macs = set()

    conf.iface = iface
    conf.verb = 0

    print(json.dumps({"type": "ready", "gatewayIp": gateway_ip, "gatewayMac": gateway_mac}), flush=True)

    last_alert = {}

    def emit_alert(kind, sender_mac, victim_ip, detail):
        key = f"{kind}:{sender_mac}:{victim_ip}"
        now = time.time()
        if now - last_alert.get(key, 0) < 30:
            return
        last_alert[key] = now
        print(
            json.dumps(
                {
                    "type": "alert",
                    "kind": kind,
                    "senderMac": sender_mac,
                    "victimIp": victim_ip,
                    "detail": detail,
                }
            ),
            flush=True,
        )

    def on_packet(pkt):
        if ARP not in pkt:
            return
        arp = pkt[ARP]
        op = int(getattr(arp, "op", 0) or 0)
        if op not in (1, 2):  # request or reply
            return

        psrc = getattr(arp, "psrc", None) or ""
        hwsrc = norm_mac(getattr(arp, "hwsrc", "") or "")
        pdst = getattr(arp, "pdst", None) or ""

        if not hwsrc or hwsrc == "00:00:00:00:00:00":
            return

        # Gateway impersonation: packet claims gateway IP with wrong MAC
        if psrc == gateway_ip and gateway_mac and hwsrc != gateway_mac:
            if hwsrc not in local_macs:
                emit_alert(
                    "gateway_spoof",
                    hwsrc,
                    gateway_ip,
                    f"Device {hwsrc} claimed to be router {gateway_ip} (real MAC {gateway_mac})",
                )

        # Someone telling others the gateway is at a wrong MAC (MITM setup)
        if pdst == gateway_ip and psrc != gateway_ip and gateway_mac:
            if hwsrc != gateway_mac and hwsrc not in local_macs:
                emit_alert(
                    "gateway_redirect",
                    hwsrc,
                    gateway_ip,
                    f"{hwsrc} sent ARP about router {gateway_ip} — possible cut/spoof attempt",
                )

    try:
        sniff(filter="arp", prn=on_packet, store=False)
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(json.dumps({"type": "error", "message": str(exc)}), flush=True)
        sys.exit(2)


if __name__ == "__main__":
    main()
