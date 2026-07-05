param()

$result = @{
    isAdmin = $false
    hasWifi = $false
    hostedNetworkSupported = $false
    mobileHotspotAvailable = $false
    internetConnected = $false
    errors = @()
}

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p = New-Object Security.Principal.WindowsPrincipal($id)
$result.isAdmin = $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
$result.hasWifi = [bool](Get-NetAdapter | Where-Object { $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN' -and $_.Status -ne 'Disabled' })

try {
    $profile = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]::GetInternetConnectionProfile()
    $result.internetConnected = ($null -ne $profile)
    if ($profile) {
        $tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]::CreateFromConnectionProfile($profile)
        $result.mobileHotspotAvailable = ($null -ne $tm)
    }
} catch {
    $result.errors += $_.Exception.Message
}

try {
    $drivers = netsh wlan show drivers 2>&1 | Out-String
    $result.hostedNetworkSupported = $drivers -match 'Hosted network supported\s*:\s*Yes'
} catch {
    $result.errors += 'Could not read wlan drivers'
}

$result | ConvertTo-Json -Compress
