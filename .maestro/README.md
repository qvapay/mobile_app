# E2E con Maestro

Flujos de extremo a extremo sobre el simulador de iOS o el emulador de Android, con la app en dev (Metro corriendo).

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
| 02_asset_guest | Activo TRON: invitación en lugar del historial; sin swap ni energía; con explorador |
| 03_receive | Recibir sin cuenta |
| 04_security_back | Seguridad abre el panel de la wallet como raíz y su "volver" regresa |
| 05_cold_start_lock | Arranque en frío con wallet y sin sesión → bloqueo con PIN → WalletOnly |
| 06_signin_opens_login | "Iniciar sesión" abre Login encima |
| 07_delete_wallet | Borrar la wallet (PIN + confirmación) → Welcome |
| 08_import_wallet | Importar "abandon … about" → dirección ETH determinista `0x9858EfFD…EcaEda94` |
| 09_abandoned_backup | Alta a medias → Welcome "Abrir mi wallet" → retomar el backup pasa por el PIN |

Los flujos 02 a 07 dependen del estado que deja el 01 (`executionOrder` en `config.yaml`); el 08 y el 09 arrancan en limpio.

## Reglas para escribir flujos

- **Seleccionar por `testID`**, nunca por texto: la app sigue el idioma del dispositivo (es/en/pt-BR). `QPButton`, `QPActionTile` y `QPPressable` reenvían `testID`.
- **`subflows/fresh_start.yaml`** borra los datos **y el Keychain** de la app, así que se pierden la sesión, la seed y el PIN del simulador.
- **PIN dígito a dígito** (`subflows/type_pin.yaml`): `QPCodeInput` salta de caja en cada carácter y un `inputText` de golpe pierde dígitos.
- **Volver**: en iOS no existe `back`. `subflows/header_back.yaml` toca la flecha nativa por su etiqueta (el nombre de la ruta anterior, porque los títulos van vacíos) *mientras siga visible*. Un toque que coincide con la reconfiguración del header (refresco de saldos) se pierde, y `retryTapIfNoChange` no lo detecta porque el precio en pantalla sí cambió.
- **Toast de LogBox en dev** ("Open debugger to view warnings"): tapa los botones del pie. `subflows/dismiss_logbox.yaml` lo cierra.
- **Modales con tarjeta `Pressable`**: llevan `accessible={false}` en el fondo y en la tarjeta. Si no, iOS funde todos los hijos en un solo elemento y ni VoiceOver ni Maestro llegan a los controles.
