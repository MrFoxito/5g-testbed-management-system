# Plan de implementación — MAEstro 5G multiinstancia en 12 VMs

Versión: 1.0 · Fecha: 2026-09-12 · Estado: diseño propuesto para ejecución por hitos.

Este documento autoriza conceptualmente un alcance de proyecto, no ejecuta cambios en la infraestructura. La provisión, credenciales, cuotas y ventanas de pruebas se confirmarán antes de intervenir el VNRT. No se ha auditado la VM en vivo durante la elaboración de este plan.

## 1. Objetivo y aporte

Construir y evaluar un testbed educativo 5G SA distribuido, gestionado desde MAEstro, con dos AMF, dos SMF, dos UPF y un prototipo CHF funcional. Permitir estudiar selección de servicios e instancias, comunicación SBA B/D, charging por suscriptor y fallas controladas mediante evidencia reproducible.

El aporte combina gestión multi-VM, integración de charging, modificaciones documentadas del core cuando sean necesarias y evaluación técnica/educativa. No se atribuirá como original Open5GS, UERANSIM ni la infraestructura universitaria. Los antecedentes locales se citarán sin copiar sus implementaciones ni presentar mejoras educativas ajenas como resultados propios.

### Alcance comprometido

- 12 VMs lógicas en el perfil distribuido; perfil compacto local para desarrollo.
- 5G SA con UERANSIM; 4 UEs iniciales y carga ampliable después de caracterizar recursos.
- Dos servicios de datos diferenciados y perfiles experimentales de selección.
- Arquitectura SBI mixta B/D y perfil de comparación con AMF→SMF en D.
- CHF real con cliente SMF, cuotas por volumen y registros persistentes.
- Inventario, operaciones, configuración, alarmas, performance, trazas y auditoría por instancia.
- Instalación reproducible, restauración comprobada y experimentos automatizados.

### Fuera del compromiso inicial

- Kubernetes, autoscaling, roaming, IMS/VoNR, SDR y charging EPC.
- Redundancia completa de NRF/SCP/UDM/CHF o continuidad transparente de sesiones.
- Facturación comercial, dinero real, impuestos, rating complejo y conformidad 3GPP completa.
- Aislamiento radioeléctrico o garantías URLLC a partir de UERANSIM.

El escenario 4G existente se conserva como regresión; no se elimina ni se migra automáticamente. Añadir réplicas o nuevas funciones requiere una pregunta experimental y una revisión del presupuesto.

## 2. Línea base y brechas verificadas en el repositorio

| Evidencia local | Implicación |
|---|---|
| `backend/app/catalog/scenarios.json` declara nodos y una instancia por NF en 5G | Introducir identidad de instancia sin confundirla con tipo de NF. |
| `RemoteExecutionAdapter` en `services/execution.py` usa configuración de host SSH | Implementar resolución de destino por nodo; el catálogo multi-VM no prueba transporte multi-host. |
| Existen servicios de operaciones, alarmas, performance y trazas | Extender contratos y almacenamiento; no reescribir sin revisar comportamiento actual. |
| `infra/` contiene scripts de instalación/configuración | Transformar lo reutilizable en automatización parametrizada e idempotente. |
| No aparece un servicio CHF en el directorio de servicios inspeccionado | Tratarlo como desarrollo nuevo; comprobar ramas y VM antes de concluir ausencia global. |
| Plan general anterior excluye Accounting | Este plan propone ampliar ese alcance para 5G; mantener el histórico y registrar la decisión. |

El README contiene limitaciones históricas: se contrastarán con código y pruebas en F0 antes de utilizarlas como descripción del estado actual.

## 3. Distribución de las 12 VMs

Los siguientes recursos son una estimación de ingeniería para el piloto, no requisitos medidos ni garantías de rendimiento. GB de disco y GiB de memoria se distinguen deliberadamente.

| VM / node_id | Servicios | vCPU | RAM GiB | Disco raíz GB |
|---|---|---:|---:|---:|
| 01 `ems-01` | MAEstro API, frontend compilado, proxy HTTPS, BD EMS | 4 | 8 | 40 |
| 02 `sba-01` | NRF-1 y SCP-1 | 2 | 4 | 30 |
| 03 `shared-01` | AUSF, UDM, UDR, PCF, NSSF, MongoDB | 4 | 8 | 50 |
| 04 `amf-01` | AMF-1 | 2 | 2 | 20 |
| 05 `amf-02` | AMF-2 | 2 | 2 | 20 |
| 06 `smf-01` | SMF-1 | 2 | 3 | 25 |
| 07 `smf-02` | SMF-2 | 2 | 3 | 25 |
| 08 `upf-01` | UPF-1; entorno DN-A aislado | 2 | 4 | 25 |
| 09 `upf-02` | UPF-2; entorno DN-B aislado | 2 | 4 | 25 |
| 10 `chf-01` | CHF, API administrativa y BD propia | 4 | 8 | 50 |
| 11 `ran-01` | gNB-1 y grupo UE-A | 4 | 4 | 30 |
| 12 `ran-02` | gNB-2 y grupo UE-B | 4 | 4 | 30 |
| **Total nominal** | **12 VMs** | **34** | **54** | **370** |

Añadir inicialmente 100 GB de volumen de evidencia a `ems-01`: total nominal 470 GB antes de snapshots y copias. Dimensionar retención con `tasa de captura × duración × concurrencia × retención`; el límite por tarea prevalece sobre crecimiento ilimitado. Reservar copias fuera de la VM respaldada.

Propuesta de solicitud, no cuota asumida: 34 vCPU asignadas, 54 GiB de RAM y 470 GB nominales, con posibilidad de ampliación. Acordar sobreasignación, reservas, perfiles de prioridad e IOPS con VNRT; sumar margen de plataforma por separado. No interpretar 34 vCPU como 34 cores físicos dedicados. Medir una semana de cargas piloto antes de consolidar el dimensionamiento.

### Límites de aislamiento

- VMs 04–09 separan fallas de AMF, SMF y UPF. No hay pareja fija AMF-1→SMF-1.
- VMs 02 y 03 agrupan funciones: apagar una afecta al grupo; detener un servicio permite una prueba de proceso específica.
- NRF/SCP, servicios compartidos, CHF y EMS mantienen puntos únicos de falla.
- Dos VMs en el mismo hipervisor no prueban tolerancia a fallo físico. Solicitar colocación separada solo para ensayos que la necesiten y registrar host físico anonimizado.
- Co-localizar gNB/UE reduce coste, pero introduce competencia de recursos; medirla. UERANSIM no ofrece una radio SDR real.
- DN-A/B se implementarán con namespaces e interfaces N6 aisladas y servidores de prueba locales. Esto no representa edge físico ni aislamiento de cómputo; esos experimentos requerirían recursos adicionales.

## 4. Tecnología de despliegue y automatización

Usar VMs Linux, servicios systemd y automatización Ansible (o scripts equivalentes si VNRT lo exige). Fijar distribución, paquetes y commits después de la auditoría de compatibilidad, no instalar automáticamente lo último. Docker Compose existente puede seguir disponible para desarrollar el EMS; no será un requisito del core. Kubernetes queda fuera de esta versión.

Estructura propuesta, aún no implementada:

```text
infra/testbed/
  inventories/{local,vnrt}/       # nodos, interfaces y perfiles; sin secretos
  roles/{base,network,open5gs,ueransim,chf,ems,capture}/
  playbooks/{provision,deploy,verify,backup,restore}.yml
  profiles/{baseline,mixed-bd,all-d,service-selection,equivalent-smf}/
experiments/
  definitions/                  # entradas, límites, expectativas, limpieza
  runner/                       # ejecución y recogida de artefactos
docs/testbed/
  decisions/                    # decisiones y cambios de alcance
  compliance/                   # requisito → implementación → prueba
  runbooks/                     # operación, fallas y recuperación
```

Cada versión producirá manifiesto de software, hashes de configuración no sensible, inventario, migraciones y pruebas. Guardar claves fuera de Git. Separar build de instalación: compilar Open5GS/CHF una vez y distribuir artefactos fijados, no compilar durante cada práctica.

## 5. Diseño de red

Reservar redes lógicas separadas para gestión, SBI, N2, N3, N4 y las dos N6. No implica siete NICs en cada VM: conectar únicamente las necesarias. El direccionamiento siguiente es ilustrativo y debe descartarse si colisiona con VPN/VNRT.

| Red | Ejemplo | Participantes |
|---|---|---|
| Gestión | `10.210.10.0/24` | Las 12 VMs; SSH y telemetría autorizados desde EMS |
| SBI | `10.210.20.0/24` | SBA, shared, AMF, SMF y CHF |
| N2 | `10.210.30.0/24` | RAN y AMF |
| N3 | `10.210.40.0/24` | RAN y UPF |
| N4 | `10.210.50.0/24` | SMF y UPF |
| N6-A / N6-B | `10.210.60.0/24`, `10.210.70.0/24` | Cada UPF y su DN aislada |
| Pools UE | `10.211.1.0/24`, `10.211.2.0/24` | Pools distintos, sin solapamiento con las anteriores |

Inventario por VM: NIC/MAC, IP, rutas, MTU, DNS, puertos, unidad systemd y redes permitidas. No fijar `ens3` o direcciones loopback del baseline como destinos inter-VM.

Requisitos previos VNRT: soporte SCTP N2, UDP GTP-U y PFCP, reglas de seguridad entre puertos, forwarding en UPF y tratamiento de prefijos UE en mecanismos anti-spoofing/port-security. Solicitar excepciones mínimas; no desactivar seguridad global. Verificar `/dev/net/tun`, permisos y routing de UE. Mantener administración fuera del forwarding experimental y no exponer MongoDB, PFCP o SBI a Internet.

Tshark/dumpcap tendrá privilegios mínimos. La API del CHF requerirá transporte HTTP/2 real: un servidor FastAPI/ASGI por defecto no basta para asegurar h2/h2c. Probar pila y proxy elegidos contra el SCP fijado. Gestión del EMS por HTTPS; seguridad SBI definida según soporte probado, con CA interna cuando sea viable. Si una captura requiere SBI en claro, hacerlo únicamente en red aislada y declararlo como limitación de seguridad del laboratorio.

Sincronizar relojes mediante NTP/chrony. Registrar offset e incertidumbre; no interpretar diferencias de latencia inferiores a esa incertidumbre. Capturas crudas y secretos de suscripción no se publican junto al informe.

## 6. Perfiles de servicio y SBA

### Servicios diferenciados

- Servicio A: DNN `lab-a`, S-NSSAI A, SMF-1, UPF-1 y DN-A.
- Servicio B: DNN `lab-b`, S-NSSAI B, SMF-2, UPF-2 y DN-B.
- Ambas AMF permiten ambos servicios conforme a la suscripción. Cada grupo RAN contiene inicialmente un UE para A y otro para B: cuatro UEs en total.
- Asignar PLMN, TAC, GUAMI, gNB IDs, NF instance IDs y S-NSSAI propios del laboratorio y coherentes con el baseline. Confirmar valores en F1; nunca reutilizar credenciales de operadores.

Este perfil demuestra selección de servicio, no balanceo entre SMFs equivalentes. Crear otro perfil, `equivalent-smf`, con ambos SMF anunciando capacidades compatibles y política determinística de selección. Usar pools no solapados por SMF y rutas/UPF coherentes; no compartir un pool sin coordinación. Verificar qué permite la versión y modificar código si es necesario.

### Matriz de solicitudes principales

| Consumidor → productor | Mixto | Servicio |
|---|:---:|---|
| AMF → SMF | B | `nsmf-pdusession` |
| AMF → AUSF | D | `nausf-auth` |
| AUSF → UDM | D | `nudm-ueau` |
| AMF → UDM | D | `nudm-sdm`, `nudm-uecm` |
| UDM → UDR | D | `nudr-dr` |
| AMF → PCF | D | `npcf-am-policy-control` |
| AMF → NSSF | D | `nnssf-nsselection` |
| SMF → UDM | D | `nudm-sdm`, `nudm-uecm` |
| SMF → PCF | D | `npcf-smpolicycontrol` |
| SMF → CHF | D | `nchf-convergedcharging` / N40 |

B: consumidor descubre con NRF y contacta al productor. D: petición por SCP con descubrimiento delegado. El perfil `all-d` cambia AMF→SMF a D manteniendo los demás parámetros experimentales. No cambiar perfil durante sesiones activas. La taxonomía se fundamenta en TS 23.501, anexo E [S1]; no aplica a PFCP, NGAP, GTP-U, MongoDB ni exportaciones de archivos.

La matriz no es un inventario completo de tráfico. Registrar también callbacks SMF→AMF, notificaciones PCF/UDM, suscripciones, NRF management/discovery y rutas internas reales. Para cada servicio anotar API root, versión, callback URI, destino, policy de routing y evidencia. No forzar un callback con URI conocida a comportarse como una búsqueda inicial.

Prueba del modelo: revisar configuración y código; capturar conexión HTTP/2, servicio, perfil NRF seleccionado y cabeceras de descubrimiento/target pertinentes. Una flecha SCP o un heartbeat NRF no demuestra D. Documentar cachés: no debe exigirse una consulta NRF nueva por cada solicitud.

AMF/gNB: comenzar con asignación controlada gNB-1→AMF-1 y gNB-2→AMF-2. Auditar soporte de múltiples endpoints y selección de UERANSIM antes de prometer failover. Si requiere cambios, tratarlo como desarrollo independiente con pruebas; no etiquetar asignación fija como balanceo automático.

## 7. CHF: desarrollo funcional independiente

### Decisión de implementación

Comparar durante F0/F1: (a) adoptar/adaptar código comunitario con licencia y pruebas verificadas; (b) CHF propio con esquema Nchf y cliente SMF desarrollado por nosotros. La discusión comunitaria [S3] es una pista técnica, no una dependencia estable ni certificación. Fijar commit, revisar licencia, código, tests y compatibilidad; si no hay artefactos utilizables, continuar con implementación propia. Decisión documentada antes de F3.

Preferencia arquitectónica: proceso CHF independiente, almacenamiento propio transaccional (PostgreSQL propuesto para ledger y concurrencia), API SBI separada de API administrativa. FastAPI es una opción para implementación propia, condicionada a pruebas HTTP/2/SCP; no requisito que obligue a desechar código sólido en otro lenguaje.

### Circuito requerido

```text
UPF --PFCP/medición por sesión--> SMF --Nchf vía SCP--> CHF
UPF <--reglas PFCP del SMF------ SMF <--cuota/decisión-- CHF
EMS --API administrativa--> CHF --registros--> exportación educativa
```

- Registrar CHF en NRF, anunciar servicio/versiones reales, mantener y retirar su registro.
- Implementar Create/Update/Release y contexto de recurso conforme al subconjunto de TS 32.291 seleccionado [S2]. Importar/validar OpenAPI oficial; no inventar campos parecidos al estándar.
- Añadir cliente y transiciones Nchf al SMF: reserva inicial, renovación, reporte final, timeout y terminación. Feature flag por perfil para conservar 4G y baseline sin charging.
- Auditar soporte PFCP URR, reportes y aplicación de reglas en SMF/UPF fijados. No asumir que todo está disponible: localizar código, probar y desarrollar faltantes.
- Medir UL/DL por sesión/rating group; definir volumen contabilizado y capa de medición. No atribuir bytes globales de `ogstun` a un IMSI.
- Política inicial de cuota final: impedir nueva autorización y finalizar/restringir la sesión mediante SMF/UPF según el procedimiento implementado. La recarga autoriza una nueva sesión si la anterior terminó; no prometer reanudación en caliente sin implementarla.
- Offline: recibir uso, persistir y cerrar registros sin condicionar el servicio al saldo. Online/offline no se equiparan rígidamente a prepago/postpago.

### Datos y consistencia

Entidades: cuentas, asignaciones/recargas, sesiones de charging, reservas por sesión, eventos de uso, decisiones y registros finales/parciales. Claves incluyen testbed, escenario, identidad protegida, SMF instance ID, charging resource reference, sesión y secuencia; no IMSI como única clave global.

Mantener disponible, reservado y consumido en enteros de bytes; dinero queda fuera. Ledger append-only, transacciones y unicidad por operación. Misma solicitud repetida devuelve resultado coherente sin doble débito; detectar payload contradictorio con misma identidad de petición. Recargas con idempotency key. Liberar reservas sobrantes con reconciliación, no por borrado ciego de sesiones.

Reinicio de CHF/SMF, duplicados, mensajes fuera de orden, pérdida de respuesta y sesiones concurrentes son casos obligatorios. Definir expiración y reconciliación de reservas huérfanas. No borrar históricos mediante un botón reset: separar reinicio de práctica de contabilidad conservada.

CHF inaccesible: perfil prepago inicial conservador, sin conceder cuota nueva; comportamiento con cuota ya concedida y vencimiento explícitamente probado. Offline usa cola persistente acotada y alarma ante imposibilidad de registrar. No fallback ilimitado silencioso.

Cuota agotada es evento de negocio; CHF inaccesible, fallo de persistencia o restricción no aplicada son alarmas técnicas. No suspender MongoDB ni bloquear globalmente una interfaz como sustituto del procedimiento Nchf.

Registros: CSV/JSON educativos, esquema versionado y procedencia. No anunciar formato CDR 3GPP completo, Ga o Bx hasta implementar y verificar los requisitos pertinentes. El batch export no es modelo A.

## 8. Adaptación de MAEstro

- Modelo: `testbed_id`, `scenario_id`, `node_id`, `nf_type`, `instance_id` y `service_id`. Separar NF instance ID del identificador persistente del objeto EMS.
- Inventario: resolver cada operación a un host autorizado; SSH por clave con host key checking, timeouts y concurrencia acotada. Nunca aceptar hostname/comando arbitrario desde navegador.
- Operaciones: catálogo por tipo y capacidades reales de instancia. Cambios en varios nodos con preflight, copias, resultados parciales y restauración específica; no afirmar transacción distribuida.
- Datos: migrar muestras y alarmas antiguas al baseline identificado. No asignar históricos de AMF único arbitrariamente a ambas réplicas. Copia de BD y ensayo de restauración antes de migrar.
- Topología: separar vista física y lógica; relaciones observadas frente a configuradas. No inventar enlaces o estados UP.
- Alarmas: clave por instancia/condición; `unknown` si no hay telemetría. Pérdida SSH no demuestra caída de NF. Registro de ventanas de mantenimiento y auditoría.
- Performance: contadores de servicio y proceso diferenciados; compatibilidad por capacidades. Comparar AMF-1/AMF-2 sin mezclar automáticamente recursos de VM ni seleccionar todos los KPIs.
- Trazas: captura multi-host, reloj y procedencia; deduplicar observaciones en extremos. Correlacionar sesión e instancia, no solo IP. Datos capturados, logs e inferencias visualmente distinguibles. Flujo incremental real si se anuncia tiempo real.
- Suscriptores: no convertir aprovisionamiento UDR/Mongo en control de sesión activa. Charging usa cuenta separada y referencia al suscriptor.
- UI: mantener estilo compacto; detalle técnico en manual. Charging con Cuentas, Sesiones y Registros; permisos y confirmaciones en recarga/acciones disruptivas.
- Seguridad: secretos completos fuera de respuestas, logs y auditoría; PCAP crudos restringidos y exportación saneada. Usuarios nominales, no credenciales de demo en VNRT.

## 9. Fases, dependencias y puertas de aceptación

Las duraciones son semanas de trabajo efectivo orientativas, no fechas garantizadas. Reserva adicional del 20–30% para integración. No se habilitan fallas antes de probar restauración.

| Fase | Duración | Trabajo y entregables | Puerta de salida |
|---|---|---|---|
| F0 — Auditoría y baseline | 1–2 | Inventario local/VM, versiones, capacidades, PCAP nominal, respaldo y restauración en copia; solicitud VNRT | Registro, PDU y datos reproducibles; baseline recuperable; brechas escritas |
| F1 — Diseño detallado | 2 | IP/NIC/ACL, recursos, selección B/D, contrato CHF, estrategia código comunitario/propio, matriz normativa y amenazas | Diseño revisado; cada riesgo crítico tiene prueba y alternativa técnica |
| F2 — Infraestructura reproducible | 2–3 | Imágenes/Ansible, gestión SSH por nodo, redes, clocks, despliegue de un AMF/SMF/UPF distribuido | Redeploy desde limpio; segunda aplicación sin cambios inesperados; registro y datos |
| F3 — CHF y cliente SMF mínimo | 4–8 | Reserva/uso/liberación, persistencia, PFCP, API admin, tests de protocolo; primero directo aislado y luego vía SCP | Dos UEs, consumo independiente, corte y nueva autorización; sin doble débito |
| F4 — 12 VMs y multiinstancia | 2–4 | Segunda AMF/SMF/UPF, ambos grupos RAN, perfiles de servicio; migración completa EMS | Cuatro UEs y ambos servicios desde ambas AMF; identidades y datos separados |
| F5 — SBI mixto y comparación D | 2–4 | Routing por servicio, callbacks, cambios de core necesarios, perfiles, capturas | Evidencia B/D y todo D; mismo caso funcional; sin rutas silenciosas no documentadas |
| F6 — Operación y experimentos | 3–4 | Runner, fallas reversibles, charging UI, KPI/reportes, backup de despliegue completo | Ejecución repetible, limpieza automática y evidencia verificable |
| F7 — Evaluación y entrega | 3–4 | Piloto, repeticiones, evaluación educativa autorizada, manuales y paquete reproducible | Resultados, límites, fuentes y release final documentados |

Horizonte orientativo secuencial: 19–31 semanas efectivas, más reserva. Se puede avanzar en documentación, permisos VNRT y UI con contratos mientras madura el core, pero no declarar integración real con mocks. El CHF mantiene carácter obligatorio; un fallo en F3 implica rediseñar, no sustituirlo silenciosamente por una simulación.

Camino crítico: acceso/redes → baseline distribuido → medición PFCP/cliente SMF → CHF → routing D → multiinstancia validada → experimentos. La infraestructura mínima de instancias y el modelo de datos EMS deben diseñarse antes del CHF para evitar claves monoinstancia.

## 10. Programa de experimentos

| ID | Caso | Evidencia y medida principal |
|---|---|---|
| LAB-01 | Registro y sesión nominal en cada combinación autorizada | Contextos, PCAP, IP UE y conectividad al DN esperado |
| LAB-02 | Dos servicios/S-NSSAI | SMF/UPF elegidos, rechazo de servicio no autorizado, rutas separadas |
| LAB-03 | B/D frente a todo D | Latencia de establecimiento por UE, señalización, errores y CPU, controlando caché |
| LAB-04 | Retirar AMF-1 | UEs existentes, tráfico establecido y registros nuevos medidos por separado |
| LAB-05 | Retirar SMF-1 | Impacto en sesiones y nuevas solicitudes; no asumir que el plano de usuario cae inmediatamente |
| LAB-06 | Retirar UPF-1 | Pérdida en rama A y comportamiento de rama B; recuperación observada |
| LAB-07 | Agotar cuota de un UE | Bytes contabilizados, exceso hasta restricción, continuidad del otro UE |
| LAB-08 | Recarga y sesión posterior | Una sola recarga efectiva, autorización y continuidad contable |
| LAB-09 | Reinicio/pérdida de respuesta CHF | Persistencia, reservas, reintentos y ausencia de doble cobro |
| LAB-10 | Dos sesiones simultáneas de una cuenta | Reserva agregada sin sobreasignación; implementar soporte UE necesario |
| LAB-11 | SCP o NRF no disponible | Separar sesiones existentes, descubrimiento con/sin caché y solicitudes nuevas |
| LAB-12 | Uso de MAEstro frente al flujo manual | Tiempo, finalización, errores, intervención docente y calidad de evidencia |

Definir si cada caso detiene proceso, VM o bloquea una interfaz; no mezclar las tres fallas bajo un único resultado. Para servicios diferenciados, perder SMF-A no garantiza que SMF-B pueda servir A. La prueba de selección alternativa usa el perfil de capacidades equivalentes.

### Metodología técnica

- Empezar con 4 UEs; ampliar por escalones tras medir saturación de generador, core y captura. No atribuir cuello de botella RAN/VM al algoritmo de selección.
- Ejecutar piloto para decidir repeticiones; punto de partida: 30 ejecuciones independientes por condición nominal, reajustado con variabilidad y coste. La unidad estadística es la ejecución, no cada paquete.
- Ordenar aleatoriamente o contrabalancear B/D frente a D. Separar cold start y warm/cache. Mantener versiones, cuotas, workload, placement y recursos comparables.
- Definir timestamps por procedimiento y usar reloj monótono para duración local. Reportar tasa de éxito, mediana, dispersión e intervalos de confianza; percentiles altos solo con muestras suficientes.
- Reconciliar bytes CHF con referencia independiente en la misma capa y ventana; documentar overhead, tráfico permitido, descartes y límites de captura. Exceso de cuota se mide, no se asume cero.
- Predefinir tras el piloto tolerancias de error contable, exceso de bytes y tiempos de recuperación. No elegirlas después para acomodar resultados finales.
- Guardar también fallos, muestras incompletas y exclusiones justificadas. Captura agotada o reloj no sincronizado invalida la medida correspondiente, no convierte el resultado en éxito.
- Registrar CPU, memoria, disco, paquetes perdidos por captura y recursos compartidos de VNRT. Fijar condiciones de uso del hipervisor cuando sea posible.

Evaluación educativa: protocolo autorizado por docente/institución, consentimiento y anonimización según corresponda. Preferir tareas equivalentes contrabalanceadas, con rúbrica de interpretación de protocolos además de usabilidad. No reutilizar el 22% de mejora del antecedente ni establecer causalidad mediante dos cohortes distintas sin controlar diferencias.

## 11. Pruebas y criterios de release

1. Unitarias: contabilidad, idempotencia, reservas, routing policy, permisos y resolución de node_id.
2. Contrato: validación OpenAPI Nchf, errores HTTP, recursos, secuencias, versionado y callbacks; no basta una respuesta 200 genérica.
3. Integración: HTTP/2 real, NRF/SCP, PFCP, reinicios, dos SMF y sesiones concurrentes.
4. E2E: cuatro UEs iniciales, dos servicios, pruebas de cuota y fallas con PCAP y resultados de datos.
5. Regresión EMS: frontend build/typecheck, backend tests, operaciones dirigidas al nodo correcto, históricos preservados y 4G sin afectación.
6. Recuperación: restaurar en entorno aislado desde artefactos y copias; probar limpieza tras fallo del runner.

Release aceptable: 12 VMs inventariadas; ambos AMF/SMF/UPF operativos con IDs diferenciados; modelos demostrados; CHF funcional; ninguna muestra mock presentada como real; experimentos principales repetibles; límites publicados. No se exige HA global ni cumplimiento íntegro de una Release 3GPP.

## 12. Seguridad operacional y recuperación

- No experimentar sobre la única copia funcional. Snapshot previo más copias consistentes de BD y manifiesto; snapshot no sustituye backup.
- Cuentas SSH sin root, claves distintas por entorno, allowlist de unidades/archivos, timeouts y auditoría. Rotar contraseñas de demostración.
- Un experimento disruptivo por testbed a la vez. Bloqueo persistente/lease, watchdog con límite y limpieza idempotente.
- Capturar estado previo de servicios y reglas específicas; restaurarlo, no simplemente iniciar todo o vaciar firewall.
- Si la restauración falla: marcar entorno degradado, bloquear nuevas prácticas y ofrecer runbook manual desde gestión fuera de banda.
- No reiniciar automáticamente CHF/NRF ni borrar sesiones para lograr una captura bonita. Todo estímulo debe declararse en la evidencia.
- Registrar recibo de cuota/recarga y operaciones administrativas sin K/OPc ni identidad completa en auditoría pública.

## 13. Riesgos y respuestas

| Riesgo | Respuesta |
|---|---|
| No existe cliente Nchf utilizable | Desarrollo SMF explícito con feature flag; F3 antes de prometer charging integrado |
| Routing B/D demasiado global | Política por servicio y pruebas de callbacks; patch trazable y upstream fijado |
| URR/aplicación de cuotas incompletas | Prueba vertical temprana y cambios SMF/UPF; no recurrir a contabilidad de interfaz global |
| RAN no selecciona AMF automáticamente | Asignación controlada etiquetada; automatismo solo tras implementar y verificar |
| VNRT bloquea tráfico o pools UE | Validación SCTP/UDP/routing/port-security antes de distribuir todo |
| Recursos variables sesgan comparación | Registrar placement, carga y reservas; repetir y declarar incertidumbre |
| Capturas contienen secretos | Acceso restringido, saneamiento, revisión previa a compartir y retención limitada |
| Core modificado rompe EPC | Builds versionados, feature flag, pruebas de baseline y rollback |
| Alcance crece por réplicas adicionales | Control de cambios: beneficio medible, coste, pruebas y aprobación |

## 14. Primera iteración ejecutable

Durante la primera semana de trabajo:

- [ ] Confirmar acceso a VM actual y realizar auditoría de solo lectura de versiones/configuración/capacidades.
- [ ] Crear inventario de hardware local, red y almacenamiento disponible; confirmar catálogo/cuota VNRT actual.
- [ ] Capturar un registro/PDU nominal y guardar manifiesto del baseline sin secretos.
- [ ] Ensayar respaldo/restauración en copia y documentar cómo regresar al baseline.
- [ ] Redactar decisiones de direccionamiento y selección de versión; no asignar las IP ilustrativas sin validación.
- [ ] Abrir backlog de transporte multi-host, identidad de instancia, CHF/SMF y pruebas de protocolo.
- [ ] Revisar factibilidad de código CHF comunitario y soporte PFCP local; registrar decisión de implementación.

Salida de la primera iteración: inventario, baseline recuperable, matriz de brechas y solicitud VNRT sustentada. No se compromete provisionar 12 VMs ni modificar el core antes de esa salida.

## 15. Fuentes y trazabilidad normativa

Fuentes consultadas el 2026-09-12. Fijar revisiones exactas y obtener documentos originales para la matriz de conformidad; una cita no demuestra interoperabilidad.

- [S1: 3GPP TS 23.501 V16.18.0, arquitectura y anexo E](https://www.etsi.org/deliver/etsi_ts/123500_123599/123501/16.18.00_60/ts_123501v161800p.pdf). Base del alcance SBA B/D.
- [S2: 3GPP TS 32.291 V16.17.0, charging Stage 3](https://www.etsi.org/deliver/etsi_ts/132200_132299/132291/16.17.00_60/ts_132291v161700p.pdf). Base del contrato Nchf a implementar como subconjunto documentado.
- [S3: propuesta comunitaria CHF Open5GS #4421](https://github.com/open5gs/open5gs/discussions/4421). Trabajo relacionado y posible insumo, no prueba de soporte upstream ni código validado.
- [S4: configuración SMF oficial Open5GS](https://github.com/open5gs/open5gs/blob/main/configs/open5gs/smf.yaml.in). Referencia de opciones; sustituir `main` por commit al congelar baseline.
- Antecedente local: `../tesis rivales/investigacion.txt`, LoFi5G MAT, DOI `10.1109/EDUNINE62377.2025.10981355`: contexto educativo y despliegue en HAST; no inventario actual VNRT.
- Antecedente local: `../tesis rivales/tesis 1.txt`, Giovanni Colonni, UPC, 2022: automatización experimental y límites de recursos compartidos.

La revisión normativa F1 debe añadir versiones compatibles de TS 23.502 (procedimientos), 29.500 (SBI), 29.510 (NRF), 29.244 (PFCP), 32.240/32.255/32.290 (charging) y 32.297/32.298 cuando se evalúen registros. No declarar cumplimiento de estas especificaciones antes de mapear requisitos, código y pruebas.

Matriz obligatoria: `requisito → versión/cláusula → implementación/commit → prueba → artefacto → estado (implementado/parcial/no soportado)`. La referencia académica Rel-16 no implica que toda la distribución Open5GS implemente exclusivamente esa Release ni que todos sus servicios estén soportados.
