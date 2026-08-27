$ErrorActionPreference = "Stop"
$WorkerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogRoot = Join-Path $env:LOCALAPPDATA "AMS\BrowserWorker\logs"
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$LogFile = Join-Path $LogRoot "worker.log"

if (Test-Path $LogFile) {
  $LogInfo = Get-Item -LiteralPath $LogFile
  if ($LogInfo.Length -ge 1000000) {
    $Archive = Join-Path $LogRoot ("worker-{0:yyyyMMddHHmmss}.log" -f (Get-Date))
    Move-Item -LiteralPath $LogFile -Destination $Archive -Force
  }
}

Get-ChildItem -LiteralPath $LogRoot -Filter "worker-*.log" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 5 |
  Remove-Item -Force

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "AMS Browser Worker refuses to run elevated. Start the 'AMS Browser Worker' scheduled task, which is configured for LIMITED privilege."
}

Set-Location $WorkerRoot
"`n[$(Get-Date -Format o)] starting AMS Browser Worker (limited privilege)" | Out-File -FilePath $LogFile -Append -Encoding utf8
& npm start *>> $LogFile
