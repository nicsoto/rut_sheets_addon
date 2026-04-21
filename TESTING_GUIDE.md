# Guía de Testing — RUT Cleaner Chile

Procedimientos paso a paso para validar Fase 5 (hardening) antes de publicar.

## 1. Pruebas Funcionales (self-test)

### Ejecución

1. Abre el Spreadsheet de desarrollo.
2. Ve a `Extensions > Apps Script`.
3. Ejecuta la función `runAllSelfTests`.
4. O desde la hoja: menú `RUT Cleaner Chile > Ejecutar self-test`.

### Resultado esperado

```
runRutEngineSelfTest OK (29 casos) | runJobServiceSelfTest_ OK
```

### Cobertura de casos

La suite cubre:

| Categoría | Casos |
|-----------|-------|
| Válidos con puntos y guión | `12.345.678-5` |
| Válidos sin puntos | `76086428-5` |
| Válidos 7 dígitos | `7.617.343-5` |
| DV K mayúscula | `10.412.750-K` |
| DV k minúscula | `10.412.750-k` |
| K sin separadores | `10412750k` |
| Separados por espacios | `12 345 678 5` |
| Todo junto sin separador | `123456785` |
| Ceros iniciales (DV correcto) | `0007617343-5` |
| Ceros iniciales (DV incorrecto) | `00012345-6` |
| DV incorrecto (varios) | `12345678-9`, `12.345.678-0`, `76086428-3` |
| String vacío | `""` |
| Null | `null` |
| Undefined | `undefined` |
| Solo espacios | `"   "` |
| Solo letras | `ABC` |
| Un solo carácter | `A`, `1` |
| Texto largo corrupto | `ABCDEFGHIJKLMNOPQRSTUVWXYZ` |
| Texto narrativo | `esto no es un rut valido en absoluto` |
| Body 9+ dígitos | `123456789-0` |
| Solo ceros | `0`, `00` |
| Solo puntos/guiones | `---`, `...` |

Si algún caso falla, el error muestra exactamente cuál caso y qué valor esperado vs obtenido.

---

## 2. Pruebas de Carga

### Paso a paso

1. Menú `RUT Cleaner Chile > Crear datos carga 10k`.
2. Espera a que se escriban las 10,000 filas (columnas A-B).
3. Menú `RUT Cleaner Chile > Correr load test completo`.
4. Espera el resultado (aparece como alerta).

### Resultado esperado para 10k filas

```
=== LOAD TEST RESULT ===
Filas: 10000
Tiempo: <300s
Meta 10k<5min: CUMPLE
```

### Prueba escalada

Repite con:

- `Crear datos carga 1k` — debe completar en segundos.
- `Crear datos carga 50k` — puede tomar varios minutos; anota el tiempo.

### Qué verificar después del load test

1. Columnas C:F tienen datos en todas las filas (sin filas en blanco en medio).
2. No hay errores `#ERROR!` ni celdas con contenido corrupto.
3. La columna "Es Duplicado" marca correctamente los RUT repetidos.
4. El reporte exportado (`Exportar resumen ultimo proceso`) muestra totales coherentes.

---

## 3. Pruebas de Recuperación (Resiliencia)

### Test 3.1: Interrumpir y reanudar

1. `Crear datos carga 10k`.
2. Abre el panel (`Abrir panel`).
3. **Desmarca** "Auto-continuar hasta terminar".
4. Pulsa `Iniciar`.
5. Después de que procese 1-2 lotes (verás progreso ~5-10%), **cierra la pestaña del navegador**.
6. Abre de nuevo la hoja.
7. Menú `RUT Cleaner Chile > Continuar ultimo proceso`.
8. Verifica que continúa desde donde quedó (no desde 0).
9. Deja que termine.

**Resultado esperado**: El proceso se reanuda sin duplicar ni perder filas. El total de filas procesadas es exactamente 10,000.

### Test 3.2: Cancelar y verificar consistencia

1. `Crear datos carga 10k`.
2. `Iniciar` (con auto-continue desactivado).
3. Después de 2-3 lotes, pulsa `Cancelar`.
4. Verifica que las filas ya procesadas tienen datos correctos en C:F.
5. Verifica que las filas no procesadas no tienen datos en C:F.
6. Usa `Limpiar estado de proceso` y luego `Iniciar` de nuevo con las mismas columnas.
7. Verifica que procesa todas las filas (incluyendo las ya procesadas — se sobrescriben).

**Resultado esperado**: No hay corrupción. Los datos parciales son correctos.

### Test 3.3: Hoja renombrada durante proceso

1. Inicia un proceso en una hoja (con auto-continue desactivado).
2. Después de 1 lote, renombra la hoja desde la pestaña inferior.
3. Pulsa `Continuar`.

**Resultado esperado**: El proceso detecta que la hoja cambió y muestra error `FAILED` con mensaje claro.

---

## 4. Prueba de Concurrencia

### Paso a paso

1. Abre la misma hoja en dos pestañas del navegador.
2. En ambas, abre el panel (`Abrir panel`).
3. En la primera pestaña, pulsa `Iniciar`.
4. Inmediatamente, en la segunda pestaña, pulsa `Iniciar`.

**Resultado esperado**: La segunda pestaña muestra un error de lock ("No se pudo obtener lock del documento"). La primera continúa normalmente.

---

## 5. Prueba de Límite de Plan

### Paso a paso

1. En Apps Script, ejecuta: `adminSetFreeMonthlyLimit(100)`.
2. `Crear datos carga 1k`.
3. `Iniciar` desde el panel.

**Resultado esperado**: El proceso se detiene en estado `LIMIT_REACHED` después de procesar 100 filas. El panel muestra mensaje de upgrade.

4. Para restaurar: `adminSetFreeMonthlyLimit(10000)`.
5. También ejecuta `adminResetMyCurrentMonthUsage()`.

---

## 6. Prueba de Reporte

1. Ejecuta cualquier proceso (demo o carga).
2. Menú `RUT Cleaner Chile > Exportar resumen ultimo proceso`.
3. Verifica que se crea una hoja nueva `RUT_Report_YYYYMMDD_HHMMSS`.
4. La hoja tiene: Job ID, estado, conteos, motivos de error con cantidades.

---

## 7. Checklist de Salida a Producción

Marca cada item después de verificar:

- [ ] `runAllSelfTests` en verde (29 casos + utilidades de columna)
- [ ] 10,000 filas procesadas en menos de 5 minutos sin corrupción
- [ ] Reanudación desde checkpoint funciona tras interrupción
- [ ] Bloqueo de concurrencia validado (segunda pestaña rechazada)
- [ ] Límite de plan funciona correctamente
- [ ] Reporte exportado sin fallas
- [ ] Logs suficientes para diagnosticar fallas (verificar en Executions)
- [ ] Hoja renombrada/eliminada detectada correctamente
