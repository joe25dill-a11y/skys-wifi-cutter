$ErrorActionPreference = 'SilentlyContinue'

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

try {
    $connectionProfile = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]::GetInternetConnectionProfile()
    if ($null -ne $connectionProfile) {
        $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]::CreateFromConnectionProfile($connectionProfile)
        if ($null -ne $tetheringManager) {
            Await-WinRtOperation -AsyncOperation ($tetheringManager.StopTetheringAsync()) -ResultType ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult]) | Out-Null
        }
    }
} catch { }

netsh wlan stop hostednetwork | Out-Null
Write-Output 'OK'
