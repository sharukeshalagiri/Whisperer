# Samples the memory of a process tree until the stop file appears.
# Usage: memsample.ps1 <rootPid> <outCsv> <stopFile> [intervalMs]
# Each line: ISO time, process count, working set MB (sum), private bytes MB (sum).
param([int]$RootPid, [string]$OutCsv, [string]$StopFile, [int]$IntervalMs = 1000)
"time,processes,working_set_mb,private_mb" | Set-Content -Path $OutCsv -Encoding utf8
while (-not (Test-Path $StopFile)) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, WorkingSetSize, PrivatePageCount
  $tree = @{ $RootPid = $true }
  do {
    $added = $false
    foreach ($p in $all) {
      if ($tree.ContainsKey([int]$p.ParentProcessId) -and -not $tree.ContainsKey([int]$p.ProcessId)) { $tree[[int]$p.ProcessId] = $true; $added = $true }
    }
  } while ($added)
  $members = $all | Where-Object { $tree.ContainsKey([int]$_.ProcessId) }
  $ws = ($members | Measure-Object WorkingSetSize -Sum).Sum / 1MB
  $pv = ($members | Measure-Object PrivatePageCount -Sum).Sum / 1MB
  "$(Get-Date -Format o),$(@($members).Count),$([math]::Round($ws,1)),$([math]::Round($pv,1))" | Add-Content -Path $OutCsv -Encoding utf8
  Start-Sleep -Milliseconds $IntervalMs
}
