#!/usr/bin/env bash
# ==============================================================================
# SCRIPT MAESTRO DE ARRANQUE: EMS EDUCATIVO 4G/5G (Linux / macOS / WSL)
# Tesis de Maestria en Ingenieria de las Telecomunicaciones - PUCP
# ==============================================================================
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "========================================================"
echo " INICIANDO EMS EDUCATIVO 4G/5G (MODO DUAL BACKEND+FRONT) "
echo "========================================================"

echo ""
echo "[1/3] Verificando Backend..."
cd "$DIR/backend"
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo ""
echo "[2/3] Verificando Frontend..."
cd "$DIR/frontend"
pnpm run dev --host &
FRONTEND_PID=$!

echo ""
echo "========================================================"
echo " SISTEMA OPERATIVO Y DISPONIBLE"
echo "  - Interfaz Web: http://localhost:5173"
echo "  - API Docs:     http://localhost:8000/docs"
echo "========================================================"
echo ""
echo "Presiona Ctrl+C para detener ambos servicios limpiamente."

cleanup() {
    echo ""
    echo "Deteniendo servicios del EMS..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "Servicios detenidos."
    exit 0
}

trap cleanup INT TERM
wait
