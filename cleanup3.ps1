# Empty recycle bin
Write-Host "Emptying recycle bin..."
Clear-RecycleBin -Force -ErrorAction SilentlyContinue
Write-Host "Recycle bin emptied."

# Uninstall Steam (includes Civ VI)
Write-Host "`nRemoving Steam (includes Civ VI)..."
$steamPath = "C:\Program Files (x86)\Steam"

# Try uninstaller first
$uninstaller = "$steamPath\uninstall.exe"
if (Test-Path $uninstaller) {
    Write-Host "Running Steam uninstaller..."
    Start-Process $uninstaller -ArgumentList "/S" -Wait -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
}

# Force remove whatever's left
if (Test-Path $steamPath) {
    Write-Host "Cleaning up remaining files..."
    Remove-Item $steamPath -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $steamPath)) {
    Write-Host "Steam fully removed."
} else {
    Write-Host "WARNING: Some files may still be locked. Try after reboot."
}

# Final space check
$d = Get-PSDrive C
Write-Host ("`nFree space now: {0:N2} GB" -f [math]::Round($d.Free/1GB, 2))
