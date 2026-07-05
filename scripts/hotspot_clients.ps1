$ErrorActionPreference = 'SilentlyContinue'

function Normalize-Mac($mac) {
    if (-not $mac) { return $null }
    return ($mac -replace '-', ':').ToUpper()
}

function Add-ClientRow {
    param($List, $Ip, $Mac, $State)
    if (-not $Ip -or $Ip -eq '192.168.137.1') { return }
    if (-not $Mac -or $Mac -eq '00-00-00-00-00-00' -or $Mac -eq '00:00:00:00:00:00') { return }
    $normMac = Normalize-Mac $Mac
    if ($List.ContainsKey($Ip)) { return }
    $List[$Ip] = [PSCustomObject]@{
        IPAddress = $Ip
        LinkLayerAddress = $normMac
        State = if ($State) { $State } else { 'Reachable' }
    }
}

$clients = @{}

Get-NetNeighbor -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -like '192.168.137.*' -and
        $_.IPAddress -ne '192.168.137.1' -and
        $_.LinkLayerAddress -and
        $_.LinkLayerAddress -ne '00-00-00-00-00-00'
    } |
    ForEach-Object { Add-ClientRow -List $clients -Ip $_.IPAddress -Mac $_.LinkLayerAddress -State $_.State }

try {
    arp -a | Select-String '192\.168\.137\.(\d+)' | ForEach-Object {
        if ($_ -match '\((192\.168\.137\.\d+)\)\s+([0-9a-f\-]{17})') {
            Add-ClientRow -List $clients -Ip $Matches[1] -Mac $Matches[2] -State 'arp'
        }
    }
} catch { }

$rows = @($clients.Values)
if ($rows.Count -eq 0) {
    Write-Output '[]'
    exit 0
}

$rows | ConvertTo-Json -Compress
