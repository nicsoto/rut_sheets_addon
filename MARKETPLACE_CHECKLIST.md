# Marketplace Checklist

Checklist para minimizar riesgo de rechazo al publicar.

## OAuth y permisos

1. Scopes minimos y justificados.
2. OAuth consent screen en estado Production para publicacion.
3. Nombre de app consistente entre OAuth y listing.
4. Si agregas scopes sensibles, completar OAuth verification.

## Listing

1. Descripcion clara del problema que resuelve.
2. Capturas reales del flujo en Sheets.
3. Politica de privacidad accesible.
4. Terminos de servicio accesibles.
5. Canal de soporte accesible.
6. Pricing claro (Free, Trial, Pro) sin costos ocultos.

## Compliance

1. No almacenar PII innecesaria.
2. No usar datos para publicidad personalizada.
3. Log de errores sin exponer datos sensibles.
4. Mecanismo de borrado o minimizacion de datos documentado.

## QA antes de enviar

1. `runAllSelfTests` en verde.
2. Caso de uso basico completo sin errores.
3. Caso de limite de plan mostrado correctamente.
4. Manejo de fallos de hoja renombrada/eliminada.
5. Reporte exportado sin fallas.

## Operacion post-lanzamiento

1. Revisar feedback de Google y responder rapido.
2. Monitorear errores en Executions diariamente.
3. Publicar fixes pequenos con changelog.
