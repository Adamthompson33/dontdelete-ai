$steamPath = "C:\Program Files (x86)\Steam"
if (Test-Path $steamPath) {
    Write-Host "Steam still exists - force removing..."
    Remove-Item $steamPath -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $steamPath) {
        Write-Host "Some locked files remain. Size:"
        $s = (Get-ChildItem $steamPath -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        Write-Host ("{0:N2} GB remaining" -f ($s/1GB))
    } else {
        Write-Host "Steam fully removed!"
    }
} else {
    Write-Host "Steam already gone!"
}

$d = Get-PSDrive C
Write-Host ("`nFree space: {0:N2} GB" -f [math]::Round($d.Free/1GB, 2))
