# VM piloto UPF

## Diseño local

- Nombre VirtualBox: `EMS-UPF-01`.
- Objetivo: 2 vCPU, 2 GiB RAM, disco VDI dinámico de 25 GiB.
- Instalación Ubuntu Server 22.04.5 desde ISO local verificada por SHA-256:
  `9bc6028870aef3f74f4e16b900008179e78b130e6b0b9a140635434a46aa98b0`.
- NIC 1 NAT; forwarding SSH limitado a `127.0.0.1:2223`.
- NIC 2 red interna `EMS-LAB-N4`, dirección `10.210.50.8/24`, sin gateway.
- Usuario `emsadmin`; contraseña tomada del entorno local existente, nunca del repositorio.
- La red interna no es visible directamente desde Windows: administración mediante SSH NAT.

## Creación

Desde la raíz `Code`, ejecutar con el Python del backend:

```powershell
backend/.venv/Scripts/python.exe infra/create_upf_vm.py
```

El script se niega a sobrescribir una VM o carpeta existente. No modifica el core ni el backup. No ejecutar mientras exista una instalación parcial: inspeccionarla primero. El instalador escribe únicamente en el disco de la VM nueva; nunca adjuntar discos ajenos a esta VM.

VirtualBox genera medios auxiliares con información de instalación y hash de contraseña. Mantenerlos fuera de Git y de informes públicos. Cambiar a credenciales individuales/SSH por clave antes de desplegar en VNRT.

## Incidencia de instalación

El primer arranque del instalador con dos vCPU mostró un bloqueo RCU. Se reinició exclusivamente la VM nueva con una vCPU y el instalador avanzó. La causa no se ha demostrado; no se deshabilitó Hyper-V ni se modificaron aplicaciones del host. Restaurar y verificar las dos vCPU tras instalar; si reaparece, documentar y conservar un perfil estable antes de realizar mediciones.

## Integración posterior

La creación no migra el UPF actual. Se requiere:

1. Confirmar instalación en disco, IP privada y SSH.
2. Instalar una versión de Open5GS-UPF compatible con el core (`2.8.0~jammy5` en el baseline revisado), sin instalar el metapaquete de todo el core.
3. Configurar PFCP/GTP-U, túnel y forwarding solo en la VM piloto.
4. Añadir al core conectividad privada preservando NAT/SSH, durante ventana controlada.
5. Adaptar el EMS a destinos por nodo antes de atribuir métricas/operaciones al UPF remoto.
6. Cambiar SMF/RAN hacia el UPF piloto únicamente después del preflight y con rollback probado.

No asumir que una VM con nombre UPF tiene el servicio instalado, ni que un servicio activo ya participa en las sesiones.
