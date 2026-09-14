# Use this entry point so the old local 5G override is not loaded.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location $repoRoot
try {
    & docker compose -f docker-compose.yml -f docker-compose.4g.yml up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el perfil web 4G.' }
    Write-Host 'Interfaz 4G disponible en http://localhost:8080. Enciende las VMs desde VirtualBox.'
} finally {
    Pop-Location
}
