$ErrorActionPreference = 'Stop'
$demoFrontend = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$demoLogs = Join-Path $demoFrontend '.local-demo'
if (-not (Test-Path -LiteralPath (Join-Path $demoFrontend 'node_modules/next'))) {
  throw 'Install dependencies first: npm.cmd ci'
}
if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  New-Item -ItemType Directory -Force -Path $demoLogs | Out-Null
  Start-Process -FilePath $env:ComSpec -ArgumentList @('/d','/c','npm.cmd run dev') -WorkingDirectory $demoFrontend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $demoLogs 'stdout.log') -RedirectStandardError (Join-Path $demoLogs 'stderr.log') | Out-Null
}
$demoReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $demoPage = Invoke-WebRequest 'http://127.0.0.1:3000' -UseBasicParsing -TimeoutSec 2
    if ($demoPage.StatusCode -eq 200 -and $demoPage.Content.Contains('Perform Practice Solutions | Client Demo')) { $demoReady = $true; break }
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $demoReady) { throw 'Demo startup failed or port 3000 is occupied by another app. Check .local-demo logs, or run npm.cmd run dev in a terminal.' }
Write-Output 'Perform client demo is running: http://localhost:3000'
Write-Output 'Fictional data only. No backend, live outreach, or external booking services are connected.'
Write-Output 'This is a local client presentation, not a live deployment. The app remains running after this command exits.'
