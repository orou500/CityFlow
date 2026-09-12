<#
  Generates the CityFlow PWA icon set from the official favicon.
  Source: public/images/favicon.png (1024x1024, transparent, white-on-navy logo).
  Every output is a FULL-BLEED square: the logo composited onto the brand navy
  (#011C5D, sampled from the favicon's own dominant background) so it renders
  correctly on light launchers, Android adaptive icons and the iOS home screen.

  Content is inset to stay inside the maskable safe zone (central 80% circle):
  favicon content occupies ~14.4%-85.6% of its own box, and it is drawn at 90%
  of the canvas => content half-extent ~32% < 40% safe radius.

  Outputs:
    icons/pwa-192x192.png        purpose "any"
    icons/pwa-512x512.png        purpose "any"
    icons/maskable-512x512.png   purpose "maskable"
    icons/apple-touch-icon.png   180x180 (no transparency, iOS home screen)

  Requires Windows PowerShell with System.Drawing (GDI+). Re-run any time the
  favicon changes:
    powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
#>
param(
  [string]$SourcePng = "public\images\favicon.png",
  [string]$OutDir = "public\icons"
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root $SourcePng
$outPath = Join-Path $root $OutDir
New-Item -ItemType Directory -Path $outPath -Force | Out-Null

$src = [System.Drawing.Image]::FromFile($srcPath)
if (-not $src) { throw "Cannot load source icon: $srcPath" }

function New-CityFlowIcon {
  param(
    [int]$Size,
    [string]$FileName,
    [float]$ContentScale = 0.9
  )
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $navy = [System.Drawing.Color]::FromArgb(255, 1, 28, 93)
  $g.Clear($navy)

  $target = [int][math]::Round($Size * $ContentScale)
  $offset = [int][math]::Floor(($Size - $target) / 2)
  $dest = New-Object System.Drawing.Rectangle($offset, $offset, $target, $target)
  $g.DrawImage($src, $dest, 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  $out = Join-Path $outPath $FileName
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Wrote $out ($Size x $Size)"
}

New-CityFlowIcon 192 "pwa-192x192.png" 0.9
New-CityFlowIcon 512 "pwa-512x512.png" 0.9
New-CityFlowIcon 512 "maskable-512x512.png" 0.9
New-CityFlowIcon 180 "apple-touch-icon.png" 0.9

$src.Dispose()
Write-Host "Done."