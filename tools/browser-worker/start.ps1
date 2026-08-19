$ErrorActionPreference = "Stop"
$WorkerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogRoot = Join-Path $env:LOCALAPPDATA "AMS\BrowserWorker\logs"
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$LogFile = Join-Path $LogRoot "worker.log"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "AMS Browser Worker refuses to run elevated. Start the 'AMS Browser Worker' scheduled task, which is configured for LIMITED privilege."
}

Set-Location $WorkerRoot
"`n[$(Get-Date -Format o)] starting AMS Browser Worker (limited privilege)" | Out-File -FilePath $LogFile -Append -Encoding utf8
& npm start *>> $LogFile
