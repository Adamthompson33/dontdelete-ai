# Permanent delete: Castile, HyperPlay, Aviatrix
$permDelete = @(
    "$env:USERPROFILE\Downloads\Castile_1_70_0.apk",
    "$env:USERPROFILE\Downloads\HyperPlay-0.25.1-Setup-x64.exe",
    "$env:USERPROFILE\Downloads\HyperPlay-0.23.0-Setup-x64.exe",
    "$env:USERPROFILE\Downloads\HyperPlay-0.11.2-Setup-x64.exe",
    "$env:USERPROFILE\Downloads\Aviatrix.exe",
    "$env:USERPROFILE\Downloads\Aviatrix (1).exe"
)

foreach ($f in $permDelete) {
    if (Test-Path $f) {
        Remove-Item $f -Force
        Write-Host "DELETED: $f"
    }
}

# Recycle bin: EpicInstaller and Gods Unchained
$shell = New-Object -ComObject Shell.Application
$recycleBin = $shell.NameSpace(0xa)

$toTrash = @(
    "$env:USERPROFILE\Downloads\EpicInstaller-18.0.0-4c8c0c97a2d343de82a8a6ccaf208c40.msi",
    "$env:USERPROFILE\Downloads\EpicInstaller-17.2.0.msi",
    "$env:USERPROFILE\Downloads\EpicInstaller-17.2.0-56a8496ddff2427bbd2c6059a437c074.msi",
    "$env:USERPROFILE\Downloads\Gods+Unchained+Setup+0.15.7 (1).exe",
    "$env:USERPROFILE\Downloads\Gods+Unchained+Setup+0.15.7.exe",
    "$env:USERPROFILE\Downloads\Gods+Unchained+Setup+0.15.7 (2).exe"
)

# Move to recycle bin using Shell COM
Add-Type -AssemblyName Microsoft.VisualBasic
foreach ($f in $toTrash) {
    if (Test-Path $f) {
        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($f, 'OnlyErrorDialogs', 'SendToRecycleBin')
        Write-Host "TRASHED: $f"
    }
}

# Clear temp folder
Write-Host "`nClearing temp folder..."
$before = (Get-ChildItem $env:TEMP -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
Get-ChildItem $env:TEMP -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$after = (Get-ChildItem $env:TEMP -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
$freed = [math]::Round(($before - $after)/1MB, 1)
Write-Host "Temp cleared: freed $freed MB"

# Final space check
$d = Get-PSDrive C
Write-Host ("`nFree space now: {0:N2} GB" -f [math]::Round($d.Free/1GB, 2))
