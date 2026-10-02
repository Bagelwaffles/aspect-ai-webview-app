param(
  [switch]$PurgeUploads
)

$ErrorActionPreference = "Stop"

$DataRoot = Join-Path $env:LOCALAPPDATA "AMS\BrowserWorker"
$CredentialFile = Join-Path $DataRoot "credentials.json"
$ProfileRoot = Join-Path $DataRoot "EdgeProfile"
$LogRoot = Join-Path $DataRoot "logs"
$SecretRoot = Join-Path $DataRoot "Secrets"
$UploadRoot = Join-Path $DataRoot "Uploads"
$TaskName = "AMS Browser Worker"
$StartupRoot = [Environment]::GetFolderPath("Startup")
$StartupCommandFile = Join-Path $StartupRoot "AMS Browser Worker.cmd"

Write-Host "AMS Browser Worker retirement" -ForegroundColor Cyan
Write-Host "This removes the local Browser Control fallback only. AMS cloud Browser Control remains authoritative." -ForegroundColor Yellow

function Try-Run([scriptblock]$Action) {
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $Action
  } finally {
    $ErrorActionPreference = $previous
  }
}

Write-Host "Stopping and removing scheduled task..." -ForegroundColor Cyan
Try-Run {
  & schtasks.exe /End /TN $TaskName 2>$null | Out-Null
  & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
}

if (Test-Path $StartupCommandFile) {
  Remove-Item -LiteralPath $StartupCommandFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Stopping any remaining AMS Browser Worker processes..." -ForegroundColor Cyan
$needle = "AMS\BrowserWorker"
$workerProcesses = @()
try {
  $workerProcesses = Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    $_.ProcessId -ne $PID -and
    $_.CommandLine -and
    (
      $_.CommandLine -like "*AMS Browser Worker*" -or
      $_.CommandLine -like "*tools\browser-worker\start.ps1*" -or
      $_.CommandLine -like "*$needle*"
    )
  }
} catch {
  Write-Warning "Could not enumerate all worker processes. Startup entries were still removed."
}

foreach ($process in $workerProcesses) {
  try {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
  } catch {
    Write-Warning "Could not stop process $($process.ProcessId). It cannot claim Browser Control jobs unless it is made primary again."
  }
}

Write-Host "Removing local pairing/profile/secret material..." -ForegroundColor Cyan
foreach ($path in @($CredentialFile, $ProfileRoot, $LogRoot, $SecretRoot)) {
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($PurgeUploads -and (Test-Path $UploadRoot)) {
  Remove-Item -LiteralPath $UploadRoot -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Uploads folder purged." -ForegroundColor Yellow
} elseif (Test-Path $UploadRoot) {
  Write-Host "Uploads preserved at: $UploadRoot" -ForegroundColor Green
}

if (Test-Path $DataRoot) {
  $remaining = Get-ChildItem -LiteralPath $DataRoot -Force -ErrorAction SilentlyContinue
  if (-not $remaining) {
    Remove-Item -LiteralPath $DataRoot -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Windows Browser Worker retired." -ForegroundColor Green
Write-Host "The Vercel cloud worker remains the production Browser Control executor." -ForegroundColor Green
Write-Host "Google/YouTube/Play owner authentication remains on official OAuth/API or your normal browser." -ForegroundColor Yellow
