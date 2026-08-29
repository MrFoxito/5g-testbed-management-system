#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Ejecute este script con sudo." >&2
  exit 1
fi

LAB_USER="${SUDO_USER:-emsadmin}"
LAB_HOME="$(getent passwd "${LAB_USER}" | cut -d: -f6)"
UERANSIM_DIR="${LAB_HOME}/UERANSIM"
DBCTL="${LAB_HOME}/open5gs-dbctl"

if [[ ! -x "${UERANSIM_DIR}/build/nr-gnb" || ! -x "${UERANSIM_DIR}/build/nr-ue" ]]; then
  echo "UERANSIM no esta compilado en ${UERANSIM_DIR}." >&2
  exit 1
fi

# En una VM unica, aislar el TUN del UE evita que la ruta /24 de UERANSIM
# intercepte el trafico de retorno que debe atravesar ogstun y el UPF.
sed -i 's/^useNamespace: false/useNamespace: true/' \
  "${UERANSIM_DIR}/config/open5gs-ue.yaml"

curl -fsSL \
  https://raw.githubusercontent.com/open5gs/open5gs/main/misc/db/open5gs-dbctl \
  -o "${DBCTL}"
chown "${LAB_USER}:${LAB_USER}" "${DBCTL}"
chmod 700 "${DBCTL}"

SUBSCRIBER_COUNT="$(mongosh --quiet mongodb://127.0.0.1/open5gs \
  --eval 'db.subscribers.countDocuments({imsi:"999700000000001"})' | tail -n 1)"

if [[ "${SUBSCRIBER_COUNT}" == "0" ]]; then
  sudo -u "${LAB_USER}" "${DBCTL}" add \
    999700000000001 \
    465B5CE8B199B49FAA5F0A2EE238A6BC \
    E8ED289DEBA952E4283B54E88E6183CA >/dev/null
fi

cat > /etc/systemd/system/open5gs-lab-network.service <<'EOF'
[Unit]
Description=Open5GS educational lab network rules
After=network-online.target open5gs-upfd.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/sysctl -w net.ipv4.ip_forward=1
ExecStart=/bin/sh -c '/usr/sbin/iptables -t nat -C POSTROUTING -s 10.45.0.0/16 ! -o ogstun -j MASQUERADE 2>/dev/null || /usr/sbin/iptables -t nat -A POSTROUTING -s 10.45.0.0/16 ! -o ogstun -j MASQUERADE'
ExecStop=/bin/sh -c '/usr/sbin/iptables -t nat -C POSTROUTING -s 10.45.0.0/16 ! -o ogstun -j MASQUERADE 2>/dev/null && /usr/sbin/iptables -t nat -D POSTROUTING -s 10.45.0.0/16 ! -o ogstun -j MASQUERADE || true'

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/ueransim-gnb.service <<EOF
[Unit]
Description=UERANSIM simulated 5G gNodeB
After=open5gs-amfd.service open5gs-lab-network.service
Requires=open5gs-lab-network.service

[Service]
Type=simple
User=${LAB_USER}
WorkingDirectory=${UERANSIM_DIR}
ExecStart=${UERANSIM_DIR}/build/nr-gnb -c ${UERANSIM_DIR}/config/open5gs-gnb.yaml
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/ueransim-ue.service <<EOF
[Unit]
Description=UERANSIM simulated 5G UE
After=ueransim-gnb.service
Requires=ueransim-gnb.service

[Service]
Type=simple
WorkingDirectory=${UERANSIM_DIR}
ExecStartPre=/bin/sleep 2
ExecStart=${UERANSIM_DIR}/build/nr-ue -c ${UERANSIM_DIR}/config/open5gs-ue.yaml
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now open5gs-lab-network.service
systemctl enable --now ueransim-gnb.service
systemctl enable --now ueransim-ue.service
systemctl restart ueransim-gnb.service
systemctl restart ueransim-ue.service

echo "Laboratorio 5G SA configurado."
systemctl --no-pager --full status ueransim-gnb.service ueransim-ue.service || true
