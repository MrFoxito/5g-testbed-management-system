#!/usr/bin/env bash
set -euo pipefail

target_user="${1:-${SUDO_USER:-emsadmin}}"

if ! command -v tshark >/dev/null 2>&1; then
  echo "tshark no está instalado" >&2
  exit 1
fi

if ! getent group wireshark >/dev/null; then
  echo "El grupo wireshark no existe" >&2
  exit 1
fi

usermod -aG wireshark "$target_user"

echo "Usuario $target_user añadido al grupo wireshark."
echo "Cierre y abra nuevamente la sesión antes de ejecutar tshark -D."
getcap /usr/bin/dumpcap || true
