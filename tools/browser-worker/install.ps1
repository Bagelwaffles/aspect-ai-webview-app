param(
  [string]$ControlUrl = "https://www.aspectmarketingsolutions.app",
  [string]$PairingCode = "",
  [switch]$ForcePairing
)

$ErrorActionPreference = "Stop"
$WorkerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataRoot = Join-Path $env:LOCALAPPDATA "AMS\BrowserWorker"
$CredentialFile = Join-Path $DataRoot "credentials.json"
$TaskName = "AMS Browser Worker"
$StartupRoot = [Environment]::GetFolderPath("Startup")
$StartupCommandFile = Join-Path $StartupRoot "AMS Browser Worker.cmd"

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

$HasExistingPairing = Test-Path $CredentialFile
if ($HasExistingPairing -and -not $ForcePairing -and [string]::IsNullOrWhiteSpace($PairingCode)) {
  Write-Host "Existing workstation pairing found. Reusing local credentials." -ForegroundColor Green
} else {
  if ([string]::IsNullOrWhiteSpace($PairingCode)) {
    $PairingCode = Read-Host "Paste the 10-minute pairing code from AMS Browser Control"
  }
  if ([string]::IsNullOrWhiteSpace($PairingCode)) { throw "Pairing code is required" }

  Write-Host "Pairing this workstation..." -ForegroundColor Cyan
  & npm run pair -- --url $ControlUrl --code $PairingCode
  if ($LASTEXITCODE -ne 0) { throw "Worker pairing failed" }
}

if (Test-Path $CredentialFile) {
  try {
    $CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $PreviousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      & icacls.exe $CredentialFile /inheritance:r /grant:r "${CurrentIdentity}:(R,W)" 2>$null | Out-Null
      $AclExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $PreviousErrorActionPreference
    }
    if ($AclExitCode -ne 0) {
      Write-Warning "Could not tighten credentials ACL automatically. The token remains stored only on this workstation."
    }
  } catch {
    Write-Warning "Could not tighten credentials ACL automatically. The token remains stored only on this workstation."
  }
}

$StartScript = Join-Path $WorkerRoot "start.ps1"
$TaskCommand = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`""
$TaskCreated = $false

Write-Host "Creating limited-privilege startup task '$TaskName'..." -ForegroundColor Cyan
$PreviousErrorActionPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = "Continue"
  & schtasks.exe /Create /TN $TaskName /SC ONLOGON /TR $TaskCommand /RL LIMITED /IT /F 2>$null | Out-Null
  $TaskCreateExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $PreviousErrorActionPreference
}

if ($TaskCreateExitCode -eq 0) {
  $TaskCreated = $true
  if (Test-Path $StartupCommandFile) {
    Remove-Item -LiteralPath $StartupCommandFile -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Limited-privilege startup task created." -ForegroundColor Green
} else {
  Write-Warning "Windows denied scheduled-task creation for this user. Falling back to the current-user Startup folder."
  New-Item -ItemType Directory -Force -Path $StartupRoot | Out-Null
  $StartupCommand = "@echo off`r`nstart `"`" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`"`r`n"
  Set-Content -LiteralPath $StartupCommandFile -Value $StartupCommand -Encoding Ascii
  Write-Host "Current-user Startup entry created: $StartupCommandFile" -ForegroundColor Green
}

if ($TaskCreated) {
  Write-Host "Starting AMS Browser Worker through the limited-privilege task..." -ForegroundColor Cyan
  $PreviousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & schtasks.exe /Run /TN $TaskName 2>$null | Out-Null
    $TaskRunExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
  if ($TaskRunExitCode -ne 0) {
    Write-Warning "Scheduled task could not be started immediately. Starting the worker directly as the current user instead."
    $StartArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`""
    Start-Process -FilePath "powershell.exe" -ArgumentList $StartArgs -WindowStyle Hidden
  }
} else {
  Write-Host "Starting AMS Browser Worker as the current user..." -ForegroundColor Cyan
  $StartArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`""
  Start-Process -FilePath "powershell.exe" -ArgumentList $StartArgs -WindowStyle Hidden
}

Write-Host "Installed. Return to /dashboard/browser-control and wait for the worker status to turn ONLINE." -ForegroundColor Green
Write-Host "The worker uses Chromium sandboxing and a separate Edge/Chrome profile under $DataRoot." -ForegroundColor Yellow
Write-Host "Log into approved sites in that profile only when needed. Do not run start.ps1 from an elevated Administrator shell." -ForegroundColor Yellow
