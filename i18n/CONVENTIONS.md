# Convenciones de i18n (es/en)

Guía obligatoria para migrar strings a i18next. El español es el idioma FUENTE;
el inglés se traduce con el glosario de abajo.

## Arquitectura

- Singleton en `i18n/index.js` (init síncrono, `lng: 'es'` fijo; el idioma real
  lo aplica `settings/LanguageSync.jsx` en runtime). Recursos en
  `i18n/locales/{es,en}/<dominio>.json`, fusionados por `i18n/resources.js`
  como grupos top-level de un único namespace.
- **Componentes React**: `const { t } = useTranslation()` (de `'react-i18next'`).
  No hace falta provider (instancia global).
- **Fuera de React** (api/, helpers/, hooks fuera de render, clases, valores que
  deben re-resolverse por llamada): `import i18n from '<ruta>/i18n'` y
  `i18n.t('...')` EN CALL TIME — jamás resolver un `t()` a nivel de módulo
  (quedaría congelado en el idioma del arranque).
- **Fechas**: sustituir todo `'es-ES'` hardcodeado y `toLocaleDateString()` pelado
  por `getDateLocale()` de `i18n/index.js`.

## Claves

- Jerarquía `dominio.pantalla.elemento` (o `dominio.seccion.item`), hojas en
  camelCase: `auth.login.title`, `p2p.offer.toasts.published`.
- Toasts bajo `<dominio>.<pantalla>.toasts.*`; Alert.alert bajo
  `<dominio>.<pantalla>.alerts.*` (título/body/botones). Botones genéricos
  (Cancelar/Aceptar/Eliminar/…) se REFERENCIAN desde `common.actions.*`, no se
  duplican.
- `common.json` está CONGELADO: se referencia (`common.actions.cancel`,
  `common.status.paid`, `common.time.day`, `common.dates.today`,
  `common.toasts.copied`, `common.p2pType.buy`…) pero NO se edita. Si falta algo
  "compartible", va en el JSON del dominio propio (se deduplica al final).
- Cada lote SOLO edita sus archivos fuente asignados + `es/<dominio>.json` +
  `en/<dominio>.json`. Nada más.

## Ley de extracción VERBATIM

El valor en `es/*.json` debe ser IDÉNTICO byte a byte al literal actual del
código: acentos, comillas curvas (“ ” ’), signos ¿¡, `\n` en plantillas
multilínea, puntuación final, mayúsculas. NO corregir ni "mejorar" el español
durante la extracción — eso mantiene verdes las aserciones de los tests
existentes sin tocarlas. Las mejoras de copy son commits separados posteriores.

## Interpolación y plurales

- Variables con nombre: `{{camelCase}}`. Orden de palabras libre por idioma:
  `` `${label} activado` `` → es `"{{label}} activado"` / en `"{{label}} enabled"`.
- NUNCA concatenar traducciones ni partir una frase en varias claves por
  estructura del código; un ternario de 3 literales = 3 claves completas.
- Plurales con `count`: sufijos `_one`/`_other` en AMBOS idiomas.
  `t('x.items', { count: n })` con `"items_one": "{{count}} producto"`,
  `"items_other": "{{count}} productos"`.
- **Gotcha del cero**: el patrón manual `>1 ? 's' : ''` renderizaba singular con
  count 0; i18next usa `_other` (plural, correcto) con 0. Si un test fija el
  caso 0 en singular, actualizar ESA aserción en el mismo commit (edición
  sancionada) y anotarlo.

## Qué NO traducir

1. Prosa de error que llega del backend (passthrough `result.error` /
   `error.response.data.message`): se muestra tal cual; solo el FALLBACK local
   es clave de i18n.
2. Marcas y nombres propios: QvaPay, QvaPay GOLD, QUSD, satoshis, P2P, KYC, PIN,
   Face ID, Touch ID, Telegram, Passkeys, nombres de wallets (Trust Wallet…),
   Cubacel, Zendit, Amazon, eBay.
3. Valores/enums que viajan a la API o se comparan contra datos del backend
   (p.ej. la categoría 'Criptomonedas' en filterCoins, `source`, ticks).
4. Payloads de OneSignal (título/cuerpo los compone el servidor).
5. Valores de `routes.js` (contrato de deep links), claves de AsyncStorage,
   servicios de Keychain, nombres de iconos.
6. `ui/BottomBar.jsx` (código muerto, excluido del barrido).

## Glosario es → en (consistencia fintech)

Depositar→Deposit · Extraer/Retirar→Withdraw · retiro→withdrawal · Enviar→Send ·
Recibir→Receive · saldo→balance · monto→amount · tasa→rate · comisión→fee ·
oferta→offer · anuncio→listing · Comprar/Vender→Buy/Sell · Ahorros→Savings ·
Invertir→Invest · Recarga(s) móvil(es)→Mobile top-up(s) · recargar→top up ·
Tarjetas de regalo→Gift cards · Tienda/Tiendas→Store/Stores · carrito→cart ·
Pedido→Order · Mis Compras→My Purchases · Compras asistidas→Assisted shopping ·
Transacciones→Transactions · Transferencia→Transfer · Factura→Invoice ·
Confirmar pago→Confirm payment · Pago rápido→Quick pay · contraseña→password ·
huella→fingerprint · Verificación de identidad→Identity verification ·
Bloqueo de app→App lock · Llaves de acceso→Passkeys · Hazte GOLD→Go GOLD ·
Invitar amigos→Invite friends · referidos→referrals · Ajustes→Settings ·
Iniciar sesión→Log in · Regístrate→Sign up · Cerrar sesión→Log out ·
Reintentar→Retry · Cancelar→Cancel · Aceptar→OK · Continuar→Continue ·
Entendido→Got it · Ahora no→Not now · Ver todas→See all · Copiado al
portapapeles→Copied to clipboard · medios de pago→payment methods ·
método de pago→payment method · comercio→merchant · vendedor→seller ·
contraparte→counterparty · disponible→available · Escanear→Scan

Tono en inglés: claro y directo, sentence case (solo mayúscula inicial salvo
nombres propios), sin traducciones literales rígidas — "No se pudo cargar X" →
"Couldn't load X".

## Flujo por lote

1. Extraer literales → `es/<dominio>.json` (verbatim).
2. Traducir → `en/<dominio>.json` (glosario; misma estructura de claves).
3. Sustituir en el código (`t()` en componentes, `i18n.t()` fuera de React).
4. `npx jest <paths del dominio>` — arreglar SOLO roturas causadas por estos
   edits y solo en las categorías sancionadas (caso plural 0, strings ingleses
   legacy de useAuthState, rediseño del catálogo de settings).
5. `node scripts/check-i18n.js` — paridad es/en sin faltantes.
