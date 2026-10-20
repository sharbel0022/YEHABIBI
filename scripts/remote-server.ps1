param([ValidateSet('Install','Run','Uninstall','Status')][string]$Mode='Run')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$serverScript=Join-Path $PSScriptRoot 'remote-server.mjs'
$launcherScript=Join-Path $PSScriptRoot 'remote-server.ps1'
$nodeExecutable=(Get-Command node.exe -ErrorAction Stop).Source
$powershellExecutable=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$runKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName='YehabibiPrivateServer'
$command='"{0}" -NoProfile -NonInteractive -WindowStyle Hidden -File "{1}" -Mode Run' -f $powershellExecutable,$launcherScript
$existing=$null
if(Test-Path -LiteralPath $runKey){$existing=(Get-ItemProperty -LiteralPath $runKey).PSObject.Properties[$runName].Value}

if($Mode -eq 'Status'){
  [Console]::WriteLine('Yehabibi autostart: '+[bool]($existing -eq $command))
  exit 0
}
if($Mode -eq 'Uninstall'){
  if($existing -and $existing -ne $command){throw 'En annan autostart med samma namn lämnas orörd.'}
  if($existing){Remove-ItemProperty -LiteralPath $runKey -Name $runName}
  & $nodeExecutable --experimental-strip-types (Join-Path $PSScriptRoot 'remote-dev.mjs') --stop
  exit $LASTEXITCODE
}
if($Mode -eq 'Install'){
  if($existing -and $existing -ne $command){throw 'En annan autostart med samma namn lämnas orörd.'}
  if($command.Length -gt 260){throw 'Projektets sökväg är för lång för Windows-autostart.'}
  & $nodeExecutable --experimental-strip-types (Join-Path $PSScriptRoot 'remote-dev.mjs') --stop
  if($LASTEXITCODE -ne 0){throw 'Den tidigare servern kunde inte stoppas säkert.'}
  $supervisorFile=Join-Path $projectRoot '.tmp\remote-server-supervisor.json'
  for($attempt=0;$attempt -lt 80 -and (Test-Path -LiteralPath $supervisorFile);$attempt++){Start-Sleep -Milliseconds 250}
  if(Test-Path -LiteralPath $supervisorFile){throw 'Den tidigare bakgrundsprocessen har inte avslutats.'}
  if(!(Test-Path -LiteralPath $runKey)){New-Item -Path $runKey -Force | Out-Null}
  New-ItemProperty -LiteralPath $runKey -Name $runName -Value $command -PropertyType String -Force | Out-Null
  $pauseFile=Join-Path $projectRoot '.tmp\remote-server-paused.json'
  if(Test-Path -LiteralPath $pauseFile){Remove-Item -LiteralPath $pauseFile}
  Start-Process -FilePath $powershellExecutable -ArgumentList @('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',('"{0}"' -f $launcherScript),'-Mode','Run') -WorkingDirectory $projectRoot -WindowStyle Hidden
  [Console]::WriteLine('Yehabibi startar i bakgrunden och automatiskt vid Windows-inloggning.')
  exit 0
}

# A scoped power request keeps the server awake while it runs, without changing
# the user's power plan or keeping the display on. Explicit sleep still works.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class YehabibiServerPower {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern uint SetThreadExecutionState(uint flags);
}
'@
$stateDirectory=Join-Path $projectRoot '.tmp'
if(!(Test-Path -LiteralPath $stateDirectory)){New-Item -ItemType Directory -Path $stateDirectory | Out-Null}
try{
  $serverProcess=Start-Process -FilePath $nodeExecutable -ArgumentList @('--experimental-strip-types',('"{0}"' -f $serverScript)) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDirectory 'remote-server.log') -RedirectStandardError (Join-Path $stateDirectory 'remote-server-error.log')
  do{
    if([YehabibiServerPower]::SetThreadExecutionState([uint32]2147483649) -eq 0){throw 'Windows kunde inte hålla servern vaken.'}
  }while(!$serverProcess.WaitForExit(15000))
}finally{
  [void][YehabibiServerPower]::SetThreadExecutionState([uint32]2147483648)
}
