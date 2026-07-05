param(
    [Parameter(Mandatory = $true)][string]$Ssid,
    [Parameter(Mandatory = $true)][string]$Password
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Await-WinRtOperation {
    param(
        $AsyncOperation,
        [Type]$ResultType
    )
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 })[0]
    $method = $asTask.MakeGenericMethod($ResultType)
    $task = $method.Invoke($null, @($AsyncOperation))
    $task.Wait(-1) | Out-Null
    return $task.Result
}

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error 'ADMIN_REQUIRED: Run the app as Administrator.'
    exit 1
}

$errors = @()

function Start-MobileHotspot {
    param([bool]$Configure)

    $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]::GetInternetConnectionProfile()
    if ($null -eq $connectionProfile) {
        throw 'No internet connection. Connect PC to WiFi or Ethernet first.'
    }

    $tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
    if ($null -eq $tm) {
        throw 'Mobile Hotspot not available on this PC.'
    }

    if ($Configure) {
        $config = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration]::new()
        $config.Ssid = $Ssid
        $config.Passphrase = $Password
        $cfg = Await-WinRtOperation -AsyncOperation ($tm.ConfigureAccessPointAsync($config)) -ResultType ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
        if ($cfg.Status -ne [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationStatus]::Success) {
            Write-Warning "ConfigureAccessPoint: $($cfg.Status)"
        }
    }

    $start = Await-WinRtOperation -AsyncOperation ($tm.StartTetheringAsync()) -ResultType ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
    if ($start.Status -eq [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationStatus]::Success) {
        return $true
    }
    throw "StartTethering: $($start.Status)"
}

try {
    if (Start-MobileHotspot -Configure $true) {
        Write-Output "OK:MOBILE_HOTSPOT:$Ssid"
        exit 0
    }
} catch {
    $errors += $_.Exception.Message
}

try {
    if (Start-MobileHotspot -Configure $false) {
        Write-Output 'OK:MOBILE_HOTSPOT_EXISTING'
        exit 0
    }
} catch {
    $errors += $_.Exception.Message
}

try {
    $drivers = netsh wlan show drivers 2>&1 | Out-String
    if ($drivers -match 'Hosted network supported\s*:\s*Yes') {
        netsh wlan set hostednetwork mode=allow ssid="$Ssid" key="$Password" keyUsage=persistent | Out-Null
        netsh wlan start hostednetwork | Out-Null
        Write-Output "OK:HOSTED_NETWORK:$Ssid"
        exit 0
    }
} catch {
    $errors += $_.Exception.Message
}

$detail = ($errors -join '; ')
Write-Error "HOTSPOT_FAILED: $detail. Open Windows Settings, turn Mobile hotspot ON once, then retry."
exit 1
