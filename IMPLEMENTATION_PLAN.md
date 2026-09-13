# Plan de implementación: EMS educativo multi-VM para laboratorios 4G/5G

> Ampliación propuesta (2026-09-12): el [plan del testbed 5G de 12 VMs](PLAN_TESTBED_5G_12_VM.md) define el nuevo alcance multiinstancia y CHF, sus fases y criterios de aceptación. Este documento se conserva como plan base e histórico; la exclusión inicial de Accounting se revisa para esa extensión 5G, sin implicar que ya esté implementada.

## 1. Decisión de enfoque

Se desarrollará una **plataforma web educativa inspirada en EMS/FCAPS** para gestionar, monitorear y analizar testbeds 4G/5G open source desplegados en máquinas virtuales locales y en el VNRT de la PUCP.

La plataforma no creará máquinas virtuales ni sustituirá el Módulo 2 basado en OpenStack/Heat. Los testbeds se instalarán previamente y el EMS operará sobre ellos mediante acciones controladas: consultar estado, iniciar o detener componentes, revisar configuraciones, detectar fallas, observar KPIs y generar capturas PCAP.

El producto principal será una consola propia basada en **shadcn-admin + FastAPI**. OpenTelemetry y OpenObserve podrán incorporarse como capa avanzada, pero el EMS deberá funcionar completamente sin ellos.

Formulación académica recomendada:

> Plataforma web educativa inspirada en EMS/FCAPS para la gestión, supervisión y análisis de testbeds virtualizados 4G/5G basados en Open5GS y srsRAN/UERANSIM.

No se afirmará que la plataforma es carrier-grade, que implementa FCAPS completo ni que equivale a productos comerciales.

## 2. Problema y aporte central

Los laboratorios actuales requieren alternar entre VNRT/VNC, SSH, `systemctl`, archivos YAML, logs, `tcpdump`, Wireshark y distintas máquinas virtuales. Esto consume tiempo de práctica y exige conocimientos de administración que no constituyen el objetivo principal del curso.

El aporte será integrar ese flujo en una consola que responda:

- Qué nodos, NFs e interfaces forman el escenario.
- Qué componentes están activos, degradados o detenidos.
- Qué interfaz y procedimiento pueden estar afectados.
- Qué logs y configuración corresponden al componente seleccionado.
- Qué captura debe iniciarse para analizar el problema.
- Qué KPIs permiten comprobar el funcionamiento.
- Qué evidencia puede exportarse para el informe.

## 3. Alcance comprometido

Se implementará un subconjunto de FCAPS:

- **Fault:** salud, logs y alarmas determinísticas.
- **Configuration:** visualización, validación y modificación guiada de parámetros permitidos.
- **Performance:** KPIs de infraestructura y telecomunicaciones disponibles.
- **Security:** autenticación, autorización de operaciones y auditoría básica.
- **Accounting:** fuera del alcance.

El análisis de protocolos será un módulo educativo complementario a FCAPS.

Se soportarán dos arquitecturas base:

- **4G:** Open5GS EPC + srsRAN 4G, según la distribución multi-VM del Laboratorio 3.
- **5G SA:** Open5GS 5GC + UERANSIM o srsRAN, según el Laboratorio 4.

## 4. Diferenciación respecto de plataformas de observabilidad

| Dimensión | O&M basado en Grafana | EMS educativo propuesto |
| --- | --- | --- |
| Interfaz | Dashboards | Consola de gestión propia |
| Unidad | Servicio/contenedor | Testbed, VM, NF, interfaz y procedimiento |
| Entorno | Despliegue containerizado | Flujo local y VNRT multi-VM |
| Operación | Principalmente observación | Acciones permitidas, validaciones y capturas |
| Configuración | No es el foco | Vista y validación contextual por NF |
| Trazas | Telemetría/paneles | PCAP dirigido por NF, interfaz y procedimiento |
| Fallas | Alerta por métrica | Alarma con impacto telco y evidencia |
| Valor educativo | Observar | Diagnosticar y documentar una práctica |

El proyecto **OM_module** y la tesis asociada se incluirán como trabajo relacionado cuando exista una referencia académica o repositorio citable. Se reconocerá su aporte de observabilidad. Nuestra contribución se presentará como una dimensión complementaria orientada a gestión educativa multi-VM.

No se copiarán su código, dashboards, nomenclatura E1-E4 ni composición exacta de escenarios. Los casos propios se derivarán de los Laboratorios 3 y 4 y de procedimientos documentados de 3GPP/Open5GS.

## 5. Arquitectura objetivo

```text
+------------------------------------------------------------------+
| EMS Web: shadcn-admin                                             |
| Dashboard | Topología | Salud | Alarmas | Trazas | Configuración  |
+--------------------------------+---------------------------------+
                                 | REST + WebSocket
+--------------------------------v---------------------------------+
| Backend FastAPI                                                   |
| Inventario | Ejecución | Reglas | PCAP | KPIs | Auditoría         |
+----------------------+--------------------------+----------------+
                       |                          |
              SSH/agente controlado      Telemetría opcional
                       |                          |
+----------------------v----------------+  +------v----------------+
| VM local / VNRT multi-VM              |  | OTel Collector       |
| EPC/5GC | UPF | eNB/gNB | UE          |  | + OpenObserve        |
| Open5GS | srsRAN/UERANSIM | tshark     |  | histórico/búsqueda   |
+---------------------------------------+  +-----------------------+
```

Principios:

- El navegador nunca enviará comandos arbitrarios como `root`.
- FastAPI ejecutará únicamente operaciones declaradas en una lista permitida.
- Las credenciales estarán en variables de entorno, no en el repositorio.
- Para desarrollar sin VM se usará un JSON mock, no un simulador complejo.
- El acceso real usará `LocalExecutionAdapter` o `RemoteExecutionAdapter` por SSH.
- OpenObserve será opcional y nunca reemplazará la consola EMS.
- La MongoDB de Open5GS será exclusiva para suscriptores; los datos EMS irán separados.

## 6. Modelo de dominio mínimo

- `Testbed`: escenario 4G o 5G.
- `Node`: VM participante.
- `NetworkFunction`: AMF, SMF, UPF, MME, HSS, eNB, gNB, UE, etc.
- `TelcoInterface`: N1, N2, N3, N4, N6, SBI, S1-MME, S1-U, S6a, S11 o S5/S8.
- `Operation`: acción permitida sobre un nodo o NF.
- `Alarm`: condición, severidad, impacto y evidencia.
- `Capture`: PCAP y metadatos.
- `KpiSample`: indicador temporal.
- `Subscriber`: identidad y perfil mínimo de UE.
- `AuditEvent`: usuario, acción, destino, resultado y fecha.

Estados de testbed: `unknown`, `stopped`, `starting`, `running`, `degraded`, `failed`, `stopping`.

Estados de NF: `up`, `down`, `degraded`, `unknown`.

## 7. Siete módulos del sistema

### 7.1. Inventory & Topology

Representará dos vistas:

- **Laboratorio:** VMs de Core, UPF, eNB/gNB y UE, con IP de gestión e in-band.
- **Telco:** NFs e interfaces lógicas 3GPP.

La topología será interactiva: movimiento, zoom, selección y detalle. Los colores mostrarán estado real. El inventario declarará direcciones, roles, servicios, interfaces, puertos, configuraciones, operaciones y health checks esperados.

### 7.2. Execution & Control Gateway

Ofrecerá una interfaz común local/SSH para:

- consultar servicios, procesos, interfaces y puertos;
- iniciar, detener y reiniciar NFs autorizadas;
- ejecutar pruebas de conectividad predefinidas;
- iniciar o detener RAN y UE;
- comprobar NAT, forwarding y túneles;
- ejecutar scripts reproducibles de preparación y validación.

Una terminal web completa no será requisito de aprobación.

### 7.3. Health, Alarms & Logs

Fusionará monitoreo, logs y alarmas. Comprobará inicialmente:

- servicio o proceso detenido;
- interfaz sin dirección esperada;
- puerto de señalización no disponible;
- NAT o `ip_forward` ausente;
- IP configurada distinta de la real;
- eNB/gNB no conectado;
- UE sin attach/registration;
- bearer EPS o PDU Session ausente.

Cada alarma incluirá severidad, nodo, NF, interfaz, procedimiento potencialmente afectado, evidencia, sugerencia y estado `active`, `acknowledged` o `cleared`. Los logs se filtrarán por NF, nivel y texto y podrán abrirse desde la alarma.

### 7.4. Trace Studio

Se implementará como un **Trace Task Center** con dos modos:

- **Interface Trace:** captura dirigida por testbed, nodo, NF e interfaz 3GPP.
- **Subscriber Trace 5G:** tarea por SUPI/IMSI o IP UE que reconstruye el recorrido UE–gNB–AMF–AUSF/UDM–SMF–UPF.

Permitirá:

- seleccionar testbed, nodo, interfaz y protocolo;
- filtrar S1AP, NGAP, NAS, Diameter, GTPv2-C, GTP-U, PFCP y SBI;
- limitar duración, tamaño y cantidad de capturas;
- iniciar, detener y descargar PCAP;
- resumir protocolos mediante `tshark`;
- asociar una captura con una alarma o procedimiento.
- mantener un ciclo persistente de tareas (`queued`, `preparing`, `running`, `processing`, `completed`, `failed` e `interrupted`);
- correlacionar SUPI enmascarado, RAN/AMF UE NGAP ID, PDU Session ID, PFCP SEID, GTP-U TEID e IP UE;
- delimitar el procedimiento objetivo desde su Registration Request para no mezclar contextos anteriores;
- mostrar línea temporal y diagrama de secuencia con procedencia de evidencia;
- descargar captura original, PCAP correlacionado y evidencia JSON;
- aplicar propiedad por usuario, cuotas por rol, comandos autorizados y auditoría sin secretos.

N1 no se presentará como una interfaz física independiente: los mensajes NAS se decodificarán dentro de NGAP capturado sobre N2. La correlación avanzada por suscriptor se compromete inicialmente para 5G SA; 4G EPC conservará captura por interfaz y su correlación E2E quedará como extensión.

### 7.5. Configuration & Subscribers

La configuración permitirá:

- visualizar YAML/conf por NF y ocultar secretos;
- validar sintaxis, IP, puerto, MCC, MNC, TAC, APN/DNN y S-NSSAI;
- comprobar coherencia entre core, RAN y UE;
- comparar con una plantilla esperada;
- modificar mediante formularios solo campos autorizados.

La edición YAML libre y el rollback general quedan fuera. Antes de una modificación guiada se guardará una copia del archivo afectado.

La gestión mínima de suscriptores permitirá listar, consultar, crear desde plantilla, validar contra el UE y asociar IMSI/SUPI con sesiones, alarmas y capturas. Ki y OPc nunca se devolverán completos. No se intentará reemplazar toda la Open5GS WebUI.

### 7.6. Dashboard & KPIs

El módulo se implementará como un **Performance Studio** inspirado funcionalmente en los centros de consulta de un EMS comercial, pero con identidad visual propia. No será solamente un dashboard fijo. Incluirá:

- recolector asíncrono ejecutado por FastAPI, independiente del navegador;
- almacenamiento histórico EMS separado de MongoDB de Open5GS;
- catálogo declarativo de objetos y contadores compatibles;
- constructor de consultas en tres pasos: objeto, contador y tiempo;
- biblioteca de carpetas y consultas personales o compartidas con el testbed;
- selección de granularidad y agregación (`avg`, `min`, `max`, `sum`, `last`);
- gráficas multiserie y actualización periódica;
- retención configurable y exportación posterior como evidencia.

El modelo de muestra tendrá como mínimo `timestamp`, `testbed_id`, `scenario_id`, `object_id`, `counter_id`, `value`, `unit`, `source` y `quality`. Durante el desarrollo local se usará SQLite. La identidad `testbed_id` permitirá separar los históricos de cada grupo cuando se conecten las instancias VNRT; no se mezclarán muestras entre grupos.

Objetos consultables iniciales:

- testbed y host;
- funciones de red Open5GS, RAN y UE;
- interfaces Linux observadas;
- procedimientos 5G Registration y PDU Session cuando exista evidencia.

KPIs comprometidos:

- NFs activas frente al total;
- estado por VM, CPU y RAM;
- throughput por interfaz;
- UEs attached/registered cuando la evidencia lo permita;
- bearers EPS y PDU Sessions detectadas;
- intentos, éxitos y rechazos de Registration/Attach y establecimiento de sesión;
- tasa de éxito y latencia obtenidas correlacionando eventos del journal;
- rechazos 5G clasificados por autenticación, suscriptor, DNN y S-NSSAI;
- alarmas por severidad;
- capturas y paquetes por protocolo.

Los contadores procedimentales se deduplicarán mediante una clave estable antes de persistirse, de modo que una nueva lectura del journal o un reinicio del backend no incremente artificialmente los resultados. Las latencias se calcularán entre el intento inmediatamente anterior y su resultado dentro de una ventana válida. Cada serie indicará su fuente y calidad (`measured`, `computed` o `derived`). No se inventarán métricas no sustentadas por Open5GS, RAN, UE, logs o PCAP.

### 7.7. Evidence & Audit

Exportará inventario, estado, alarmas, KPIs, validaciones, metadatos de capturas y operaciones en JSON y CSV. HTML/PDF será opcional.

Cada operación privilegiada registrará usuario, rol, testbed, acción, parámetros no sensibles, resultado y fecha. Se mantendrán perfiles docente/administrador y alumno, sin presentar RBAC como contribución principal.

## 8. Casos experimentales propios

| Código | Caso | Resultado esperado |
| --- | --- | --- |
| `4G-C01` | Attachment y EPS bearer exitosos | Topología saludable, UE attached y tráfico |
| `4G-F01` | Ki/OPc incompatible | Rechazo, alarma y logs relacionados |
| `4G-F02` | APN no permitido | Fallo de bearer, causa y PCAP |
| `4G-F03` | MME o SGW detenido | NF e interfaces afectadas |
| `5G-C01` | Registration y PDU Session exitosas | UE registered, sesión y conectividad |
| `5G-F01` | SUPI no provisionado | Rechazo y evidencia AMF/UDM/AUSF |
| `5G-F02` | DNN o S-NSSAI incompatible | PDU Session rechazada y causa |
| `5G-F03` | AMF, SMF o UPF detenido | Impacto en N2/N4/N3 |
| `OPS-F01` | NAT o forwarding retirado | Control activo y usuario sin conectividad |

Las fallas usarán scripts reversibles y parametrizados. Cada prueba restaurará el estado previo y comprobará que no queden procesos o reglas residuales.

## 9. Plan de ejecución en seis sprints

### Sprint 1 — Base reproducible y contratos (2-3 días)

- Consolidar shadcn-admin y FastAPI.
- Fijar versiones de Ubuntu, Open5GS, srsRAN/UERANSIM y tshark.
- Mantener funcional el 5G SA local y preparar el baseline 4G.
- Definir inventario y contratos REST/WebSocket.
- Crear scripts `setup`, `start`, `stop`, `status` y `validate`.
- Sustituir hardcode principal por mock JSON explícito.

**Resultado:** entorno reproducible y arquitectura estable.

### Sprint 2 — Datos reales, control y topología (4-5 días)

- Implementar adaptadores local y SSH.
- Consultar servicios, procesos, interfaces, puertos y recursos.
- Conectar dashboard, WebSocket y topología 5G con datos reales.
- Añadir operaciones permitidas de ciclo de vida y validación.

**Resultado:** el EMS opera el testbed local.

### Sprint 3 — Salud, alarmas y logs (4-5 días)

- Implementar health checks y ciclo de alarmas.
- Mostrar estado por VM, NF e interfaz.
- Consultar y filtrar logs.
- Relacionar alarma, evidencia y recomendación.
- Ejecutar los primeros casos de falla 5G.

**Resultado:** diagnóstico operacional básico integrado.

### Sprint 4 — Trazas y configuración (5-7 días)

- Implementar capturas, límites y descarga PCAP.
- Crear filtros 4G/5G y resumen con tshark.
- Implementar visor, validaciones y formularios guiados.
- Incorporar suscriptores mínimos.

**Resultado:** análisis de protocolos y configuración contextual.

### Sprint 5 — KPIs, evidencia y experimentos (5-7 días)

- Construir KPIs reales y gráficas históricas cortas.
- Exportar JSON/CSV.
- Completar casos exitosos y fallidos 4G/5G.
- Preparar fault injection reversible.
- Realizar ciclos repetidos de ejecución y recuperación.

**Resultado:** demo académica reproducible en VM local.

### Sprint 6 — VNRT, evaluación y extensión pro (2-4 semanas)

Orden obligatorio:

1. Adaptar el inventario al VNRT multi-VM.
2. Validar funciones esenciales 4G y 5G.
3. Corregir seguridad, errores y experiencia de usuario.
4. Ejecutar evaluación y recopilar evidencias.
5. Con lo anterior estable, integrar OpenTelemetry Collector y OpenObserve.

La extensión pro podrá almacenar logs, métricas y eventos normalizados por testbed, nodo, NF, interfaz y procedimiento, consultándolos desde FastAPI.

**Resultado obligatorio:** EMS completo validado en VNRT.
**Resultado avanzado:** histórico con OpenTelemetry/OpenObserve sin sustituir la interfaz propia.

## 10. Prioridad y reglas de recorte

### No negociable

- EMS propio con datos reales.
- Inventario y topología 4G/5G.
- Estado de VMs y NFs.
- Health checks, logs y alarmas.
- Captura y descarga PCAP.
- Visor y validador de configuración.
- KPIs mínimos reales.
- Acciones controladas y auditoría.
- Exportación JSON/CSV.
- Un caso exitoso y dos fallas por tecnología.
- Validación local y de casos críticos en VNRT.

### Extensiones de alto valor

- Configuración guiada.
- Suscriptores mínimos.
- Vista semántica por interfaz/procedimiento.
- OpenTelemetry + OpenObserve.
- Búsqueda histórica por IMSI/SUPI.
- Secuencia de señalización.

### Orden de recorte

1. Reporte HTML/PDF.
2. Terminal web.
3. Edición avanzada de configuración.
4. Diagrama automático de secuencia.
5. KPIs RRC avanzados.
6. OpenObserve e histórico.
7. Slicing avanzado, NWDAF y charging.

Nunca se recortarán topología, salud, alarmas, logs, PCAP, validación, KPIs mínimos ni casos experimentales.

## 11. Criterios de aceptación

- Mostrar estado real de un testbed 4G y uno 5G.
- Detectar una NF detenida en un máximo de cinco segundos.
- Mostrar alarma con NF, interfaz, procedimiento y evidencia.
- Consultar logs filtrados de la NF afectada.
- Validar parámetros principales contra el estado real.
- Iniciar/detener una captura web y descargar un PCAP válido.
- Crear una Subscriber Trace 5G, confirmar criptográficamente la identidad seleccionada sin exponerla y reconstruir Registration, Authentication, PDU Session y User Plane.
- Descargar el PCAP filtrado y la evidencia JSON de una Subscriber Trace sin identificadores completos en respuestas ni auditoría.
- Crear un suscriptor sin exponer Ki u OPc.
- Mostrar KPIs sustentados por datos reales.
- Bloquear operaciones no autorizadas y auditarlas.
- Ejecutar diez ciclos de inicio/detención o falla/recuperación sin residuos.
- Exportar evidencia JSON/CSV.
- Completar casos críticos localmente y repetirlos en VNRT.
- Comparar flujo manual y EMS por tiempo, finalización, errores e intervenciones.
- Obtener una puntuación SUS objetivo igual o superior a 68.

OpenTelemetry/OpenObserve no forman parte del criterio mínimo de aprobación; serán una mejora si los requisitos anteriores están estables.

## 12. Demo objetivo

1. Seleccionar un testbed 5G.
2. Visualizar VMs y topología AMF-SMF-UPF-gNB-UE.
3. Verificar Registration y PDU Session.
4. Iniciar una Interface Trace N2, N4 o N3.
5. Ejecutar una Subscriber Trace por SUPI/IMSI y abrir su secuencia E2E.
6. Inyectar una falla reversible.
7. Observar estado y alarma contextualizada.
8. Abrir logs y configuración de la NF relacionada.
9. Restaurar el escenario y comprobar el despeje.
10. Comparar KPIs antes, durante y después.
11. Descargar PCAP original, PCAP correlacionado y evidencia JSON.
12. Repetir resumidamente el flujo equivalente en 4G.

## 13. Frase de defensa

> La plataforma propuesta integra en una consola EMS educativa las operaciones que actualmente se realizan de forma manual y fragmentada en los laboratorios VNRT de redes 4G/5G. Su contribución consiste en representar el testbed desde una perspectiva de telecomunicaciones —máquinas virtuales, funciones de red, interfaces, procedimientos, alarmas y trazas— y guiar al estudiante desde la detección de una condición hasta la obtención de evidencia reproducible.
