# Revisión de trazas 5GS — Release 16

Fecha: 2026-09-13. Política ejecutable: `5gs-r16-evidence-v2`.

## Dictamen y alcance

Se corrigió la interpretación de las capturas 5G SA para evitar presentar
suposiciones como evidencia. **No constituye una certificación integral de
Open5GS/UERANSIM ni una validación completa de todas las cláusulas Release 16.**
4G EPC conserva su analizador anterior; no está validado por este informe.

Un paquete no declara por sí solo que toda la implementación cumple un release.
Esta política fija las referencias de interpretación a versiones 16.x; conserva
el tráfico desconocido o no clasificable y no lo transforma para hacerlo coincidir
con un diagrama. Las extensiones de otros releases requieren revisión explícita.

## Fuentes fijadas

| Documento | Versión | Uso |
| --- | --- | --- |
| TS 22.261, archivo del usuario | Release 16; requisitos de servicio | No sustituye especificaciones de protocolo |
| TS 23.501 | 16.20.0 | Arquitectura, interfaces y responsabilidades |
| TS 23.502 | 16.19.0 | §4.2.2.2.2 registro; §4.3.2.2.1 establecimiento PDU; §4.4.1 N4; capítulo 5 servicios |
| [TS 24.501](https://www.etsi.org/deliver/etsi_ts/124500_124599/124501/16.10.00_60/ts_124501v161000p.pdf) | 16.10.0 | NAS; capítulos 5, 6 y 10 |
| [TS 38.413](https://www.etsi.org/deliver/etsi_ts/138400_138499/138413/16.13.00_60/ts_138413v161300p.pdf) | 16.13.0 | NGAP; capítulo 8 |
| [TS 33.501](https://www.etsi.org/deliver/etsi_ts/133500_133599/133501/16.15.00_60/ts_133501v161500p.pdf) | 16.15.0 | Seguridad; §6.1.3.2, 5G-AKA |

Fuentes locales: `Releases/markdown/TS_23.501.md` y `TS_23.502.md`, con sus
capítulos separados. Se contrastaron visualmente las figuras extraídas del DOCX:
`Releases/diagrams/TS_23.502/image3.emf` (figura 4.2.2.2.2-1) e `image18.emf`
(figura 4.3.2.2.1-1). Las imágenes convertidas en esta carpeta son copias de
consulta, no dibujos originales del EMS. Deben atribuirse a 3GPP/ETSI si se usan.
El Markdown no enlaza todas las figuras: su asociación se verificó en el DOCX.

## Discrepancias corregidas

| Antes | Política actual | Fundamento / límite |
| --- | --- | --- |
| Se añadían paquetes radio UE–gNB a partir de N2/N3 | Un evento por fila decodificada; sin radio sintética | Una representación Stage 2 no prueba observación en NR-Uu |
| UplinkNASTransport posterior a Security Mode Command se convertía en Security Mode Complete | Se conserva el transporte si NAS no está decodificado | NAS y su contenedor NGAP son capas diferentes |
| Después de InitialContextSetupResponse se inventaba una petición PDU con PSI 1 y 2 | No se asignan mensajes, PSI o DNN por posición | Figura 4.3.2.2.1-1 no autoriza completar paquetes ausentes |
| PDUResourceSetupResponse generaba RRC Reconfiguration Complete | No se genera RRC desde NGAP | El PCAP no contiene evidencia del mensaje radio |
| PFCP response se consideraba éxito PDU | N4 se clasifica aparte; no sustituye NAS Accept | Establecer recursos N4 no prueba aceptación NAS completa |
| Authentication Request + Response significaba éxito 5G-AKA | Evidencia parcial | No demuestra la decisión del AUSF ni validación criptográfica |
| Logs globales convertían procedimientos en exitosos | No deciden el resultado de una captura | No garantizan asociación a este UE, intento o ventana |
| SBI se dibujaba AMF→productor aunque IP fuese SCP | Se mantienen endpoints observados | No ocultar un salto real ni inventar consumidor original |
| Nbsf se rotulaba como Nudr / UDR | Se conserva método y URI | BSF y UDR no son intercambiables |
| Respuestas HTTP 204 / DATA desaparecían | Se conservan, sin darles éxito de negocio | Respuesta de transporte/API no prueba el procedimiento UE |
| Dos SBI similares separados por menos de 3 ms se fusionaban | No se deduplican por tiempo/nombre | Podrían ser transacciones o usuarios diferentes |
| Tráfico en la ventana se atribuía al usuario | Anclaje de identidad y contextos ligados a peers | PDU Session ID y TEID aislados no identifican un suscriptor |
| SUCI se reconstruía siempre desde MSIN | Sólo esquema nulo, formato IMSI y PLMN contrastado | No se obtiene SUPI de una SUCI protegida por conjetura |
| Simulación se etiquetaba PCAP real | Evidencia `simulated` | Diferenciar material demostrativo de captura real |

Las IP conocidas provienen del inventario del laboratorio, **no de 3GPP**.
Las desconocidas permanecen como IP. El mapa de inventario aún necesita evolución
para instancias múltiples y capturas de distintas épocas de despliegue.

## Significado del resultado

- `success`: se observó petición/aceptación NAS de registro o establecimiento PDU,
  en orden, dirección y contexto coincidentes. PDU exige además mismo identificador
  de sesión. El alcance es ese intercambio, no certificación total.
- `partial`: hay evidencia pero no basta para afirmar éxito del procedimiento pedido.
- `inconclusive`: no hay anclaje verificable al selector solicitado.
- `failure`: rechazo NAS observado; no se convierte una ausencia en rechazo.
- Los mensajes de seguridad NAS no se etiquetan como autenticación 5G-AKA.
- Un `Registration Complete` es condicional en TS 23.502 §4.2.2.2.2, paso 22;
  no se exige indiscriminadamente, ni se genera cuando falta.

La correlación es deliberadamente conservadora. SBI sin identidad/contexto
verificable puede quedar fuera del Subscriber Trace aunque esté en el PCAP.
Interface Trace mantiene esas observaciones sin atribuirlas a un usuario.
No se afirma correlación completa sólo por reunir una lista de clases de IDs.

## Timers

Se consultó TS 24.501 V16.10.0, tablas 10.2.1, 10.2.2 y 10.3.1:

| Timer | Titular | Referencia nominal ordinaria |
| --- | --- | --- |
| T3510 | UE | 15 s |
| T3550 | Red / AMF | 6 s |
| T3560 | Red / AMF | 6 s |
| T3580 | UE | 16 s |

Son valores de referencia, **no valores medidos ni configurados en la VM**.
Existen excepciones por modo de acceso y notas específicas. Las condiciones
precisas de inicio, parada, retransmisión y expiración están en los procedimientos
NAS, no sólo en la tabla resumen. Una diferencia entre timestamps de N2 no mide
exactamente el timer interno del UE/AMF. El resultado exporta `not-assessed`.
No se modificó ningún timer ni configuración del core como parte de esta revisión.

## Capturas históricas

Al abrir un análisis 5G antiguo se vuelve a decodificar el PCAP disponible con
TShark y se crea un JSON versionado separado. Se conserva el PCAP original y el
JSON anterior. El API de evidencia devuelve el análisis revisado. No se reescribe
una inferencia antigua para presentarla como un mensaje observado.

Se prefiere la copia local del PCAP: se comprobó que la captura de ejemplo ya no
estaba en `/tmp` de la VM pero sí en el almacén local. Si no puede decodificarse,
debe aparecer error de análisis, nunca aprobación automática.

## Pruebas y evidencia

- `backend/tests/test_trace_release16.py`: 10 regresiones específicas.
- `backend/tests/test_api.py`: 25 pruebas de API; se corrige el antiguo test que
  esperaba éxito para una simulación sin mensajes de aceptación.
- `frontend/verify-traces-release16.mjs`: comprueba una captura existente,
  política aplicada, referencias en detalle, ausencia de radio sintética y UI limpia.
- Replay local de `UE-TRACE-022750`: 1279 filas decodificadas, 173 eventos vinculados,
  287 filas excluidas (tráfico NRF de fondo / heartbeats no relacionados al suscriptor).
  Procedimientos observados: Registro (`success`), 5G-AKA (`partial`), Sesión PDU (`success`).
- Replay de captura `PRUEBA` (`64a98aa3`): 1210 filas decodificadas, 153 eventos vinculados,
  248 filas de fondo excluidas. Se correlacionan con fidelidad los intercambios N1/N2,
  SBI (Nausf, Nudm, Nudr, Npcf, Nbsf, Nsmf, Namf) y N4 (PFCP para dos sesiones PDU: Internet y Corporativa).
- Revisión por replay de las **41 capturas 5G almacenadas**: ninguna excepción de
  decodificación; 21 resultados parciales, 2 sin identidad verificable y 18 sin
  eventos decodificados. No demuestra conformidad del protocolo: comprueba que
  la nueva interpretación puede aplicarse a todas las capturas disponibles.

## Pendiente antes de afirmar conformidad integral

1. Congelar builds/configuraciones del testbed y versión de TShark. Referenciar
   un release no impide al software implementar elementos posteriores.
2. Ampliar Stage 3 con TS 29.500/29.501 y las APIs concretas, TS 29.244 (PFCP),
   TS 29.281 (GTP-U), y TS 38.331 si se obtiene evidencia RRC real, siempre 16.x.
3. Validar causes PFCP, respuestas y cuerpos HTTP/2 por conexión/stream, operaciones
   SBI concretas, contenido NAS cifrado y autenticación de extremo a extremo.
4. Separar intentos y sesiones con PTI, asociaciones SCTP, contextos reutilizados,
   TEID/F-SEID y dirección/peer. No basta coincidencia temporal.
5. Medir timers en el nodo con instrumentación, relojes contrastados y pruebas de
   expiración/retransmisión, distinguiendo captura incompleta de incumplimiento.
6. Elaborar una matriz de requisitos aplicables (obligatorio/condicional/opcional),
   casos positivos/negativos y evidencia por cláusula. No exigir todos los pasos
   del diagrama general a cada captura.
7. El límite actual del decodificador es 10000 paquetes; el diagrama muestra como
   máximo 500 eventos filtrados. No presentar una vista truncada como captura entera.

Conclusión académica defendible: **visualización educativa de evidencia 5GS con
referencias Release 16 y límites explícitos**, no «core certificado 3GPP».
