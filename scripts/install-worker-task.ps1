# Registers the worker as a hidden Windows scheduled task started at logon.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\install-worker-task.ps1 [-Remove]
param([switch]$Remove)

$taskName = 'simple-jira-worker'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Task $taskName removed."
  exit 0
}

$launcher = Join-Path $PSScriptRoot 'start-worker.cmd'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -Command `"& '$launcher'`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'simple-jira: runs queued tickets with Claude Code' -Force | Out-Null

Write-Host "Task $taskName registered. Start now with: Start-ScheduledTask -TaskName $taskName"
Write-Host "Logs: $(Join-Path (Split-Path $PSScriptRoot) 'logs\worker.log')"
