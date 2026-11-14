# E2E con Maestro

Flujos de extremo a extremo sobre el simulador de iOS (build de dev con Metro) o el emulador de Android (también contra el APK de release).

```bash
curl -Ls https://get.maestro.mobile.dev | bash   # una vez (requiere Java 17+)
npm run ios                                      # app instalada + Metro
npm run e2e:wallet                               # corre .maestro/ en orden
```

Las capturas y los logs de cada corrida quedan en `.maestro/output/`, que está en `.gitignore`.

## wallet-guest/: la wallet sin cuenta

| Flujo | Qué cubre |
|---|---|
| 01_create_wallet | Welcome → "Solo quiero una wallet" → PIN (con un fallo de confirmación) → seed → quiz → WalletOnly con swap (wallet ↔ wallet), sin P2P y con la tarjeta de cuenta |
| 02_asset_guest | Activo TRON: con actividad (historial público); con swap y sin energía (el explorador solo sale cuando no hay swap) |
| 03_receive | Recibir sin cuenta |
| 04_security_back | Seguridad abre el panel de la wallet como raíz y su "volver" regresa |
| 05_cold_start_lock | Arranque en frío con wallet y sin sesión → bloqueo con PIN → WalletOnly |
| 06_signin_opens_login | "Iniciar sesión" abre Login encima |
| 07_delete_wallet | Borrar la wallet (PIN + confirmación) → Welcome |
| 08_import_wallet | Importar "abandon … about" → aviso de cuenta TRON con dueño ajeno (la de esa frase es un cebo con USDT) y dirección ETH determinista `0x9858EfFD…EcaEda94` |
| 09_abandoned_backup | Alta a medias → Welcome "Abrir mi wallet" → retomar el backup pasa por el PIN |
| 10_staking | Importar "abandon … about" → Ganar → SOL: aviso de riesgos (bloqueado sin marcar), mínimo de 1 SOL visible y con Continuar deshabilitado, selector con los 3 validadores y su APY medido, confirmación preparada contra mainnet (NUNCA firma) → TRX: aviso propio, SR con APY, saldo insuficiente |
| 11_pin_attempt_limit | Importar "abandon … about" → bloqueo: el PIN correcto devuelve los intentos (tres fallos, acierto y otros cuatro fallos no abren espera), el quinto fallo abre la cuenta atrás y cada fallo siguiente la alarga (30 s, 1 min, 5 min); en la de 5 min, matar la app no la quita y ni el PIN correcto entra; cumplida, entra. Dura unos 16 min |
| 12_wallet_gate_attempt_limit | El modal que pide el PIN antes de leer la seed comparte ese límite: cuatro fallos en el modal y uno en el bloqueo, tras matar la app, abren la espera; con cinco en el modal desaparece el campo del PIN, y cerrar y abrir el modal no devuelve intentos |
| 13_lock_cannot_be_disabled | Mi wallet → "PIN y bloqueo" (también sin cuenta): con wallet en el teléfono no hay botón de desactivar el bloqueo, sale la nota |

Los flujos 02 a 07 dependen del estado que deja el 01 (`executionOrder` en `config.yaml`); el 08, el 09, el 10 y el 11 arrancan en limpio, y el 12 y el 13 parten del estado que deja el 11.

## Reglas para escribir flujos

- **Seleccionar por `testID`**, nunca por texto: la app sigue el idioma del dispositivo (es/en/pt-BR). `QPButton`, `QPActionTile` y `QPPressable` reenvían `testID`.
- **`subflows/fresh_start.yaml`** borra los datos **y el Keychain** de la app, así que se pierden la sesión, la seed y el PIN del simulador.
- **PIN dígito a dígito** (`subflows/type_pin.yaml`): `QPCodeInput` salta de caja en cada carácter y un `inputText` de golpe pierde dígitos.
- **Cuenta atrás del límite de intentos**: se reconoce por su forma (`.*[0-9]:[0-9][0-9].*` sobre `lock-notice` o `wallet-auth-limit`), nunca por su texto. "PIN incorrecto" no lleva dígitos en ningún idioma. En el modal de la wallet, un PIN malo va por `subflows/wrong_wallet_auth_pin.yaml`, que espera a que `wallet-auth-error` lleve letras (sin fallo, ese hueco es un espacio).
- **No teclear cuando una espera está a punto de cumplirse**: durante la espera el teclado del bloqueo no escribe, y Maestro tarda varios segundos por tecla. Si la espera se cumple a mitad del PIN, los primeros dígitos se descartan, los últimos entran y el PIN siguiente sale corrido y cuenta como otro fallo (la app descarta entero un PIN tecleado de corrido, pero no teclas separadas por segundos). Lo que tarda (relanzar la app, teclear un PIN) se comprueba en una espera larga; las cortas solo se dejan pasar, y nunca se da por hecho cuánto tarda el dispositivo.
- **Los `timeout` cuentan desde la última interacción**, no desde que empieza la orden: Maestro le resta al `timeout` de un `extendedWaitUntil` lo que haya pasado desde el último toque, texto o `launchApp`. Tras una espera larga o varias órdenes que no tocan nada, un `timeout` corto ya está vencido y la orden mira UNA vez. Si hace falta esperar de verdad en ese punto, se sondea con `repeat` + `while` (`subflows/cold_lock.yaml` lo hace con el diálogo de huella, que en dev llega segundos después del bloqueo).
- **En dev, recién arrancada en frío, la app tarda segundos en atender nada** (un dígito del bloqueo, 2-5 s en un teléfono real): las esperas tras teclear un PIN son de 30 s.
- **PIN en un modal o en el bloqueo**: entran con fundido y la caja se enfoca después, así que teclear en cuanto son visibles pierde dígitos. El modal de la wallet va por `subflows/wallet_auth_pin.yaml` (espera, toca `wallet-auth-pin-0` y teclea). El bloqueo de arranque no tiene entrada de texto: se teclea en su propio teclado (`QPKeypad`) tocando `lock-key-<dígito>` (`subflows/tap_lock_pin.yaml`), tras esperar al fundido.
- **Volver**: en iOS no existe `back`. `subflows/header_back.yaml` toca la flecha nativa por su etiqueta (el nombre de la ruta anterior, porque los títulos van vacíos) *mientras siga visible*. Un toque que coincide con la reconfiguración del header (refresco de saldos) se pierde, y `retryTapIfNoChange` no lo detecta porque el precio en pantalla sí cambió.
- **No tocar el código mientras corre la suite contra Metro**: un cambio en un módulo compartido (tema, contextos) recarga el bundle, la app arranca en frío con wallet y PIN, y sale el bloqueo donde el flujo esperaba otra pantalla. El fallo parece de la app y no lo es.
- **Toast de LogBox en dev** ("Open debugger to view warnings"): tapa los botones del pie. `subflows/dismiss_logbox.yaml` lo cierra. En Android sale ya en el arranque en limpio (lo dispara un aviso del onboarding) y su contenedor reserva arriba el hueco de la barra de estado: esa franja invisible cae sobre el enlace de la wallet de Welcome y se queda con el toque, así que `fresh_start.yaml` lo cierra antes de tocar nada. Cerrarlo tocando el cuerpo (no la ✕) le pide a Metro que abra las DevTools en el ordenador.
- **Scroll**: no se usa `scrollUntilVisible`. En Android es inestable en las dos direcciones: con el scroll al final o al principio no reconoce elementos que están en pantalla, y `centerElement` agota el tiempo en los extremos. Se usan `subflows/scroll_down_to.yaml` y `scroll_up_to.yaml` (scroll *mientras* el `TARGET` no sea visible y después esperar a verlo).
- **Diálogo biométrico en Android**: desde la 3.5.14 (`BiometricGate`) armar la huella ya no la pide, así que tras el primer PIN queda armada y el bloqueo (~500 ms) y el modal de la wallet (~350 ms) abren solos el diálogo de huella encima del teclado. `tap_lock_pin.yaml` y `wallet_auth_pin.yaml` lo esperan y lo cancelan (`subflows/cancel_biometric_prompt.yaml`) para entrar por PIN; `type_pin.yaml` sigue cancelando cualquiera que salga tras teclear. Su botón se busca por `.*:id/button_negative`: en Samsung el diálogo no es de `com.android.systemui` sino de `com.samsung.android.biometrics.app.setting`.
- **Android**: `maestro --device emulator-5554 test .maestro` (con un simulador de iOS abierto a la vez, indica el dispositivo). La suite pasa contra el APK de release (R8). El quiz es lento en el emulador: unos 50 s por pregunta.
- **Modales con tarjeta `Pressable`**: llevan `accessible={false}` en el fondo y en la tarjeta. Si no, iOS funde todos los hijos en un solo elemento y ni VoiceOver ni Maestro llegan a los controles.
