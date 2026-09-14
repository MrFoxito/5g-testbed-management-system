# Auditoría de la vista «Sesión PDU» — Traza prueba

Fecha de revisión: 2026-09-14  
Captura: `d51db4f24e8d45b5b2773e0408b35eed`  
Política: `5gs-r16-evidence-v7`  
Referencia principal: 3GPP TS 23.502 V16.19.0, §4.3.2.2.1.

## Dictamen

La vista final contiene **100 eventos observados** relacionados con dos
establecimientos concurrentes, PSI 1 e PSI 2. Los eventos pertenecen al
procedimiento o a funciones auxiliares ejecutadas durante éste. No se generan
mensajes por posición, tiempo o número de frame.

Se corrigieron dos problemas encontrados durante la auditoría:

1. Cuatro eventos `Nudr_DM_Query` de `smf-selection-subscription-data` estaban
   clasificados como Sesión PDU. Son parte de la selección de SMF realizada por
   el AMF durante Registro y ahora aparecen solamente en «Registro».
2. Faltaban las suscripciones `Nudm_SDM_Subscribe` iniciadas por el SMF y las
   transacciones `Nsmf_PDUSession_UpdateSMContext` finales. Se incorporaron
   enlazándolas mediante la conexión HTTP/2 persistente y el recurso
   `sm-contexts/{id}` creado por el SMF.

## Cómo leer las líneas

La traza presenta el **recorrido físico**. En Modelo D, una operación lógica
SBI produce dos tramos, por ejemplo:

`AMF → SCP` y `SCP → SMF`.

No son dos solicitudes del UE. Son el tramo de entrada al proxy y el reenvío al
productor. Las dos sesiones también avanzan en paralelo; por eso muchas líneas
aparecen por pares.

## Explicación línea por línea

| Líneas de la vista | Frames | Lectura y evaluación Release 16 |
| --- | --- | --- |
| 1–4 | 301, 305, 316, 323 | El AMF envía al SMF, vía SCP, dos `Nsmf_PDUSession_CreateSMContext Request`. Los cuerpos contienen `PDU Session Establishment Request` NAS `0xC1` para PSI 1 y PSI 2. Corresponde al paso 3. |
| 5–8 | 331, 332, 334, 335 | El SMF solicita al UDM los datos de gestión de sesión para `internet` y `corporate`; cada petición se muestra como SMF→SCP y SCP→UDM. Es la obtención condicional de subscription data del paso 4. |
| 9–12 | 337, 338, 340, 341 | El UDM consulta al UDR mediante `Nudr_DM_Query` los datos de suscripción SM de ambos DNN. Son dos consultas lógicas y cuatro tramos físicos. |
| 13–16 | 343, 345, 349, 351 | El UDR responde `200` y el SCP devuelve ambas respuestas al UDM. Correcto. |
| 17–20 | 354, 356, 359, 363 | El UDM responde `200` al SMF vía SCP para los dos DNN. Correcto. |
| 21–24 | 367, 370, 372, 375 | El SMF se suscribe en UDM a cambios de Session Management Data para ambas sesiones. La pertenencia al SMF se prueba por la conexión `tcp.stream 15`, no por el frame. |
| 25–28 | 378, 380, 383, 386 | El UDM crea ambas suscripciones (`201`) y las respuestas regresan al SMF vía SCP. `not decoded` en el segundo tramo significa que TShark no expuso `:status` en ese HEADERS comprimido; no significa rechazo. |
| 29 y 31, 33–34 | 388, 392, 399, 401 | El SMF crea dos asociaciones de política SM en el PCF mediante `Npcf_SMPolicyControl_Create`, pasando por el SCP. Es una interacción de política válida y condicional. |
| 30, 32, 35–36 | 389, 395, 403, 406 | El SMF confirma al AMF la creación de los dos SM Context (`201`) vía SCP. Esto confirma creación del contexto N11; todavía no equivale al Accept NAS final. |
| 37–40 | 409, 410, 412, 413 | El PCF consulta en UDR la política SM para `corporate` e `internet`, vía SCP. Válido como función auxiliar de política. |
| 41–44 | 415, 417, 420, 424 | UDR devuelve `200` al PCF para ambas consultas. Correcto. |
| 45–50 | 428, 430, 444, 449, 452, 455 | El PCF registra dos bindings en el BSF mediante `Nbsf_Management_Register`; se observan petición vía SCP y respuesta `201`. Es válido en este despliegue, aunque no es un mensaje universalmente obligatorio para todo establecimiento PDU. |
| 51–52 | 457, 461 | El SCP devuelve al PCF las respuestas de los dos bindings. `not decoded` expresa una limitación de decodificación del HEADERS exterior. |
| 53–56 | 464, 466, 469, 472 | El PCF responde `201` al SMF para ambas asociaciones de política, vía SCP. Correcto. |
| 57–60 | 474, 476, 477, 478 | El SMF crea dos sesiones PFCP en el UPF `10.210.50.9`: dos `N4 Session Establishment Request` y dos respuestas. Corresponde a los pasos 10a–10b. La captura no aporta una clave suficiente para asignar de forma inequívoca cada SEID a PSI 1 o 2; la vista no inventa esa asociación. |
| 61–64 | 479, 483, 494, 501 | El SMF entrega al AMF, vía SCP, dos `Namf_Communication_N1N2MessageTransfer`. Los cuerpos contienen `PDU Session Establishment Accept` NAS `0xC2`, uno para PSI 2 y otro para PSI 1. Corresponde al paso 11. |
| 65 y 67 | 509, 511 | El AMF envía al gNodeB dos `N2 PDU Session Resource Setup Request`, PSI 2 y PSI 1. Corresponde al paso 12. |
| 66, 68–70 | 510, 514, 517, 519 | El AMF confirma al SMF, vía SCP, la recepción/procesamiento de ambos `N1N2MessageTransfer` con `200`. Es la respuesta de la operación Namf, no una respuesta del UE. |
| 71 | 523 | El gNodeB responde al AMF por PSI 2 con `N2 PDU Session Resource Setup Response`. Corresponde al paso 14. |
| 72–73 | 524, 527 | El AMF entrega al SMF, vía SCP, la información N2 resultante para PSI 2 mediante `Nsmf_PDUSession_UpdateSMContext`. Corresponde al paso 15. |
| 74–75 | 530, 531 | El SMF modifica la sesión PFCP en el UPF para instalar la información del túnel AN/N3 de PSI 2. Corresponde al paso 16a. |
| 76–83 | 532, 535, 538, 541, 544, 545, 546, 549 | Para PSI 2, el SMF registra su asociación en UDM y el UDM actualiza UDR. Las respuestas `204/201` regresan por SCP. Es el paso condicional 16c. |
| 84–85 | 552, 553 | El SMF finaliza `UpdateSMContext` de PSI 2 con `204`, vía SCP. Antes faltaban estas líneas y ahora están correlacionadas por el URI del SM Context. |
| 86 | 559 | El gNodeB responde al AMF por PSI 1 con `N2 PDU Session Resource Setup Response`. Correcto. |
| 87–88 | 560, 563 | El AMF actualiza en el SMF, vía SCP, el SM Context de PSI 1 con la información N2. Paso 15. |
| 89–90 | 566, 567 | El SMF modifica la segunda sesión PFCP en el UPF. Paso 16a. |
| 91–98 | 568, 571, 574, 577, 580, 582, 584, 587 | Para PSI 1, el SMF registra la asociación en UDM y UDR; se observan las respuestas `204/201` a través del SCP. Paso condicional 16c. |
| 99–100 | 590, 592 | El SMF finaliza `UpdateSMContext` de PSI 1 con `204`, vía SCP. Correcto. |

## Evidencia faltante o no visible

Estas ausencias no autorizan a inventar mensajes:

- El primer `UE → AMF: PDU Session Establishment Request` no puede mostrarse
  como una flecha UE→gNodeB→AMF. El frame 299 sólo permite leer
  `UplinkNASTransport`; el NAS está protegido. El mismo contenedor se decodifica
  posteriormente como `0xC1` dentro de N11 en los frames 302 y 306.
- No se captura NR-Uu/RRC. Por ello no aparece el posible RRC Reconfiguration
  del paso 13 ni una flecha fabricada entre UE y gNodeB.
- No existe un mensaje NAS denominado `PDU Session Establishment Complete`.
  Release 16 no exige ese cierre equivalente al `Registration Complete`.
- No aparecen CHF, NRF ni NSSF dentro de esta secuencia concreta. CHF no está
  desplegado; el descubrimiento puede estar delegado/caché en SCP y la selección
  de slice puede haberse realizado antes. No deben insertarse sólo para completar
  la topología.
- El filtro no muestra tráfico GTP-U/ICMP porque pertenece a «Datos», posterior
  al establecimiento del plano de usuario.

## Correspondencia normativa

- Paso 1, solicitud NAS UE→AMF: TS 23.502 V16.19.0, línea 3999 del Markdown local.
- Paso 3, `Nsmf_PDUSession_CreateSMContext`: líneas 4067–4069.
- Pasos 10a–10b, N4 Establishment: líneas 4181–4195.
- Paso 11, `Namf_Communication_N1N2MessageTransfer`: línea 4205.
- Pasos 12–16c, N2 setup, actualización SM y N4 Modification: líneas 4241–4293.

## Conclusión

Después de las correcciones, no queda un evento conocido que deba retirarse del
filtro «Sesión PDU». Sí existen operaciones auxiliares y condicionales (PCF,
BSF, UDM/UDR), pero pertenecen a la ejecución observada. El resultado `success`
significa que para PSI 1 y PSI 2 se observaron `0xC1`, `0xC2`, establecimiento
N4 y respuestas N2 con el mismo contexto disponible; no significa certificación
integral de Open5GS contra todo Release 16.
