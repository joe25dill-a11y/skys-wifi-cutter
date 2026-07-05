"""Read Windows Mobile Hotspot state (fast WinRT read)."""
import asyncio
import json
import sys


async def main():
    result = {
        'active': False,
        'ssid': None,
        'operationalState': 'unknown'
    }

    try:
        from winrt.windows.networking.connectivity import NetworkInformation
        from winrt.windows.networking.networkoperators import (
            NetworkOperatorTetheringManager,
            TetheringOperationalState,
        )

        profile = NetworkInformation.get_internet_connection_profile()
        if profile is None:
            print(json.dumps(result))
            return

        manager = NetworkOperatorTetheringManager.create_from_connection_profile(profile)
        if manager is None:
            print(json.dumps(result))
            return

        state = manager.tethering_operational_state
        result['operationalState'] = str(state)
        result['active'] = state == TetheringOperationalState.ON or int(state) == 1

        try:
            config = manager.get_current_access_point_configuration()
            if config and config.ssid:
                result['ssid'] = str(config.ssid)
        except Exception:
            pass
    except Exception as exc:
        result['error'] = str(exc)

    print(json.dumps(result))


if __name__ == '__main__':
    asyncio.run(main())
