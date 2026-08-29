# Plan de implementación: plataforma web educativa de gestión y orquestación 4G/5G

La plataforma implementa un EMS educativo inspirado en FCAPS para testbeds Open5GS y srsRAN previamente instalados. No pretende conformidad FCAPS completa ni equivalencia *carrier-grade* con plataformas comerciales.

## Alcance funcional

- **Fault:** salud de componentes, logs y alarmas determinísticas.
- **Configuration:** catálogo de escenarios, configuración YAML con respaldo y suscriptores Open5GS.
- **Performance:** CPU, memoria, throughput de interfaces y estados disponibles.
- **Security:** RBAC, asignación lógica de testbed y auditoría.
- **Análisis educativo:** capturas PCAP limitadas mediante `tshark`.
- **Fuera de alcance:** Accounting, creación de VM/OpenStack/Heat, alta disponibilidad comercial y terminal root desde el navegador.

## Arquitectura

```text
shadcn-admin (React/TypeScript) ── REST/WebSocket ── FastAPI ── ExecutionAdapter ── core existente
                                ├──── SQLite (usuarios/auditoría/estado)
                                ├──── MongoDB Open5GS (suscriptores)
                                └──── tshark (capturas limitadas)
```

El frontend usa la plantilla MIT `satnaing/shadcn-admin`, shadcn/ui, TanStack Router/Table, Tailwind, Sonner, React Flow y Monaco. El core Open5GS/srsRAN se considera previamente desplegado: el EMS no crea VM, contenedores ni funciones de red. El modo `simulated` permite desarrollar sin VNRT; `local` observa un core en la misma VM y `remote` accede al VNRT por SSH con host conocido y comandos permitidos.

## Entregas

1. Base, autenticación, RBAC, auditoría y contratos API.
2. Inventario de perfiles 4G EPC/5G SA, conexión al core existente y comprobación de salud.
3. Topología, logs, alarmas y métricas en vivo.
4. Configuración respaldable, suscriptores y capturas PCAP.
5. Integración local/VNRT y evaluación con usuarios.

## Criterios de aceptación

- Conexión y verificación controlada de un perfil EPC y uno 5G SA ya desplegados.
- Actualización de salud/topología en no más de cinco segundos.
- Restauración del último respaldo de configuración.
- Secretos de suscriptores ausentes en respuestas y auditoría.
- PCAP descargable dentro de límites de tiempo y tamaño.
- Operaciones docentes bloqueadas para alumnos y auditadas.
- Validación comparativa CLI/web y encuesta SUS con objetivo de 68 o más.
