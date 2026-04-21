# RUT Cleaner Chile (Apps Script)

Editor add-on de Google Sheets para validar, normalizar y depurar RUT en lotes.

## Funcionalidades incluidas

- Validacion de DV por modulo 11.
- Normalizacion de formato a `XXXXXXXX-DV`.
- Deteccion de registros invalidos con motivo (VACIO, FORMATO_INVALIDO, DV_INVALIDO).
- Marcado de duplicados basado en RUT normalizado.
- Procesamiento por lotes con pausa/reanudacion.
- Persistencia del estado del job para evitar perder avance.
- Planes Free/Trial/Pro con limite mensual de filas.
- Reporte exportable del ultimo proceso.
- Telemetria estructurada a Cloud Logging y opcion de log a hoja oculta.
- Funciones admin para configurar licencias sin backend externo.
- Pruebas de carga integradas (1k, 10k, 50k filas).
- Suite de 29 test cases automatizados.

## Estructura

### Apps Script (nucleo del add-on)

| Archivo | Funcion |
|---------|---------|
| `appsscript.json` | Manifiesto con scopes minimos |
| `Main.gs` | Menu, sidebar, funciones publicas, generadores de datos |
| `RutEngine.gs` | Reglas de validacion y normalizacion RUT + self-test (29 casos) |
| `JobService.gs` | Estado, configuracion y utilidades |
| `BatchProcessor.gs` | Ejecucion por lotes y finalizacion |
| `EntitlementService.gs` | Planes, trial, cuotas y licencias |
| `TelemetryService.gs` | Logging estructurado y log opcional en sheet |
| `ReportingService.gs` | Export de resumen de ejecucion |
| `WebApi.gs` | Endpoint administrativo para aprovisionar licencias |
| `Sidebar.html` | Interfaz lateral para operar el proceso |

### Webhook de cobro (Stripe → Apps Script)

| Archivo | Funcion |
|---------|---------|
| `licensing_webhook_service/src/server.js` | Webhook Stripe completo |
| `licensing_webhook_service/Dockerfile` | Empaquetado Cloud Run |
| `licensing_webhook_service/DEPLOY_CLOUD_RUN.md` | Guia de despliegue |

### Documentacion

| Archivo | Funcion |
|---------|---------|
| `DEPLOYMENT_GUIDE.md` | Guia paso a paso para desplegar en Apps Script |
| `GCP_SETUP_GUIDE.md` | Configurar proyecto GCP + OAuth + Marketplace SDK |
| `TESTING_GUIDE.md` | Procedimientos de testing Fase 5 (funcional, carga, resiliencia) |
| `MARKETPLACE_CHECKLIST.md` | Checklist de publicacion |
| `LISTING_COPY.md` | Copy final para el listing de Marketplace |
| `PAYMENT_INTEGRATION.md` | Blueprint de integracion de pagos |
| `PRIVACY_POLICY.md` | Politica de privacidad completa |
| `TERMS_OF_SERVICE.md` | Terminos de servicio completos |

### Sitio legal (GitHub Pages)

| Archivo | Funcion |
|---------|---------|
| `docs/index.html` | Landing page con soporte y links |
| `docs/privacy.html` | Politica de privacidad (HTML) |
| `docs/terms.html` | Terminos de servicio (HTML) |

## Flujo de uso en Google Sheets

1. Abre un Spreadsheet para desarrollo.
2. Ve a Extensions > Apps Script.
3. Reemplaza los archivos del proyecto por el contenido de esta carpeta.
4. Ejecuta `onOpen` una vez para registrar el menu y autorizar scopes.
5. En la hoja, deja tus datos con encabezados en fila 1.
6. Abre menu `RUT Cleaner Chile` > `Abrir panel`.
7. Configura hoja, columna de entrada y columna de salida.
8. Pulsa `Iniciar`.

El proceso escribe 4 columnas de salida desde la columna definida:

1. RUT Normalizado
2. Es Valido
3. Motivo
4. Es Duplicado

Si el usuario supera su cuota mensual del plan, el proceso se detiene en estado `LIMIT_REACHED` y el panel muestra el enlace de upgrade.

## Prueba rapida

1. En la hoja: menu `RUT Cleaner Chile` > `Crear datos demo (12 filas)`.
2. Abre el panel y procesa columna `B` hacia salida en `C`.
3. Verifica resultados en columnas C:F.
4. Ejecuta `Ejecutar self-test` para validar el motor (29 casos).

## Pruebas de carga

1. Menu `RUT Cleaner Chile` > `Crear datos carga 10k`.
2. Menu `RUT Cleaner Chile` > `Correr load test completo`.
3. Espera el resultado — muestra tiempo, velocidad y si cumple meta de 10k < 5min.

Para procedimientos detallados de testing, ver `TESTING_GUIDE.md`.

## Configuracion de plan y monetizacion

### Script Properties recomendadas

| Property | Descripcion | Default |
|----------|-------------|---------|
| `rutCleaner.v1.upgradeUrl` | URL de checkout o landing de upgrade | `https://example.com/rut-cleaner-pro` |
| `rutCleaner.v1.freeMonthlyRowLimit` | Limite mensual para plan Free | `10000` |
| `rutCleaner.v1.trialDays` | Duracion del trial en dias | `7` |
| `rutCleaner.v1.logToSheet` | Duplicar logs en hoja oculta | `false` |
| `rutCleaner.v1.adminApiToken` | Token secreto para Web API admin | (requerido para cobro) |

### Funciones admin utiles

- `adminUpsertUserLicense(email, { planId, expiresAt|validDays, monthlyRowsLimit, eventId, eventCreatedAt })`
- `adminUpsertDomainLicense(domain, { planId, expiresAt|validDays, monthlyRowsLimit, eventId, eventCreatedAt })`
- `adminGrantProToEmail(email, validDays, monthlyRowsLimit)`
- `adminGrantProToDomain(domain, validDays, monthlyRowsLimit)`
- `adminRevokeUserLicense(email)` / `adminRevokeDomainLicense(domain)`
- `adminSetUpgradeUrl(url)` / `adminSetFreeMonthlyLimit(limit)` / `adminSetTrialDays(days)`
- `adminResetMyCurrentMonthUsage()` / `adminGetLicensesSnapshot()`
- `adminEnableSheetLogging(enabled)`

## Flujo local con clasp (opcional)

1. Copia `.clasp.json.example` a `.clasp.json` y completa tu `scriptId`.
2. Ejecuta `npm install`.
3. Usa scripts: `npm run push`, `npm run pull`, `npm run deploy`, `npm run logs`.

## Hospedaje de documentos legales (GitHub Pages)

1. Sube el repo a GitHub.
2. En Settings > Pages, selecciona Source: `main` branch, carpeta `/docs`.
3. Las URLs publicas seran:
   - `https://TU-USUARIO.github.io/TU-REPO/privacy.html`
   - `https://TU-USUARIO.github.io/TU-REPO/terms.html`
4. Usa esas URLs en el OAuth consent screen y en el listing de Marketplace.

## Recomendaciones de operacion

- Deja fila 1 para encabezados.
- Usa lotes de 500 a 1500 para equilibrio entre velocidad y estabilidad.
- No edites ni elimines la hoja mientras un proceso este corriendo.
- Si el proceso se detiene por timeout, usa `Continuar`.
- Si el proceso queda en `LIMIT_REACHED`, aumenta plan o espera al siguiente periodo mensual.
