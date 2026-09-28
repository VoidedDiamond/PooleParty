# Downloads a portable copy of Node.js into a "node" folder next to
# Poole Party.bat, for computers where you can't install it (no admin rights).
# It's the official zip from nodejs.org, unpacked - nothing gets installed, and
# Poole Party.bat only puts it on PATH while its own window is open.
# Delete the node folder to remove it, or to get a newer version on the next run.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # the progress bar slows Windows PowerShell downloads to a crawl
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'node'
$work = Join-Path $root 'node-download'
$dist = 'https://nodejs.org/dist'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }

try {
  # index.json lists every release, newest first. Take the newest LTS that has a zip for this machine.
  $index = Invoke-RestMethod -UseBasicParsing "$dist/index.json"
  $release = $index | Where-Object { $_.lts -and ($_.files -contains "win-$arch-zip") } | Select-Object -First 1
  if (-not $release) { throw "nodejs.org has no Windows $arch zip listed." }
  $version = $release.version
  $name = "node-$version-win-$arch"
  $zip = Join-Path $work "$name.zip"

  if (Test-Path $work) { Remove-Item $work -Recurse -Force }
  New-Item -ItemType Directory $work | Out-Null

  Write-Host "Downloading Node.js $version (about 35 MB)..."
  Invoke-WebRequest -UseBasicParsing "$dist/$version/$name.zip" -OutFile $zip

  # Check the download against the checksum nodejs.org publishes alongside it.
  $sums = Invoke-RestMethod -UseBasicParsing "$dist/$version/SHASUMS256.txt"
  $expected = [regex]::Match($sums, "([0-9a-f]{64})\s+$([regex]::Escape("$name.zip"))").Groups[1].Value
  if (-not $expected -or (Get-FileHash $zip -Algorithm SHA256).Hash -ne $expected) {
    throw "the download doesn't match its published checksum."
  }

  Write-Host 'Unpacking...'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($zip, $work)
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Move-Item (Join-Path $work $name) $dest
  Remove-Item $work -Recurse -Force

  Write-Host "Node.js $version is ready in $dest"
} catch {
  Write-Host "Couldn't download Node.js: $($_.Exception.Message)" -ForegroundColor Red
  if (Test-Path $work) { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
  exit 1
}
