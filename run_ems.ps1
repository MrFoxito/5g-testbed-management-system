# ==============================================================================
# SCRIPT MAESTRO DE ARRANQUE: EMS EDUCATIVO 4G/5G
# Tesis de Maestria en Ingenieria de las Telecomunicaciones - PUCP
# Autor: Jose Vicente Rodriguez S.
# ==============================================================================

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " INICIANDO EMS EDUCATIVO 4G/5G (MODO DUAL BACKEND+FRONT) " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$CodeDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# 1. Comprobacion de Testbed VM
Write-Host "`n[1/3] Verificando conectividad con el Testbed VM (Puerto 2222)..." -ForegroundColor Yellow
$tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port 2222 -WarningAction SilentlyContinue
if ($tcp.TcpTestSucceeded) {
    Write-Host "  -> Conectado exitosamente con la VM Ubuntu por SSH (127.0.0.1:2222)" -ForegroundColor Green
} else {
    Write-Host "  -> AVISO: El puerto 2222 no responde. Asegurate de que la VM VirtualBox este corriendo." -ForegroundColor Red
}

# 2. Iniciar Backend FastAPI
Write-Host "`n[2/3] Levantando Backend FastAPI (http://localhost:8000)..." -ForegroundColor Yellow
$backendProcess = Start-Process -FilePath "$CodeDir\backend\.venv\Scripts\python.exe" `
    -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" `
    -WorkingDirectory "$CodeDir\backend" `
    -PassThru

# 3. Iniciar Frontend Vite
Write-Host "`n[3/3] Levantando Frontend Vite (http://localhost:5173)..." -ForegroundColor Yellow
$frontendProcess = Start-Process -FilePath "pnpm.cmd" `
    -ArgumentList "run dev --host" `
    -WorkingDirectory "$CodeDir\frontend" `
    -PassThru

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host " SISTEMA OPERATIVO Y DISPONIBLE" -ForegroundColor Green
Write-Host "  - Interfaz Web: http://localhost:5173" -ForegroundColor White
Write-Host "  - API REST Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "  - Credenciales por defecto:" -ForegroundColor Gray
Write-Host "      * Docente: docente / teacher-change-me" -ForegroundColor Gray
Write-Host "      * Alumno:  alumno  / student-change-me" -ForegroundColor Gray
Write-Host "      * Admin:   admin   / admin-change-me" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Green
Write-Host "`nPresiona [Enter] en esta consola para detener ambos servicios limpiamente..." -ForegroundColor Magenta

Read-Host

Write-Host "`nDeteniendo servicios del EMS..." -ForegroundColor Yellow
Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
Write-Host "Servicios detenidos con exito. Hasta luego!" -ForegroundColor Green
