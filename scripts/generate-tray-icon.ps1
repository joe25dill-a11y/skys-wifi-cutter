$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PublicDir = Join-Path $ProjectRoot 'public'
$MasterPath = Join-Path $PublicDir 'tray-icon-master.png'

if (-not (Test-Path $MasterPath)) {
    throw "Missing tray-icon-master.png in public folder"
}

Add-Type -AssemblyName System.Drawing

function Export-TraySize {
    param(
        [System.Drawing.Image]$Source,
        [int]$Size,
        [string]$OutPath
    )

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($Source, 0, 0, $Size, $Size)
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

function Export-IconFile {
    param(
        [System.Drawing.Image]$Source,
        [string]$OutPath
    )

    $sizes = @(256, 128, 64, 48, 32, 16)
    $bitmaps = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]

    foreach ($size in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap $size, $size
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($Source, 0, 0, $size, $size)
        $g.Dispose()
        [void]$bitmaps.Add($bmp)
    }

    $stream = [System.IO.File]::Create($OutPath)
    try {
        $icon = [System.Drawing.Icon]::FromHandle($bitmaps[0].GetHicon())
        $icon.Save($stream)
        $icon.Dispose()
    } finally {
        $stream.Close()
        foreach ($bmp in $bitmaps) {
            $bmp.Dispose()
        }
    }
}

$master = [System.Drawing.Image]::FromFile($MasterPath)
try {
    foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
        Export-TraySize -Source $master -Size $size -OutPath (Join-Path $PublicDir "tray-icon-$size.png")
    }
    Copy-Item -Force (Join-Path $PublicDir 'tray-icon-32.png') (Join-Path $PublicDir 'tray-icon.png')
    Copy-Item -Force (Join-Path $PublicDir 'tray-icon-256.png') (Join-Path $PublicDir 'icon.png')
    Export-IconFile -Source $master -OutPath (Join-Path $PublicDir 'icon.ico')
} finally {
    $master.Dispose()
}

Write-Host "App icons exported from tray-icon-master.png -> $PublicDir"
