# Evaluación Cuantitativa de Resiliencia y Detección de Fallas (EMS 5G)

**Fecha de ejecución:** 2026-09-03 04:03:55 UTC  
**Criterio de Aceptación Evaluado:** Criterio #2 (< 5s detección) y Criterio #10 (10 ciclos sin residuos)  
**Total de pruebas ejecutadas:** 30 ciclos

## 1. Resumen Estadístico para el Capítulo de Resultados

| Código Caso | Descripción del Experimento | Ciclos | Éxito (%) | Detección Media (s) | Detección Máx (s) | Recuperación Media (s) | Residuos |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `5G-F03` | 5G-F03: Caída de Función de Red del Core (AMF) | 10 | 100.0% | **0.628s** (±0.05) | **0.703s** | **0.642s** | **0** |
| `OPS-F01` | OPS-F01: Aislamiento de Tráfico en Plano de Usuario (N6) | 10 | 100.0% | **0.545s** (±0.088) | **0.703s** | **0.555s** | **0** |
| `5G-F01` | 5G-F01: Falla de Autenticación / SUPI no provisionado | 10 | 100.0% | **0.883s** (±0.087) | **1.078s** | **0.875s** | **0** |

## 2. Detalle de los 30 Ciclos Evaluados

| Caso | Ciclo | Tiempo Detección (s) | Tiempo Recuperación (s) | Alarma Disparada | Despeje Confirmado | Cero Residuos |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `5g-f03` | #01 | 0.672 s | 0.640 s | ✓ | ✓ | ✓ |
| `5g-f03` | #02 | 0.610 s | 0.625 s | ✓ | ✓ | ✓ |
| `5g-f03` | #03 | 0.656 s | 0.563 s | ✓ | ✓ | ✓ |
| `5g-f03` | #04 | 0.594 s | 0.687 s | ✓ | ✓ | ✓ |
| `5g-f03` | #05 | 0.563 s | 0.593 s | ✓ | ✓ | ✓ |
| `5g-f03` | #06 | 0.625 s | 0.562 s | ✓ | ✓ | ✓ |
| `5g-f03` | #07 | 0.563 s | 0.640 s | ✓ | ✓ | ✓ |
| `5g-f03` | #08 | 0.687 s | 0.719 s | ✓ | ✓ | ✓ |
| `5g-f03` | #09 | 0.609 s | 0.688 s | ✓ | ✓ | ✓ |
| `5g-f03` | #10 | 0.703 s | 0.703 s | ✓ | ✓ | ✓ |
| `ops-f01` | #01 | 0.594 s | 0.484 s | ✓ | ✓ | ✓ |
| `ops-f01` | #02 | 0.578 s | 0.578 s | ✓ | ✓ | ✓ |
| `ops-f01` | #03 | 0.593 s | 0.688 s | ✓ | ✓ | ✓ |
| `ops-f01` | #04 | 0.703 s | 0.782 s | ✓ | ✓ | ✓ |
| `ops-f01` | #05 | 0.609 s | 0.563 s | ✓ | ✓ | ✓ |
| `ops-f01` | #06 | 0.562 s | 0.516 s | ✓ | ✓ | ✓ |
| `ops-f01` | #07 | 0.454 s | 0.484 s | ✓ | ✓ | ✓ |
| `ops-f01` | #08 | 0.484 s | 0.484 s | ✓ | ✓ | ✓ |
| `ops-f01` | #09 | 0.438 s | 0.484 s | ✓ | ✓ | ✓ |
| `ops-f01` | #10 | 0.437 s | 0.485 s | ✓ | ✓ | ✓ |
| `5g-f01` | #01 | 0.844 s | 0.828 s | ✓ | ✓ | ✓ |
| `5g-f01` | #02 | 0.875 s | 0.906 s | ✓ | ✓ | ✓ |
| `5g-f01` | #03 | 0.922 s | 0.844 s | ✓ | ✓ | ✓ |
| `5g-f01` | #04 | 0.907 s | 0.953 s | ✓ | ✓ | ✓ |
| `5g-f01` | #05 | 0.813 s | 0.968 s | ✓ | ✓ | ✓ |
| `5g-f01` | #06 | 0.953 s | 0.891 s | ✓ | ✓ | ✓ |
| `5g-f01` | #07 | 0.844 s | 0.828 s | ✓ | ✓ | ✓ |
| `5g-f01` | #08 | 0.781 s | 0.813 s | ✓ | ✓ | ✓ |
| `5g-f01` | #09 | 1.078 s | 0.906 s | ✓ | ✓ | ✓ |
| `5g-f01` | #10 | 0.812 s | 0.813 s | ✓ | ✓ | ✓ |

## 3. Conclusiones para la Tesis

1. **Cumplimiento estricto del límite 3GPP/EMS:** En todos los ciclos, el tiempo de detección fue significativamente inferior al umbral máximo de 5.0 segundos fijado en la propuesta de tesis.
2. **Determinismo en la recuperación:** La restauración de servicios mediante el EMS no dejó procesos zombis, interfaces caídas ni registros corruptos en MongoDB.
3. **Disponibilidad para la defensa:** Estos datos sustentan la viabilidad y fiabilidad del EMS ante el jurado calificador.
