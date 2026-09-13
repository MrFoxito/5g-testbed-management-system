# Auditoría inicial de VM para evolución multi-VM

Fecha local: 2026-09-12. Fecha observada en invitado: 2026-09-13 UTC.

## Identificación y respaldo

- VM intervenida: `EMS-Testbed-4G5G`, UUID `8691d5e1-ccc8-48e9-9f35-e54c10d761a1`.
- Acceso EMS: SSH `127.0.0.1:2222`, usuario `emsadmin`.
- Copia del usuario: `EMS-Testbed-4G5G Backup`, apagada durante la revisión.
- Su disco es VDI base independiente, dinámico, de 80 GiB de capacidad; no se encendió ni se verificó restauración funcional. Existencia de copia no equivale a prueba de recuperación.

## Recursos observados

| Elemento | Lectura |
|---|---|
| Host Windows | Aproximadamente 32 GiB RAM; 15,6 GiB libres en la lectura inicial |
| VM asignada | 8 vCPU; 12 GiB RAM |
| Memoria invitado | 11.956 MiB total; 544 MiB usada según `free -m`; sin swap |
| Disco virtual | 80 GiB; raíz ext4 de aproximadamente 79 GiB |
| Espacio raíz | 8,8 GiB usados, 66 GiB disponibles según `df -h` |
| Disco host C: | Aproximadamente 195 GiB disponibles |

Son lecturas puntuales cercanas al arranque, no mediciones de capacidad, carga sostenida ni picos. No justifican por sí solas reducir RAM o prometer rendimiento para 12 VMs.

## Software y red

- Open5GS empaquetado `2.8.0~jammy5`; kernel `5.15.0-191-generic`.
- Servicios EPC y 5GC activos, MongoDB y UERANSIM gNB/UE activos.
- Estado activo de servicios EPC no demuestra attach 4G; no se comprobó un UE LTE en esta intervención.
- UERANSIM instalado en `/home/emsadmin/UERANSIM`; no se fijó todavía commit ni diff de modificaciones locales.
- Solo NIC 1 NAT; NIC 2–8 deshabilitadas. `enp0s3=10.0.2.15/24`, SSH mediante port forwarding.
- `ogstun=10.45.0.1/16`; túnel UE dentro de namespace separado.
- NTP reporta sincronización. No se ha medido offset entre hosts.

## Incidente y acción realizada

Los logs mostraron registro y PDU exitosos tras el arranque, seguidos por pérdida de enlace simulado, Service Request con fallo de selección de AMF y expiración T3517. gNB reportó `is-ngap-up: true` en la consulta posterior. La causa raíz del episodio no está determinada.

Se reinició únicamente `ueransim-ue.service`, con autorización del usuario para intervenir la VM experimental. Esto recuperó la conexión; no constituye una corrección permanente del episodio anterior.

Verificación posterior:

- UE: `RM-REGISTERED`, `CM-CONNECTED`, `MM-REGISTERED/NORMAL-SERVICE`.
- PDU: `PS-ACTIVE`, IPv4, DNN `internet`, IP `10.45.0.3`.
- Ping desde el namespace UE a `10.45.0.1`: 3/3 respuestas, sin pérdida.
- Ping desde el namespace UE a `8.8.8.8`: 3/3 respuestas, sin pérdida.
- El tráfico se originó dentro del namespace UE, no desde el host Linux.

No se cambiaron YAML, rutas, firewall, recursos, servicios del core ni la VM de backup. No se crearon otras VMs.

## Siguiente incremento

1. Fijar commit/diff de UERANSIM y manifestar configuraciones con secretos protegidos.
2. Probar continuidad tras período idle y nuevo tráfico para investigar Service Request; no escalar sobre un fallo no caracterizado.
3. Preparar red privada entre VMs conservando NAT/SSH; comprobar conflictos de direccionamiento y conectividad de gestión.
4. Crear una VM UPF experimental dimensionada para el piloto, no clonar indiscriminadamente el core completo.
5. Adaptar resolución de host por nodo en EMS antes de gestionar el nuevo UPF como si estuviera en la VM original.
6. Conmutar SMF/RAN hacia UPF remoto en ventana controlada, con rollback y pruebas N3/N4/datos.

La provisión de red y VM adicional queda pendiente; este informe cierra la auditoría inicial, no el despliegue distribuido.
