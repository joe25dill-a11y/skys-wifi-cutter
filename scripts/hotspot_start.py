"""Start Windows Mobile Hotspot via WinRT (requires Admin)."""
import argparse
import asyncio
import ctypes
import subprocess
import sys


def is_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


async def start_mobile_hotspot(ssid: str, password: str, configure: bool) -> str:
    from winrt.windows.networking.connectivity import NetworkInformation
    from winrt.windows.networking.networkoperators import (
        NetworkOperatorTetheringAccessPointConfiguration,
        NetworkOperatorTetheringManager,
        TetheringOperationStatus,
    )

    profile = NetworkInformation.get_internet_connection_profile()
    if profile is None:
        raise RuntimeError('No internet connection. Connect PC to WiFi or Ethernet first.')

    manager = NetworkOperatorTetheringManager.create_from_connection_profile(profile)
    if manager is None:
        raise RuntimeError('Mobile Hotspot not available on this PC.')

    if configure:
        config = NetworkOperatorTetheringAccessPointConfiguration()
        config.ssid = ssid
        config.passphrase = password
        cfg = await manager.configure_access_point_async(config)
        if cfg.status != TetheringOperationStatus.SUCCESS:
            print(f'WARN:ConfigureAccessPoint:{cfg.status}', file=sys.stderr)

    result = await manager.start_tethering_async()
    if result.status == TetheringOperationStatus.SUCCESS:
        return f'OK:MOBILE_HOTSPOT:{ssid}'

    raise RuntimeError(f'StartTethering:{result.status}')


def try_hosted_network(ssid: str, password: str) -> str:
    drivers = subprocess.run(
        ['netsh', 'wlan', 'show', 'drivers'],
        capture_output=True,
        text=True,
        check=False,
    )
    if 'Hosted network supported  : Yes' not in drivers.stdout:
        raise RuntimeError('Hosted network not supported')

    subprocess.run(
        [
            'netsh', 'wlan', 'set', 'hostednetwork',
            f'ssid={ssid}', f'key={password}', 'keyUsage=persistent',
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    subprocess.run(['netsh', 'wlan', 'start', 'hostednetwork'], check=True)
    return f'OK:HOSTED_NETWORK:{ssid}'


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ssid', required=True)
    parser.add_argument('--password', required=True)
    args = parser.parse_args()

    if not is_admin():
        print('ADMIN_REQUIRED: Run the app as Administrator.', file=sys.stderr)
        sys.exit(1)

    errors = []

    for configure in (True, False):
        try:
            result = await start_mobile_hotspot(args.ssid, args.password, configure)
            print(result)
            return
        except Exception as exc:
            errors.append(str(exc))

    try:
        print(try_hosted_network(args.ssid, args.password))
        return
    except Exception as exc:
        errors.append(str(exc))

    detail = '; '.join(errors)
    print(
        f'HOTSPOT_FAILED: {detail}. '
        'Open Windows Settings > Mobile hotspot, turn it ON once manually, then retry.',
        file=sys.stderr,
    )
    sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
