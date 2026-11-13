# Appends one line describing the machine's state: free RAM, 10 s average CPU load, AC power.
# Usage: conditions.ps1 <outFile> <label>   Exits 3 when the machine is not on AC power.
param([string]$OutFile, [string]$Label)
$os = Get-CimInstance Win32_OperatingSystem
$cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -MaxSamples 10).CounterSamples.CookedValue | Measure-Object -Average
$ac = [bool]((Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue).PowerOnline -contains $true)
"$(Get-Date -Format o)`t$Label`tfree_ram_gb=$([math]::Round($os.FreePhysicalMemory/1MB,2))`tcpu_avg_10s=$([math]::Round($cpu.Average,1))%`ton_ac=$ac" | Add-Content -Path $OutFile -Encoding utf8
# Battery power throttles the CPU, so a phase must not start unless the machine is on AC.
if (-not $ac) { exit 3 }
