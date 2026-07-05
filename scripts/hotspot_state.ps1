$ErrorActionPreference = 'SilentlyContinue'

$result = @{
    active = $false
    ssid = $null
    operationalState = 'unknown'
}

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $profile = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]::GetInternetConnectionProfile()
    if ($null -ne $profile) {
        $tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]::CreateFromConnectionProfile($profile)
        if ($null -ne $tm) {
            $state = $tm.TetheringOperationalState
            $result.operationalState = [string]$state
            # On = 1 in NetworkOperatorTetheringOperationalState
            $result.active = ($state.ToString() -eq 'On' -or [int]$state -eq 1)
            try {
                $ap = $tm.GetCurrentAccessPointConfiguration()
                if ($ap -and $ap.Ssid) {
                    $result.ssid = [string]$ap.Ssid
                }
            } catch { }
        }
    }
} catch {
    $result.error = $_.Exception.Message
}

$result | ConvertTo-Json -Compress
