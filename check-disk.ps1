$d = Get-PSDrive C
$usedGB = [math]::Round($d.Used/1GB, 2)
$freeGB = [math]::Round($d.Free/1GB, 2)
Write-Host "Used: $usedGB GB"
Write-Host "Free: $freeGB GB"
Write-Host "Total: $([math]::Round(($d.Used + $d.Free)/1GB, 2)) GB"

Write-Host "`nTop items in Downloads by size:"
Get-ChildItem "$env:USERPROFILE\Downloads" -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 20 | ForEach-Object { Write-Host ("  {0:N1} MB  {1}" -f ($_.Length/1MB), $_.Name) }

$tempSize = (Get-ChildItem $env:TEMP -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
Write-Host ("`nTemp folder: {0:N1} MB" -f ($tempSize/1MB))
