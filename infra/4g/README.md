# Laboratorio 4G: VMs y conectividad

Esta etapa instala Ubuntu Server 22.04.5 y SSH en cinco VMs de VirtualBox.
No instala aún Open5GS, MongoDB, srsRAN ni configura Attach, bearers o NAT SGi.
En la comprobación inicial se trabaja únicamente con **EMS-EPC-CP y EMS-SGW-U**,
con **1024 MiB de RAM cada una** para SSH. PGW-U, eNodeB y UE quedan pendientes
de creación. Los tamaños de la tabla siguiente corresponden al perfil previsto
al continuar el aprovisionamiento completo, no a esta prueba reducida.
El inventario de conectividad es `backend/app/catalog/lab_vms.json`; el catálogo
de funciones de red existente se conserva para la siguiente etapa.

## Archivos locales externos al repositorio

- ISO: `~/Downloads/ubuntu-22.04.5-live-server-amd64.iso`.
- VMs, discos dinámicos, medios de instalación y claves: `~/VirtualBox VMs/MAEstro-4G/`.
- Usuario SSH: `emsadmin`, con clave privada `id_rsa` en esa carpeta.
- `credentials.json` contiene la contraseña local de administración para la consola y sudo.
  El acceso SSH por contraseña está deshabilitado.
- `known_hosts` contiene las identidades verificadas. El backend rechaza claves diferentes.
- Los archivos `.verified` registran la finalización de la provisión, no el estado actual.

| VM | Hostname | IP interna | SSH en Windows | RAM inicial |
| --- | --- | --- | --- | --- |
| EMS-EPC-CP | epc-cp | 10.210.40.1 | 127.0.0.1:2230 | 2048 MiB |
| EMS-SGW-U | sgwu-vm | 10.210.40.2 | 127.0.0.1:2231 | 1536 MiB |
| EMS-PGW-U | pgwu-vm | 10.210.40.3 | 127.0.0.1:2232 | 1536 MiB |
| EMS-ENB | enb-vm | 10.210.40.10 | 127.0.0.1:2233 | 1536 MiB |
| EMS-UE-4G | ue-vm | 10.210.40.11 | 127.0.0.1:2234 | 1536 MiB |

Cada VM utiliza NAT en `enp0s3` y la red interna `EMS-LAB-4G` en `enp0s8`.
No se utiliza bridge. Los puertos de gestión se enlazan únicamente a localhost.
El perfil inicial usa 8 GiB de RAM en total, pendiente de redimensionar al instalar EPC/RAN.

La primera VM se instala desde la ISO y se apaga antes de clonar las otras cuatro.
Las copias son independientes (sin discos base compartidos), con MAC, hostname,
machine-id y claves SSH de servidor propios. Heredan discos de capacidad virtual
30 GiB: 150 GiB máximos entre las cinco, aunque inicialmente ocupan mucho menos.
Vigilar el espacio real disponible antes de instalar paquetes o crear snapshots.
La instalación se verifica por SSH y después cada VM se apaga para limitar consumo.

## Preparación y operación

Desde la raíz del repositorio, con las dependencias del backend instaladas:

```powershell
backend/.venv/Scripts/python.exe infra/4g/provision_vms.py
backend/.venv/Scripts/python.exe infra/4g/manage_vms.py start
backend/.venv/Scripts/python.exe infra/4g/manage_vms.py status
backend/.venv/Scripts/python.exe infra/4g/manage_vms.py stop
```

El aprovisionador verifica el SHA-256 de la ISO antes de instalar. No recrea VMs
existentes ni modifica las máquinas del laboratorio 5G. `start` rechaza el arranque
si hay VMs ajenas a este laboratorio encendidas. `stop` solicita apagado ACPI,
sin forzarlo. Los scripts usan VBoxManage instalado en su ruta estándar de Windows.

Para activar la interfaz 4G en el Docker Desktop de Windows:

```powershell
docker compose -f docker-compose.yml -f docker-compose.4g.yml up -d --build
```

También se puede ejecutar `./infra/4g/start_web.ps1` desde PowerShell.
Para esta comprobación inicial, encender solo EPC-CP y SGW-U desde VirtualBox;
`manage_vms.py start` está reservado para cuando estén preparadas las cinco VMs.

Abrir `http://localhost:8080` e ingresar con el usuario EMS habitual. Seleccionar
**4G EPC** en el navbar. Se muestran las cinco VMs y el resultado real de SSH,
hostname e IP interna, renovado cada diez segundos. **5G Standalone** muestra
un estado vacío: no hay un laboratorio 5G desplegado en este perfil.
No se montan las vistas de NFs ni se publican métricas simuladas. Los endpoints
de operación y el WebSocket de NFs quedan bloqueados en esta etapa.

Este comando no carga `docker-compose.override.yml`, que conserva la configuración
local anterior de 5G. No usar simplemente `docker compose up` para este laboratorio.
Las claves se montan en Docker como archivos de solo lectura. El contenedor llega
a los puertos NAT a través de `host.docker.internal`, comprobando la identidad del
destino `127.0.0.1:puerto` registrada durante la provisión.

Para backend nativo se puede usar `EMS_DEPLOYMENT_STAGE=connectivity` y
`EMS_DEPLOYED_SCENARIOS=["4g-epc"]`; las rutas SSH predeterminadas apuntan a la
carpeta externa del usuario. `EMS_DEPLOYMENT_STAGE=full` mantiene el EMS anterior.

## Verificación

```powershell
cd backend
.venv/Scripts/python.exe -m pytest tests/test_vm_connectivity.py -q
cd ../frontend
npm run build
node verify-vm-connectivity.mjs
```

La prueba de navegador usa Edge instalado y el frontend en el puerto 8080.
Verifica selección persistente, cinco tarjetas 4G, ausencia de datos 5G,
aislamiento de enlaces directos, ausencia de consultas a NFs y diseño móvil.
Las comprobaciones SSH no equivalen a validar LTE ni a verificar todos los enlaces
entre VMs; esas pruebas corresponden a etapas posteriores.

Referencias para la instalación desatendida:
[Ubuntu Autoinstall](https://canonical-subiquity.readthedocs-hosted.com/en/latest/reference/autoinstall-reference.html)
y las plantillas instaladas con VirtualBox en `UnattendedTemplates/`.
