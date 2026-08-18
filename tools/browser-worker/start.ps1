$ErrorActionPreference = "Stop"
$WorkerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogRoot = Join-Path $env:LOCALAPPDATA "AMS\BrowserWorker\logs"
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$LogFile = Join-Path $LogRoot "worker.log"

Set-Location $WorkerRoot
"`n[$(Get-Date -Format o)] starting AMS Browser Worker" | Out-File -FilePath $LogFile -Append -Encoding utf8
& npm start *>> $LogFile
