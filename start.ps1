# Jauvex on Windows (T-283): install what is missing (once), build, and launch: what start.sh does on macOS and Linux.
#   From this folder: powershell -ExecutionPolicy Bypass -File .\start.ps1   (or double-click start.cmd)
#   -InstallOnly   install and build, do not launch.
# The voice: Kokoro speaks (its own package in kokoro\ and its model), whisper-server listens (whisper.cpp's own Windows build, pinned by
# its SHA-256, in whisper\), with the Whisper models of scripts/models.sh (fetched by scripts/models.ts: the same list, sizes, checksums).
# Each step's output goes to tmp\start.log and is shown only if the step fails. ASCII only: Windows PowerShell 5.1 reads a script without a
# byte order mark in the system's code page.
param([switch]$InstallOnly)
# 'Continue', not 'Stop': in Windows PowerShell 5.1 a program's stderr line (npm's warnings) is an error record, and 'Stop' fails the step on
# it. A step fails on its programs' exit codes, and its cmdlets stop on their own errors (-ErrorAction Stop).
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path tmp | Out-Null
$Log = Join-Path $PSScriptRoot 'tmp\start.log'; Set-Content -LiteralPath $Log -Value '' -Encoding UTF8

$Live = -not [Console]::IsOutputRedirected # a console: the step's line shows while it runs, then its result replaces it
function Step([string]$Label, [scriptblock]$Do) {
  $start = Get-Date; if ($Live) { Write-Host "  .  $Label" -NoNewline }
  $ok = $true; $global:LASTEXITCODE = 0; $out = ''
  try { $out = & $Do *>&1 | Out-String -Width 400; if ($LASTEXITCODE -ne 0) { $ok = $false } } catch { $out += ($_ | Out-String); $ok = $false }
  Add-Content -LiteralPath $Log -Value "== $Label`r`n$out" -Encoding UTF8 # not >>: in 5.1 it writes UTF-16
  $took = [int]((Get-Date) - $start).TotalSeconds
  $cr = if ($Live) { "`r" } else { '' }
  if ($ok) { Write-Host "$cr  ok $Label ($took s)" -ForegroundColor Green; return }
  Write-Host "$cr  x  $Label" -ForegroundColor Red; Write-Host ''
  Get-Content -LiteralPath $Log -Tail 40; Write-Host ''; Write-Host 'The whole output is in tmp\start.log'; exit 1
}
function Warn([string]$Text) { Write-Host "  !  $Text" -ForegroundColor Yellow }

Write-Host 'Jauvex'

# Node 22.18 or newer, with npm: the build and the app's own scripts, which Node runs as TypeScript as they are. (npm.cmd and npx.cmd, not npm: PowerShell's default policy blocks npm.ps1.)
$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) { node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)" 2>$null; $nodeOk = ($LASTEXITCODE -eq 0) }
if (-not $nodeOk -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Write-Host 'Jauvex needs Node.js 22.18 or newer: winget install OpenJS.NodeJS.22 (or nodejs.org), then run this again.'; exit 1 }
# Microsoft's Visual C++ runtime: Electron's own install step loads a native module that needs it, and a fresh Windows has none.
if (-not (Test-Path (Join-Path $env:SystemRoot 'System32\vcruntime140.dll'))) { Write-Host "Microsoft's Visual C++ runtime is missing: winget install Microsoft.VCRedist.2015+.x64, then run this again."; exit 1 }

# Again whenever the lockfile changed since the last install, as start.sh does: an update or a pull brings a new one.
$lockMark = Join-Path $PSScriptRoot 'node_modules\.jauvex-lock'
if ((Test-Path node_modules) -and (Test-Path $lockMark) -and ((Get-FileHash package-lock.json).Hash -eq (Get-FileHash $lockMark).Hash)) { Step 'Dependencies are installed' { } }
else { Step 'Installing dependencies (npm install)' { npm.cmd install --no-audit --no-fund; if ($LASTEXITCODE -eq 0) { Copy-Item -LiteralPath package-lock.json -Destination $lockMark -Force } } }
$Electron = Join-Path $PSScriptRoot 'node_modules\electron\dist\electron.exe'
if (Test-Path $Electron) { Step 'Electron is here' { } } else { Step 'Fetching Electron (about 120 MB, once)' { npx.cmd install-electron } }

# ---- the voice. The ears: whisper-server and the models the app prefers (small for the transcript, base for the live words).
$WhisperDir = Join-Path $PSScriptRoot 'whisper'
$WhisperUrl = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip' # whisper.cpp v1.9.2, its CPU build for 64-bit Windows
$WhisperSha = '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a'
if ((Get-Command whisper-server -ErrorAction SilentlyContinue) -or (Test-Path (Join-Path $WhisperDir 'whisper-server.exe'))) { Step 'whisper-server is here' { } }
elseif ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { Warn 'whisper-server: whisper.cpp v1.9.2 has a build for 64-bit Intel and AMD Windows only. Without it you can type but not talk.' }
else {
  Step 'Downloading whisper-server (whisper.cpp v1.9.2, 8 MB, once)' {
    $zip = Join-Path $PSScriptRoot 'tmp\whisper-bin-x64.zip'; $unzip = Join-Path $PSScriptRoot 'tmp\whisper-unzip'
    curl.exe -fsSL --retry 3 -o $zip $WhisperUrl; if ($LASTEXITCODE -ne 0) { throw 'The download of whisper.cpp failed.' }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLower() -ne $WhisperSha) { Remove-Item -LiteralPath $zip -Force; throw 'The whisper.cpp download does not match its SHA-256: nothing of it was used.' }
    if (Test-Path $unzip) { Remove-Item -LiteralPath $unzip -Recurse -Force -ErrorAction Stop }
    Expand-Archive -LiteralPath $zip -DestinationPath $unzip -ErrorAction Stop
    New-Item -ItemType Directory -Force -Path $WhisperDir -ErrorAction Stop | Out-Null; Copy-Item -Path (Join-Path $unzip 'Release\*') -Destination $WhisperDir -Recurse -Force -ErrorAction Stop
    Remove-Item -LiteralPath $zip, $unzip -Recurse -Force -ErrorAction Stop
    if (-not (Test-Path (Join-Path $WhisperDir 'whisper-server.exe'))) { throw 'The whisper.cpp download has no whisper-server.exe.' }
  }
}
# A model counts only when it is whole (scripts/models.sh holds each one's size and SHA-256): one cut short is downloaded again.
$missing = @(node scripts/models.ts missing | Where-Object { $_ })
if (-not $missing.Count) { Step 'Whisper models are here' { } }
foreach ($m in $missing) { $f, $mb = $m -split ':'; Step "Downloading the Whisper model $f ($mb MB, once)" { node scripts/models.ts fetch $f } }
# The mouth: Kokoro (T-275), its own package in kokoro\ and its model. ONNXRUNTIME_NODE_INSTALL_CUDA=skip: onnxruntime-node's install
# script otherwise fetches its CUDA build (hundreds of MB, no checksum), which Kokoro never uses: it runs on the CPU.
$kokoroLock = Join-Path $PSScriptRoot 'kokoro\package-lock.json'; $kokoroMark = Join-Path $PSScriptRoot 'kokoro\node_modules\.jauvex-lock'
if ((Test-Path 'kokoro\node_modules\kokoro-js') -and (Test-Path $kokoroMark) -and ((Get-FileHash $kokoroLock).Hash -eq (Get-FileHash $kokoroMark).Hash)) { Step 'Kokoro is installed' { } }
else { Step 'Installing Kokoro, the spoken voice (npm, once)' { $env:ONNXRUNTIME_NODE_INSTALL_CUDA = 'skip'; npm.cmd ci --prefix kokoro --no-audit --no-fund; if ($LASTEXITCODE -eq 0) { Copy-Item -LiteralPath $kokoroLock -Destination $kokoroMark -Force } } }
$missing = @(node scripts/models.ts missing kokoro | Where-Object { $_ })
if (-not $missing.Count) { Step 'The Kokoro model is here' { } }
foreach ($m in $missing) { $f, $mb = $m -split ':'; Step "Downloading the Kokoro file $f ($mb MB, once)" { node scripts/models.ts fetch $f } }

Step 'Building the window' { npx.cmd vite build --logLevel warn }
Step 'Building the app' { node scripts/bundle-electron.ts }
if ($InstallOnly -or $env:CVC_DRY) { Write-Host '  (installed and built: not launching)'; exit 0 }

# ---- launch: on its own, its output in tmp\app.log; this window can close.
$p = Start-Process -FilePath $Electron -ArgumentList ('"' + $PSScriptRoot + '"') -WorkingDirectory $PSScriptRoot -RedirectStandardOutput (Join-Path $PSScriptRoot 'tmp\app.log') -RedirectStandardError (Join-Path $PSScriptRoot 'tmp\app-errors.log') -PassThru
Start-Sleep -Seconds 2
if ($p.HasExited) { Write-Host '  x  The app stopped right away:' -ForegroundColor Red; Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tmp\app-errors.log') -Tail 20; exit 1 }
Write-Host "  ok Launched (pid $($p.Id), its output in tmp\app.log)" -ForegroundColor Green
