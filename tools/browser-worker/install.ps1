param(
  [string]$ControlUrl = "https://www.aspectmarketingsolutions.app",
  [string]$PairingCode = ""
)

$ErrorActionPreference = "Stop"
$WorkerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataRoot = Join-Path $env:LOCALAPPDATA "AMS\BrowserWorker"
$CredentialFile = Join-Path $DataRoot "credentials.json"
$TaskName = "AMS Browser Worker"

Write-Host "AMS Browser Worker installer" -ForegroundColor Cyan
Write-Host "Control plane: $ControlUrl"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node.js 20 or newer, then run this installer again."
}

$NodeVersion = (& node -p "process.versions.node").Trim()
$NodeMajor = [int]($NodeVersion.Split('.')[0])
if ($NodeMajor -lt 20) {
  throw "Node.js 20 or newer is required. Found $NodeVersion."
}

Set-Location $WorkerRoot
Write-Host "Installing browser worker dependencies..." -ForegroundColor Cyan
& npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

if ([string]::IsNullOrWhiteSpace($PairingCode)) {
  $PairingCode = Read-Host "Paste the 10-minute pairing code from AMS Browser Control"
}
if ([string]::IsNullOrWhiteSpace($PairingCode)) { throw "Pairing code is required" }

Write-Host "Pairing this workstation..." -ForegroundColor Cyan
& npm run pair -- --url $ControlUrl --code $PairingCode
if ($LASTEXITCODE -ne 0) { throw "Worker pairing failed" }

if (Test-Path $CredentialFile) {
  try {
    & icacls $CredentialFile /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
  } catch {
    Write-Warning "Could not tighten credentials ACL automatically. The token is still stored only on this workstation."
  }
}

$StartScript = Join-Path $WorkerRoot "start.ps1"
$TaskCommand = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`""
Write-Host "Creating limited-privilege startup task '$TaskName'..." -ForegroundColor Cyan
& schtasks.exe /Create /TN $TaskName /SC ONLOGON /TR $TaskCommand /RL LIMITED /IT /F | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not create the limited-privilege startup task. The browser worker was not started."
}

Write-Host "Starting AMS Browser Worker through the limited-privilege task..." -ForegroundColor Cyan
& schtasks.exe /Run /TN $TaskName | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not start the AMS Browser Worker task."
}

Write-Host "Installed. Return to /dashboard/browser-control and wait for the worker status to turn ONLINE." -ForegroundColor Green
Write-Host "The worker uses Chromium sandboxing and a separate Edge/Chrome profile under $DataRoot." -ForegroundColor Yellow
Write-Host "Log into approved sites in that profile only when needed. Do not run start.ps1 from an elevated Administrator shell." -ForegroundColor Yellow
