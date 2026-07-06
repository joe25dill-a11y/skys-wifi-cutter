"""Resolve Windows Npcap/Scapy interface names from NetConnectionID or local IP."""

import logging
import sys
import warnings

warnings.filterwarnings("ignore", message=".*WinPcap.*")
warnings.filterwarnings("ignore", message=".*deprecated.*")
logging.getLogger("scapy").setLevel(logging.ERROR)


def resolve_iface(name: str, local_ip: str = "") -> str:
    if sys.platform != "win32":
        return name

    try:
        from scapy.arch.windows import get_windows_if_list
    except ImportError:
        return name

    ifaces = get_windows_if_list()
    name_l = (name or "").lower().strip()
    local_ip = (local_ip or "").strip()

    if local_ip:
        for iface in ifaces:
            ips = iface.get("ips") or []
            if local_ip in ips:
                return iface.get("name") or name

    for iface in ifaces:
        desc = (iface.get("description") or "").lower()
        ifname = (iface.get("name") or "").lower()
        guid = (iface.get("guid") or "").lower()
        if not name_l:
            continue
        if name_l in desc or name_l in ifname or desc in name_l or ifname in name_l:
            return iface.get("name") or name
        if name_l in guid:
            return iface.get("name") or name

    # Common Windows aliases
    aliases = {
        "ethernet": ["realtek", "intel", "gbe", "ethernet", "i225", "i219"],
        "wi-fi": ["wi-fi", "wifi", "wireless", "wlan", "802.11"],
        "wifi": ["wi-fi", "wifi", "wireless", "wlan", "802.11"],
    }
    for key, hints in aliases.items():
        if key in name_l or name_l in key:
            for iface in ifaces:
                desc = (iface.get("description") or "").lower()
                if any(h in desc for h in hints):
                    return iface.get("name") or name

    return name
