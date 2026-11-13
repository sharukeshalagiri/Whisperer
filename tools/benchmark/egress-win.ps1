# Records every non-loopback TCP connection owned by the Whisperer process tree, every 0.3 s,
# until the stop file appears. Usage: egress-win.ps1 <rootPid> <outFile> <stopFile>
param([int]$RootPid, [string]$OutFile, [string]$StopFile)
$seen = @{}
while (-not (Test-Path $StopFile)) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
  $tree = @{ $RootPid = 'root' }
  do {
    $added = $false
    foreach ($p in $all) {
      if ($tree.ContainsKey([int]$p.ParentProcessId) -and -not $tree.ContainsKey([int]$p.ProcessId)) { $tree[[int]$p.ProcessId] = $p.Name; $added = $true }
    }
  } while ($added)
  $names = @{}; foreach ($p in $all) { $names[[int]$p.ProcessId] = $p.Name }
  Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object {
    $tree.ContainsKey([int]$_.OwningProcess) -and $_.RemoteAddress -notmatch '^(127\.|::1$|0\.0\.0\.0$|::$)'
  } | ForEach-Object {
    $key = "$($_.RemoteAddress):$($_.RemotePort):$($_.OwningProcess)"
    if (-not $seen.ContainsKey($key)) {
      $seen[$key] = $true
      "$(Get-Date -Format o)`t$($names[[int]$_.OwningProcess])`t$($_.RemoteAddress):$($_.RemotePort)`t$($_.State)" | Add-Content -Path $OutFile -Encoding utf8
    }
  }
  Start-Sleep -Milliseconds 300
}
# Name the addresses from the DNS client cache as well as it can.
Get-DnsClientCache -ErrorAction SilentlyContinue | Where-Object { $_.Type -in 1, 28 } | ForEach-Object { "dns`t$($_.Entry)`t$($_.Data)" } | Add-Content -Path "$OutFile.dns" -Encoding utf8
