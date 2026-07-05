$ErrorActionPreference = 'SilentlyContinue'

$result = @{
    active = $false
    ssid = $null
    checked = $true
    method = 'adapter'
}

# Mobile hotspot / ICS host address on Windows is typically 192.168.137.1
$gateway = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -eq '192.168.137.1' -and
        $_.AddressState -eq 'Preferred'
    } |
    Select-Object -First 1

if ($gateway) {
    $result.active = $true
    $result.operationalState = 'On'
} else {
    $hosted = netsh wlan show hostednetwork 2>$null | Out-String
    if ($hosted -match 'Status\s*:\s*Started') {
        $result.active = $true
        $result.operationalState = 'On'
        $result.method = 'hostednetwork'
        if ($hosted -match 'SSID\s*:\s*"(.+?)"') {
            $result.ssid = $Matches[1]
        }
    } else {
        $result.operationalState = 'Off'
    }
}

$result | ConvertTo-Json -Compress
