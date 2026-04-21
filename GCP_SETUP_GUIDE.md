# Guía: Configurar Proyecto GCP para Publicación

Pasos para vincular el add-on con Google Cloud y configurar OAuth antes de publicar en Marketplace.

## 1. Crear proyecto en Google Cloud Console

1. Ve a [console.cloud.google.com](https://console.cloud.google.com/).
2. Crea un nuevo proyecto:
   - Nombre sugerido: `rut-cleaner-chile`
   - Organización: la que uses (o "Sin organización").
3. Anota el **Project Number** (lo necesitas en el paso 2).

## 2. Vincular el proyecto GCP al script de Apps Script

1. Abre tu proyecto en [script.google.com](https://script.google.com/).
2. Ve a **Project Settings** (ícono de engranaje).
3. En "Google Cloud Platform (GCP) Project", haz clic en **Change project**.
4. Pega el **Project Number** del paso anterior.
5. Guarda.

> **Nota**: Si te pide habilitar la API de Apps Script, hazlo desde la consola de GCP: APIs & Services > Library > busca "Apps Script API" > Enable.

## 3. Configurar OAuth Consent Screen

1. En GCP Console, ve a **APIs & Services > OAuth consent screen**.
2. Selecciona **External** (para que cualquier usuario pueda instalar).
3. Completa los campos:

| Campo | Valor |
|-------|-------|
| App name | RUT Cleaner Chile |
| User support email | tu-email@ejemplo.com |
| App logo | Logo del add-on (128x128 PNG, opcional pero recomendado) |
| Application home page | URL de tu landing (puede ser GitHub Pages) |
| Privacy policy link | URL de `PRIVACY_POLICY.md` publicada |
| Terms of service link | URL de `TERMS_OF_SERVICE.md` publicada |
| Developer contact email | tu-email@ejemplo.com |

4. En **Scopes**, agrega:
   - `https://www.googleapis.com/auth/spreadsheets.currentonly`
   - `https://www.googleapis.com/auth/script.container.ui`

5. En **Test users**, agrega tu cuenta para poder probar antes de publicar.

6. **Publica la app** (botón "Publish App") para pasar de "Testing" a "In Production".
   - Nota: esto no publica en Marketplace, solo permite que cualquier usuario autorice la app.
   - Si tus scopes son no-sensibles (`spreadsheets.currentonly` y `script.container.ui`), no necesitas verificación de OAuth.

## 4. Configurar Marketplace SDK

1. En GCP Console, ve a **APIs & Services > Library**.
2. Busca **Google Workspace Marketplace SDK** y habilítalo.
3. Ve a la página de configuración del SDK.
4. Completa:

| Campo | Valor |
|-------|-------|
| App Visibility | Public |
| Installation Settings | Individual + Admin Install |
| Integration Type | Editor Add-on |
| Script ID | El ID de tu proyecto de Apps Script |
| OAuth Scopes | Los mismos 2 scopes de arriba |

## 5. Crear Listing

1. Dentro del Marketplace SDK, ve a **Store Listing**.
2. Usa el contenido de `LISTING_COPY.md` para:
   - Nombre de la aplicación
   - Descripción corta y larga
   - Categoría: Productivity
   - URLs de soporte, privacidad y términos
3. Sube capturas reales (mínimo 1, recomendado 3-5).
4. Sube ícono de la app (128x128 y 32x32).

## 6. Enviar a revisión

1. Verifica que todos los campos estén completos.
2. Haz clic en **Publish**.
3. Google revisará (normalmente toma 3-7 días hábiles).
4. Si hay observaciones, las verás en la consola. Responde con cambios mínimos.

## 7. Verificación pre-envío

Antes de enviar, confirma:

- [ ] OAuth consent screen en estado "In Production"
- [ ] Scopes coinciden entre `appsscript.json` y OAuth consent
- [ ] URLs de privacidad y términos son accesibles públicamente
- [ ] Al menos 1 captura real subida
- [ ] El add-on funciona correctamente para un usuario externo (no tu cuenta)
- [ ] `runAllSelfTests` en verde
- [ ] Proceso de 10k filas completado sin errores

## Nota sobre scopes adicionales

Si decides usar la Web API admin (para cobro automático con Stripe), la Web App se despliega como un deploy separado y no agrega scopes al add-on para el usuario final. Los scopes del `appsscript.json` son los que ve el usuario cuando instala.

Sin embargo, si en el futuro necesitas que el add-on haga llamadas HTTP salientes (por ejemplo, verificar licencia contra un servidor externo), necesitarás agregar:

```json
"https://www.googleapis.com/auth/script.external_request"
```

Esto requeriría nueva verificación de OAuth. Por ahora, el diseño actual (licencias en Script Properties) no lo necesita.
