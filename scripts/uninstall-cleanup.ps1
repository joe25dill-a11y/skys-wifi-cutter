# Stops Skys WiFi Cutter processes and removes leftover firewall rules before uninstall.
$ErrorActionPreference = 'SilentlyContinue'

$scriptDir = $PSScriptRoot
if ($scriptDir -like '*\resources\app.asar.unpacked\scripts') {
  $installDir = (Resolve-Path (Join-Path $scriptDir '..\..\..')).Path
} else {
  $installDir = 'C:\Users\WhyUH\AppData\Local\Programs\Skys WiFi Cutter'
}

function Stop-ProcessesUnder([string]$root) {
  if (-not $root) { return }
  Get-CimInstance Win32_Process |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object {
      & taskkill.exe /F /PID $_.ProcessId /T 2>$null | Out-Null
    }
}

& taskkill.exe /F /IM 'Skys WiFi Cutter.exe' /T 2>$null | Out-Null
Start-Sleep -Milliseconds 800

Stop-ProcessesUnder $installDir
Stop-ProcessesUnder (Join-Path $installDir 'resources')

Get-Process -Name SkysNativeMeter, python -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like '*Skys WiFi Cutter*' } |
  ForEach-Object { & taskkill.exe /F /PID $_.Id /T 2>$null | Out-Null }

& netsh.exe advfirewall firewall delete rule name="FREEZE_HOTSPOT_OUT" | Out-Null
& netsh.exe advfirewall firewall delete rule name="FREEZE_HOTSPOT_IN" | Out-Null

Get-NetFirewallRule -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like 'SKYS_KILL_*' } |
  ForEach-Object { Remove-NetFirewallRule -Name $_.Name -ErrorAction SilentlyContinue }

exit 0
