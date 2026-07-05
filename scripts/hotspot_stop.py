"""Stop Windows Mobile Hotspot."""
import asyncio
import subprocess
import sys


async def stop_mobile_hotspot():
    from winrt.windows.networking.connectivity import NetworkInformation
    from winrt.windows.networking.networkoperators import NetworkOperatorTetheringManager

    profile = NetworkInformation.get_internet_connection_profile()
    if profile is None:
        return

    manager = NetworkOperatorTetheringManager.create_from_connection_profile(profile)
    if manager is None:
        return

    await manager.stop_tethering_async()


async def main():
    try:
        await stop_mobile_hotspot()
    except Exception:
        pass

    subprocess.run(['netsh', 'wlan', 'stop', 'hostednetwork'], capture_output=True)
    print('OK')


if __name__ == '__main__':
    asyncio.run(main())
