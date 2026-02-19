# Check Civ VI and Steam sizes first
Write-Host "=== Checking sizes ==="

# Common Steam locations
$steamPaths = @(
    "C:\Program Files (x86)\Steam",
    "C:\Program Files\Steam",
    "$env:USERPROFILE\Steam"
)

foreach ($p in $steamPaths) {
    if (Test-Path $p) {
        $size = (Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        Write-Host ("Steam folder: $p = {0:N2} GB" -f ($size/1GB))
    }
}

# Check for Civ VI specifically
$civPaths = @(
    "C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI",
    "C:\Program Files\Steam\steamapps\common\Sid Meier's Civilization VI"
)

foreach ($p in $civPaths) {
    if (Test-Path $p) {
        $size = (Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        Write-Host ("Civ VI: {0:N2} GB" -f ($size/1GB))
    }
}

# Check recycle bin size
$shell = New-Object -ComObject Shell.Application
$bin = $shell.NameSpace(0xa)
$binItems = $bin.Items()
Write-Host ("`nRecycle Bin: {0} items" -f $binItems.Count)

# Current free space
$d = Get-PSDrive C
Write-Host ("`nCurrent free space: {0:N2} GB" -f [math]::Round($d.Free/1GB, 2))
