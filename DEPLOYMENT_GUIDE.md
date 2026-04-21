# Deployment Guide

Guia practica para dejar el add-on funcionando en un proyecto real de Apps Script.

## 1) Crear proyecto Apps Script

1. Abre Google Sheets.
2. En Extensions > Apps Script, crea un proyecto nuevo.
3. Copia los archivos de esta carpeta al proyecto.
4. Guarda todo.

## 2) Autorizar y validar base

1. Ejecuta `onOpen` desde el editor.
2. Acepta permisos.
3. Vuelve a la hoja y abre el menu `RUT Cleaner Chile`.
4. Ejecuta `Crear datos demo` y luego `Abrir panel`.
5. Corre un proceso de prueba y confirma columnas de salida.

## 3) Configurar Script Properties

En Apps Script, abre Project Settings > Script Properties y define:

1. `rutCleaner.v1.upgradeUrl`
2. `rutCleaner.v1.freeMonthlyRowLimit`
3. `rutCleaner.v1.trialDays`
4. `rutCleaner.v1.logToSheet`
5. `rutCleaner.v1.adminApiToken`

Valores iniciales sugeridos:

- `rutCleaner.v1.upgradeUrl=https://tu-checkout.com/rut-cleaner-pro`
- `rutCleaner.v1.freeMonthlyRowLimit=10000`
- `rutCleaner.v1.trialDays=7`
- `rutCleaner.v1.logToSheet=false`
- `rutCleaner.v1.adminApiToken=token_largo_aleatorio`

## 4) Configurar licencias manuales (opcional)

Ejecuta desde Apps Script:

1. `adminGrantProToEmail("tu@email.com", 365, null)`
2. `adminGrantProToDomain("empresa.cl", 365, null)`
3. `adminGetLicensesSnapshot()`

## 5) Publicacion interna

1. Deploy > Test deployments.
2. Comparte con usuarios internos para validacion.
3. Revisa errores en Executions.

## 6) Desplegar Web API admin (opcional para cobro automatico)

1. En Apps Script: Deploy > New deployment.
2. Tipo: Web app.
3. Ejecutar como: tu cuenta.
4. Acceso: Anyone with the link (si backend externo va a invocar).
5. Guarda URL y usala como APPS_SCRIPT_ADMIN_URL en el webhook service.

## 7) Publicacion Marketplace

1. Crea proyecto estandar en Google Cloud vinculado al script.
2. Configura OAuth consent screen.
3. Completa listing y links legales.
4. Envia revision publica.

## 8) Checklist de release

1. Self-tests en verde (`runAllSelfTests`).
2. Prueba con 10k filas sin errores fatales.
3. Reanudacion desde pausa funcionando.
4. Export de reporte funcionando.
5. Flujo de limite de plan visible en panel.
