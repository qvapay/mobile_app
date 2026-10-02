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
| 01_create_wallet | Welcome → "Solo quiero una wallet" → PIN (con un fallo de confirmación) → seed → quiz → WalletOnly sin swap/P2P y con la tarjeta de cuenta |
| 02_asset_guest | Activo TRON: con actividad (historial público); sin swap ni energía; con explorador |
| 03_receive | Recibir sin cuenta |
| 04_security_back | Seguridad abre el panel de la wallet como raíz y su "volver" regresa |
| 05_cold_start_lock | Arranque en frío con wallet y sin sesión → bloqueo con PIN → WalletOnly |
| 06_signin_opens_login | "Iniciar sesión" abre Login encima |
| 07_delete_wallet | Borrar la wallet (PIN + confirmación) → Welcome |
| 08_import_wallet | Importar "abandon … about" → dirección ETH determinista `0x9858EfFD…EcaEda94` |
| 09_abandoned_backup | Alta a medias → Welcome "Abrir mi wallet" → retomar el backup pasa por el PIN |
| 10_staking | Importar "abandon … about" → Ganar → SOL: aviso de riesgos (bloqueado sin marcar), mínimo de 1 SOL visible y con Continuar deshabilitado, selector con los 3 validadores y su APY medido, confirmación preparada contra mainnet (NUNCA firma) → TRX: aviso propio, SR con APY, saldo insuficiente |

Los flujos 02 a 07 dependen del estado que deja el 01 (`executionOrder` en `config.yaml`); el 08, el 09 y el 10 arrancan en limpio.

## Reglas para escribir flujos

- **Seleccionar por `testID`**, nunca por texto: la app sigue el idioma del dispositivo (es/en/pt-BR). `QPButton`, `QPActionTile` y `QPPressable` reenvían `testID`.
- **`subflows/fresh_start.yaml`** borra los datos **y el Keychain** de la app, así que se pierden la sesión, la seed y el PIN del simulador.
- **PIN dígito a dígito** (`subflows/type_pin.yaml`): `QPCodeInput` salta de caja en cada carácter y un `inputText` de golpe pierde dígitos.
- **Volver**: en iOS no existe `back`. `subflows/header_back.yaml` toca la flecha nativa por su etiqueta (el nombre de la ruta anterior, porque los títulos van vacíos) *mientras siga visible*. Un toque que coincide con la reconfiguración del header (refresco de saldos) se pierde, y `retryTapIfNoChange` no lo detecta porque el precio en pantalla sí cambió.
- **Toast de LogBox en dev** ("Open debugger to view warnings"): tapa los botones del pie. `subflows/dismiss_logbox.yaml` lo cierra.
- **Scroll**: no se usa `scrollUntilVisible`. En Android es inestable en las dos direcciones: con el scroll al final o al principio no reconoce elementos que están en pantalla, y `centerElement` agota el tiempo en los extremos. Se usan `subflows/scroll_down_to.yaml` y `scroll_up_to.yaml` (scroll *mientras* el `TARGET` no sea visible y después esperar a verlo).
- **Diálogo biométrico en Android**: guardar el marcador biométrico con huella la pide ya al escribirlo (en iOS no). `type_pin.yaml` lo cancela si aparece tras teclear un PIN.
- **Android**: `maestro --device emulator-5554 test .maestro` (con un simulador de iOS abierto a la vez, indica el dispositivo). La suite pasa contra el APK de release (R8). El quiz es lento en el emulador: unos 50 s por pregunta.
- **Modales con tarjeta `Pressable`**: llevan `accessible={false}` en el fondo y en la tarjeta. Si no, iOS funde todos los hijos en un solo elemento y ni VoiceOver ni Maestro llegan a los controles.
