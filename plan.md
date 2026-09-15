# plan.md — QvaPay Crypto Wallet (self-custody) · Guía de continuación

Branch: **`crypto`**. Leer `CLAUDE.md` antes de tocar nada (React Query, i18n es/en/pt, Keychain, tipos en `types/`, tests node). Este archivo es el estado real del proyecto wallet + lo que falta, para retomar en cualquier equipo.

## Setup en un equipo nuevo

```bash
git checkout crypto
npm install                # Node >= 22.11
npm run pods               # iOS (la 1ª vez puede pedir: pod install --repo-update)
npm run typecheck && npm test && npm run lint && npm run i18n:check && npm run i18n:usage
npx jest wallet/           # 72 tests: router, nodos custom, derivación, quiz, adaptadores de saldo, catálogo de activos
```

- Android necesita SDK (`ANDROID_HOME` o `android/local.properties` con `sdk.dir=...`, gitignorado). **El build Android aún no se ha validado con quick-crypto** — primera cosa a comprobar en un equipo con SDK: `cd android && ./gradlew assembleDebug`.
- `config.ts`: la IP dev del backend (`10.0.0.239:3000`) puede necesitar ajuste por máquina. Si no responde en 15s, el build debug cae solo a api.qvapay.com (`api/apiHost.ts`).
- El script `ios:build` apunta al simulador "iPhone 16"; con Xcode nuevo usar destino existente (iPhone 17/Air) o `-destination 'generic/platform=iOS Simulator'`.

## Estado: qué está HECHO (commits `2e843b7..ecd1ed3`)

- **Fase 0** — Tab Invest → **Crypto**: ruta `ROUTES.CRYPTO_SCREEN`, deep link `/crypto`, `screens/crypto/`, `cryptoQueries` (raíz RQ `['crypto']`), i18n `crypto.*`. Flag de rollout: `hooks/useSelfCustodyFlag.ts` = ajuste local `crypto.selfCustody` (SettingsContext, default off) OR `features.self_custody` de `/user/extended` (el backend aún no lo manda). En `__DEV__` la sección Nodos ya es visible sin flag.
- **Fase 0.5** — Stack cripto instalado: `react-native-quick-crypto` (única nativa; **build iOS validado**, BUILD SUCCEEDED), `@scure/bip39+bip32`, `@noble/curves+hashes`, `viem`, `@scure/btc-signer`, `bs58`. **`polyfills.ts` es el PRIMER import de `index.js`** (global.crypto + Buffer; en dev revienta si falta). `jest.config.js` ya transforma el stack ESM (`@scure|@noble|viem|abitype|ox|micro-packed`).
- **Fase 1** — `wallet/registry/`: `types.ts`, `bundled.json` (v4, 6 cadenas: ethereum/bsc/polygon/base/tron/bitcoin; **ninguna URL de RPC vive fuera de este archivo, salvo las que el usuario añade a mano en Ajustes → Nodos**), `rpcRouter.ts` PURO (prioridad → salud → latencia, breaker 3 fallos/2min, rota solo errores de infraestructura; deps inyectadas), `useRegistry.ts` (RQ `['wallet','registry']`, TTL 1h, remoto gana solo si `version >= bundled`), `appRpcRouter.ts` (singleton, salud en `@qpwallet:rpc-health`, `useAppRpcRouter`). Pantalla **Ajustes → Avanzado → Nodos** (`screens/settings/subpanels/RpcNodes.tsx`). Repo espejo en `~/webs/rpc-registry` (registry.json + schema.json + `scripts/check.mjs` + CI).
- **Fase 2** — Llaves: `wallet/seed.ts` (BIP-39, 12 palabras, quiz), `wallet/derive.ts` (EVM `m/44'/60'/0'/0/0` compartida ETH/BSC/Base, TRON `m/44'/195'/0'/0/0`, BTC `m/84'/0'/0'/0/0`; **vectores de la frase "abandon…about" fijados por test** en `wallet/derive.test.js` — interop Trust/MetaMask garantizada), `wallet/keystore.ts` (Keychain `com.qvapay.wallet`), `wallet/WalletContext.tsx` (bajo AuthProvider; probe de RPCs cada 10 min con wallet), `api/walletApi.ts` (solo `POST /wallet/addresses`, best-effort). Pantallas: `screens/crypto/wallet/` — WalletOnboarding, WalletBackup (crea/retoma + 12 palabras + quiz; **Backup y Verify van fusionadas para que el mnemonic no viaje por params**), WalletImport, WalletCard (en `Crypto.tsx` detrás del flag).

## Reglas duras (threat model — NO negociables)

1. La seed NUNCA sale del dispositivo. Ningún endpoint recibe llaves ni firmas.
2. `com.qvapay.wallet` va **SIN access control biométrico a nivel Keychain** y **ningún catch borra la entrada** — el patrón de `getBiometricCredentials` (api/client.ts) auto-borra al re-enrolar huellas: con una seed = pérdida de fondos. El gate biométrico/PIN es de capa de app (AppLockContext/usePinEntry) antes de leer la seed.
3. El logout NO borra la seed (`clearAuthData` no toca `com.qvapay.wallet`). Solo el flujo explícito "Eliminar wallet".
4. El mnemonic no viaja por params de navegación ni por contexts: vive en estado local de la pantalla que lo usa.
5. Saldos en RQ con `meta: { noPersist: true }` (el persister `@qpquery:v1` escribe AsyncStorage sin cifrar). El registry sí puede persistir. **Excepción (2026-09-14, decisión del usuario): el HISTORIAL sí va a disco** (`@qpwallet:history:<asset>:<address>`, `screens/crypto/wallet/historyCache.ts`): es público en la cadena y las direcciones ya están en disco; sirve de ancla para sincronizar solo lo nuevo (`wallet/historyMerge.ts`). Eliminar la wallet lo borra.
6. La app decodifica y muestra lo que va a firmar ANTES de firmar (TRON: verificar protobuf `raw_data` + recomputar `txID = sha256(raw_data)`).
7. Ningún log de seeds/llaves/payloads firmados; Sentry `beforeSend` debe filtrar `mnemonic|privateKey|seed` (pendiente de configurar cuando se toque Sentry).

## Pendientes INMEDIATOS (no código de fases)

- [ ] **Validar en device**: crear wallet, importar la frase en Trust Wallet → mismas direcciones (aceptación Fase 2 en vivo; los vectores ya lo fijan por test).
- [x] **`qvapay/rpc-registry` publicado** (v4, 120 RPCs públicos verificados, 6 cadenas con Polygon). La app lee SOLO GitHub raw; `bundled.json` va sincronizado al v4 (2026-09-09).
- [ ] **Espejo `https://rpc.qvapay.com/registry.json`** — APLAZADO a propósito: por ahora solo nodos públicos + nodos custom del usuario. Cuando se monte (Cloudflare Pages), va PRIMERO en `REGISTRY_URLS` de `wallet/registry/useRegistry.ts` (se quitó del array porque, caído, costaba el timeout de 5s en cada refresh).
- [x] **Nodos custom del usuario** (2026-09-09): `wallet/registry/customRpcs.ts` (puro: validar/normalizar https, mapa inmutable, `applyCustomRpcs` los pone delante con `owner: 'user'` y priority -1, por debajo del 0 de qvapay), ajuste `crypto.customRpcs` en SettingsContext, `useEffectiveRegistry` en `appRpcRouter.ts` (remoto/bundled + custom — es lo que consumen router y pantalla; `useRegistry` a pelo ya no se usa desde UI) y alta/baja en Ajustes → Nodos (`RpcNodeAddModal`: se prueba contra el nodo con `probeRpc` ANTES de guardar; tope 5 por cadena). `WalletProvider` monta `useAppRpcRouter` para que el singleton siga el registro efectivo toda la sesión (antes solo lo enganchaba la pantalla Nodos: la wallet hablaba con el bundled hasta abrirla).
- [x] **Huecos de seguridad de Fase 2** (2026-09-14): retomar un backup pasa por el gate PIN/biometría (`WalletAuthModal`), y Ajustes → Avanzado → **Mi wallet** (`subpanels/WalletSettings.tsx`, también desde "Seguridad" en la home de la wallet): direcciones, ver frase (gate + se oculta a los 60s y al ir a background) y eliminar wallet (gate + reconocer que se tiene la frase; borra seed, metadata y queries `['wallet']`).
- [x] **Bloqueo de capturas** (2026-09-15): `react-native-screenshot-prevent` 1.2.2 + `hooks/useSecureScreen` en WalletBackup (mientras hay palabras), WalletSettings (frase revelada) y WalletImport. Android: FLAG_SECURE; iOS: captura/grabación en negro por el campo seguro oculto + difuminado en el selector de apps. Requiere rebuild nativo (pod install hecho).
- [ ] **Validar build Android** en equipo con SDK (quick-crypto compiló solo en iOS).
- [ ] **qpweb: `POST /wallet/addresses` + `GET /wallet/history`** — CÓDIGO HECHO en qpweb (2026-09-12, sin commit): `app/api/wallet/{addresses,history}`, `scripts/wallet/history/` (Etherscan V2 / TronGrid / Esplora, caché Redis 30s, ArcJet 30/min), modelo `UserWallet`. Falta: aplicar `prisma/migrations/user-wallets-2026-09-12.sql`, env `ETHERSCAN_API_KEY` (obligatoria EVM; verificar que el plan cubre BSC/Base) + `TRONGRID_API_KEY`, deploy. **Decidido 2026-09-15**: la wallet non-custodial NO exige KYC — `/api/wallet/` está en `KYC_EXEMPT_API_PREFIXES` de qpweb (`lib/onboarding-gate.js`). `ETHERSCAN_API_KEY` y `ANKR_API_KEY` ya están en Vercel. El móvil registra direcciones una vez por cuenta+sesión (WalletContext) y el historial cae a "ver en explorador" con 404/503.
- [ ] Backend: mandar `features.self_custody` en `/user/extended` para el rollout remoto del flag.

## Fase 3 — Receive + balances + histórico (ACEPTADA en device 2026-09-12: 1 USDT TRC-20 recibido y visible, tx 59a57a6e…f9a97f)

**Hecho** (decisiones del usuario: solo lectura + Recibir, Enviar visible "próximamente"; historial por proxy qpweb; lista base + gestionar; mercado P2P a botón del header del tab P2P):
- `wallet/chains/` PURO: `http.ts` (errores con `status`/`retryable` que entiende el router; 429 rota), `evm.ts` (eth_getBalance + balanceOf por eth_call, sin viem), `tron.ts` (dialecto HTTP TronGrid y jsonrpc; base58check↔hex20), `btc.ts` (Esplora confirmado+mempool), `units.ts` (bigint exacto), `index.ts` (`fetchAllBalances`: una llamada de router por cadena, una cadena caída conserva su saldo previo). Verificado EN VIVO contra las 6 cadenas del bundled.
- `wallet/assets.ts` PURO: activo = moneda EN una red (id `chain:native|chain:contract`), `DEFAULT_ASSETS` (USDT-TRON, USDT-BSC, BTC, ETH, ETH-Base, BNB, TRX), ticks QvaPay de precio/logo (BNB=BNBBSC, POL=MATICMAINNET), visibilidad (prefs `crypto.visibleAssets` > base > con saldo), orden por USD, URLs de explorador.
- `screens/crypto/wallet/walletQueries.ts`: `['wallet','balances',…]` (30s + refetchInterval solo enfocada + foreground, noPersist), `['wallet','history',assetId,address]` infinita noPersist (auto-pagina páginas vacías con cursor), precios de `['coins','all']`.
- UI: `WalletHome` (tab Crypto: total + Enviar/Recibir/P2P + lista + Gestionar; explorador de precios al final; card P2P fuera), `WalletAsset` (detalle + actividad → explorador), `WalletReceive` (selector → QR + aviso de red; EVM avisa que la dirección es compartida), `WalletManageAssets` (switch por activo agrupado por red), `P2PMarketModal` en el tab P2P. Quiz de backup: 4 preguntas, baraja con entropía segura (`seed.ts` `buildQuiz`).
- Bug arreglado de paso: `probeRpc` añadía `/jsonrpc` a nodos TRON que ya lo traían (los marcaba caídos).

**Pendiente de Fase 3**: histórico real cuando qpweb despliegue; revisar a ojo el header del P2P en Android pequeño (3 iconos + switch centrado, `headerSwitchWidth`); ETH interno (txlistinternal) no sale en el historial EVM.

Plan original (referencia):
- `wallet/chains/index.ts`: interfaz `ChainAdapter` + factory por `kind` del registry.
- `wallet/chains/evm.ts` (viem con transporte custom sobre `router.call(chainKey, fn)`): balance nativo (`eth_getBalance`), `balanceOf` ERC-20 de los tokens del registry, histórico por `getLogs` de `Transfer` (topic con la address, ventanas de bloques).
- `wallet/chains/tron.ts` (HTTP TronGrid-style vía fetch + router): `/wallet/getaccount` (TRX), `triggerconstantcontract` balanceOf USDT, histórico `/v1/accounts/{addr}/transactions/trc20`.
- `wallet/chains/btc.ts` (esplora vía router): `/address/{addr}` (balance por `chain_stats`), `/address/{addr}/txs`, fee estimates `/fee-estimates`.
- `screens/crypto/wallet/walletQueries.ts`: `['wallet','balances']` staleTime 30s + refetch al foreground; `['wallet','history',chain]` infinita `meta:{noPersist:true}`; precios USD desde `['coins']` existente (`useCoins`/`coinsApi`) — mapear tick↔chainKey.
- `Receive.tsx`: QR por cadena (`react-native-qrcode-styled`, patrón de `screens/add/DepositDetailsModal`), selector de red, copy con aviso de red correcta.
- WalletCard: pasar de direcciones a total USD + tokens.
- Tests node de mapeos (respuesta RPC → balance decimal con `decimals` del registry) con fixtures.
- **Aceptación**: enviar 1 USDT TRC-20 desde otra wallet → visible en < 60s.

## Fase 4 — Send (TRON USDT primero, luego BSC/ETH/Base, BTC al final)

**Tanda 1 — TRON (ACEPTADA en device 2026-09-14: 5 USDT TRC-20 enviados desde la app, tx 8d69b99e…5178)**. Decisiones del usuario: solo TRON primero; gate = PIN de Ajustes → Bloqueo + Face ID/Touch ID (sin PIN de bloqueo, el primer envío pide crearlo).
- `wallet/tron/protobuf.ts` (PURO): lector/escritor protobuf mínimo (varint + length-delimited), sin protobufjs ni .proto.
- `wallet/tron/tx.ts` (PURO): el nodo construye (`createtransaction` TRX / `triggersmartcontract` TRC-20), la app DECODIFICA `raw_data_hex`, comprueba owner/destino/cantidad/contrato/fee_limit y recalcula `txID = sha256(raw)` (`verifyTronTransaction`, regla 6) — un nodo que devuelva otra tx no se firma. Firma `r‖s‖(27+rec)` sobre el txID sin re-hash (convención verificada contra la firma real del depósito 59a57a6e…, fixture en `tron.test.js`). Broadcast por `/wallet/broadcasthex` con la envoltura `Transaction{raw,signature}` codificada aquí (bytes idénticos a los firmados). Fee: energía estimada con `triggerconstantcontract` × `getEnergyFee` (hoy 100 sun) + ancho de banda si no queda gratis + 1 TRX si activa cuenta; `fee_limit` = energía·1.3 con suelo 5 TRX y tope 100 TRX. `DUP_TRANSACTION_ERROR` = éxito; solo `SERVER_BUSY` rota de nodo. Los nodos `api: 'jsonrpc'` quedan fuera (`router.call(..., { accept })`).
- UI: `WalletSend` (selector → destino con pegar/escanear + cantidad con MAX; MAX de TRX reserva 1.4 TRX para gas), `WalletSendConfirm` (lo mostrado sale del raw VERIFICADO; bloquea sin TRX para la quema; `WalletAuthModal` PIN/biometría; firma en `walletSendActions.ts`, el ÚNICO sitio que lee la seed, y la descarta; re-difunde la MISMA tx firmada si la red falló y sigue vigente, reconstruye si expiró), `WalletSendSuccess`. `parseQRData` reconoce direcciones sueltas TRON/EVM/BTC (`bitcoin:` BIP-21 sigue en null) y el Scan vuelve a WalletSend por params.

**Tanda 2 — EVM (ACEPTADA en device 2026-09-14: 9 USDT BEP-20 enviados desde la app, tx 0x2fd3f0e3…786f, fee 0.0000516 BNB)**: ETH/BNB/POL y USDT/USDC en Ethereum, BNB Chain, Base y Polygon.
- `wallet/evm/tx.ts` (PURO, viem): la app construye la tx entera — nonce `pending`, `eth_estimateGas` +25% en tokens (tope 300k), EIP-1559 si el bloque trae `baseFeePerGas` (`maxFee = 2·base + priority`, prioridad mínima 1 gwei) o legacy `gasPrice`. Firma con viem y VERIFICA parseando la tx firmada (chainId/to/value/calldata/gas) y recuperando el firmante (regla 6). Broadcast `eth_sendRawTransaction`: "already known" = duplicado OK; "nonce too low" se confirma buscando el hash antes de darla por fallida. Direcciones con checksum EIP-55 si vienen mezcladas.
- `walletSendActions.ts` común a TRON/EVM: `PreparedSend` con `SendSummary` (cantidad verificada, fee estimada y máxima en el nativo, activación, vigencia). `WalletSendConfirm` es genérica; en EVM exige tener el MÁXIMO autorizado de gas aunque luego cobre menos. MAX de nativo EVM reserva 21000 × maxFee × 1.2 leído del nodo.
- Historial EVM en qpweb: Etherscan gratis cubre Ethereum y Polygon; **Base → Blockscout** (sin clave) y **BNB Chain → Ankr Advanced API** (`ANKR_API_KEY`, verificado en vivo 2026-09-14). Moralis descartado por precio.

**Tanda 3 — Bitcoin (ACEPTADA en device 2026-09-15: 64 900 sats enviados desde la app, 1 input / 2 outputs, fee 141 sats = exactamente la estimada, tx b03a2e86…3f75)**: `wallet/btc/tx.ts` (PURO, @scure/btc-signer): UTXOs y `fee-estimates` de Esplora (objetivo 3 bloques, mínimo 1 sat/vB), selección grandes-primero (confirmados antes) con fee por vbytes estimados, cambio a la propia dirección si supera el polvo (546 sats), **MAX = enviar todo** (fee descontada del envío, sin cambio), RBF, tope de fee 0.005 BTC. Tras firmar se re-parsea la tx y se comprueban salidas (scriptPubKey del destino y del cambio) y fee exactas (regla 6). Broadcast `POST /tx` (tx ya conocida = éxito; fee baja = error no reintentable). Destinos válidos: bech32 (bc1q/bc1p), P2SH y legacy de mainnet. Verificado en mempool.space.

- `wallet/decode.ts`: tx sin firmar → `{ to, token, amount, fee }` legible. TRON: protobuf `raw_data` con protobufjs (proto vendorizado), verificar destino/monto/contrato, recomputar txID.
- `wallet/sign.ts`: `signEvmTx` (viem, `derivePrivateKey(seed,'evm')` leída del Keychain justo antes, no retener), `signTronTx`, `signBtcPsbt` (@scure/btc-signer, UTXO selection).
- Flujo: `Send` (dirección/QR/contacto) → `SendConfirm` (intención decodificada + fee) → gate PIN/biometría (AppLockContext/usePinEntry) → firma → broadcast vía router → `SendSuccess` → `TxDetail` con polling de confirmaciones.
- Extender `parseQRData` en `helpers.ts` (¡no duplicar parser!): direcciones pelas TRON/EVM/BTC, EIP-681; ojo: la rama `bitcoin:` sin `lightning=` hoy retorna null (helpers.ts:119-126).
- Validación local de destino: EIP-55, base58check TRON, bech32 BTC.
- Idempotencia local: hash de la tx firmada como clave; doble tap no difunde dos veces.
- Gas: TRON avisar "tienes USDT pero no TRX" (~13–28 TRX por transfer TRC-20); EVM bloquear sin nativo.
- **Aceptación**: USDT TRC-20 y BEP-20 reales enviados, confirmación en app y explorer.

## Fase 5 — Puente con saldo QvaPay (½ semana)

**ACEPTADA en device 2026-09-15** — round trip completo sin teclear direcciones: depósito BTC pagado desde Mi Wallet (tx b03a2e86…3f75) y retiro de 9 USDT desde "Desde tu saldo QvaPay" recibido en la wallet: `findAssetForCoin`/`findCoinForAsset` en `wallet/assets.ts` (moneda de `/coins/v2` ↔ activo por red+símbolo; BTCLN y redes sin wallet quedan fuera). "Pagar desde Mi Wallet" en `DepositDetailsModal` (solo con wallet respaldada y moneda con puente) → `WalletSendConfirm` con la dirección de depósito y el importe redondeado HACIA ARRIBA a los decimales del activo (`roundUpToDecimals`; el backend acredita solo el importe exacto). "Desde tu saldo QvaPay" en `WalletReceive` → `Withdraw` con `preselectedCoin` + `prefillAddress` (rellena el campo `Wallet` y marca destino 'personal'). Aceptación: round trip saldo → wallet → saldo sin teclear una dirección.

- "Pasar a saldo QvaPay": `useDepositOrder` (screens/add) genera la dirección de depósito → prefilar Send desde Mi Wallet en vez del deep link a Trust (`WalletPickerSheet` es el precedente).
- "Sacar a Mi Wallet": `Withdraw` con destino prellenado desde `WalletContext.addresses`.
- **Aceptación**: round trip saldo → wallet → saldo sin teclear una dirección.

## Stacks + QUSD (CÓDIGO HECHO 2026-09-15, falta aceptación en device)

QUSD es el token de QvaPay: SIP-010 en Stacks, contrato `SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD` (asset `…QUSD::QUSD`, 8 decimales, `transfer(amount, sender, recipient, memo?)`; repo `qvapay/QUSD`; TronDealer es el único que mintea/quema). **El contrato cambia esta semana (versión GENIUS)**: el identificador vive SOLO en el registry (`bundled.json` v5 y `qvapay/rpc-registry`) — se cambia ahí y las apps lo cogen en el próximo refresco (TTL 1 h) sin publicar versión; el historial de qpweb filtra por el identificador que manda la app.
- Registry: kind `stacks`, dialecto `hiro` (`https://api.hiro.so`, `api.mainnet.hiro.so`; nodo propio `stx.qvapay.com` registrado apagado), explorer `explorer.hiro.so`. Probe `GET /v2/info`. bundled pasa a **v5**: hay que publicar v5 en `qvapay/rpc-registry` (el remoto solo gana con `version >= bundled`).
- Derivación `m/44'/5757'/0'/0/0` (cuenta 0 de Leather/Xverse), c32check `SP…` vía `@stacks/transactions` (`getAddressFromPublicKey`); vector `abandon…about` → `SPC5KHM41H6WHAST7MWWDD807YSPRQKJ69FSH54J`. `WalletAddresses` gana `stx` y `stxPublicKey` (pública: la tx sin firmar la necesita y así se construye sin leer la seed); WalletContext re-deriva la metadata anterior a Stacks una vez.
- Saldos: `/extended/v1/address/{addr}/balances` (STX + tokens en una llamada). QUSD entra en la lista base (2.º), stable = $1; STX sin precio en el catálogo (no suma al total hasta que exista un tick STX).
- Enviar (`wallet/stacks/tx.ts`): nonce `/extended/v1/address/{addr}/nonces`, fee `POST /v2/fees/transaction` (3 estimaciones = Económico/Normal/Rápido, suelo 0.001 STX, tope 5 STX, 400 = default 0.003), STX por `makeUnsignedSTXTokenTransfer`, QUSD por `makeUnsignedContractCall` con **post-condición `deny` exacta**; tras firmar se re-parsea (payload, args, post-condición, nonce, fee). Broadcast `POST /v2/transactions`. Historial vía qpweb (`chain=stacks`, proveedor Hiro).
- Aceptación pendiente: recibir QUSD (mint desde QvaPay o desde Leather) y enviarlo desde la app; y STX. No hay coin STX/QUSD en `/coins/v2` todavía → sin puente "Pagar desde Mi Wallet" para Stacks hasta que exista.

## Fase 6 — Nodos propios (cuando la torre sincronice)

- Cloudflare Tunnel: `tron|bsc|eth|base|btc.qvapay.com` (btc = esplora/Electrs). Solo lectura + broadcast; nunca `personal_*`/`admin_*`/`debug_*`. Rate limit.
- Flip en `rpc-registry`: `enabled: true` en los `owner: "qvapay"` → verificar en Ajustes → Nodos que la app cambió sola (priority 0 gana en el próximo probe/refresh, TTL 1h).

## Fuera de alcance v1

Swap, on-ramp fiat, Solana, WalletConnect, cloud backup, indexer propio, multi-cuenta HD, delegación de energía TRON, Lightning self-custody.

## Checklist por PR

- Tests node (`@jest-environment node`) para todo `wallet/` (sin imports de RN salvo `keystore.ts`/`appRpcRouter.ts`)
- i18n en es/en/pt (dominio `crypto.json`); `npm run i18n:check` + `i18n:usage`
- Ninguna URL de RPC fuera de `wallet/registry/bundled.json`
- `npm run lint` (0 errores) + `typecheck` + `test` en verde
- Actualizar `CLAUDE.md` (y este plan.md) al cerrar cada fase


Flaws detectados:

Huecos en lo que ya está "hecho" (no están en plan.md)

1. Se puede ver la frase sin pedir PIN. Al retomar un backup pendiente, revealMnemonic() enseña las 12 palabras sin pasar por el bloqueo de la app (AppLockContext). Eso incumple la regla dura del plan.
2. No hay pantalla para eliminar la wallet ni para volver a ver la frase. deleteWallet existe en el contexto pero ninguna pantalla lo usa. Tampoco hay forma de ver la frase después de hacer el backup.
3. No se bloquean las capturas de pantalla en backup ni en importación (FLAG_SECURE en Android, desenfoque en el selector de apps de iOS).
4. Contador "/12" fijo en la importación, aunque se aceptan frases de 24 palabras.
5. Falta una decisión de producto: la wallet va con el teléfono, no con la cuenta. Si alguien entra con otra cuenta de QvaPay, ve la wallet del anterior. Además, las direcciones solo se registran al crear o importar, así que nunca quedan asociadas a esa segunda cuenta.

Pendientes del plan

- Validar en el dispositivo (bloques A–G) y la prueba con Trust Wallet.
- Build de Android: ahora el SDK está en este equipo (ANDROID_HOME está definido), así que ya se puede comprobar ./gradlew assembleDebug con quick-crypto.
- qpweb: POST /wallet/addresses no existe todavía: no hay app/api/wallet ni modelo UserWallet.
- qpweb: features.self_custody en /user/extended tampoco existe todavía.
- Filtro de Sentry para frases y llaves (beforeSend, regla 7): no hay nada configurado.
- Espejo rpc.qvapay.com: aplazado a propósito.
- Fase 3: adaptadores por cadena (EVM, TRON, BTC), consultas de saldos e histórico, pantalla Receive con QR, y la card con el total en USD. Se da por cerrada cuando 1 USDT TRC-20 aparece en menos de 60 s.
- Fase 4: enviar. Incluye mostrar lo que se va a firmar antes de firmar, firma tras PIN, validar la dirección de destino, avisar si falta TRX para el gas y evitar el doble envío. Primero USDT en TRON, luego BSC/ETH/Base y BTC al final.
- Fase 5: mover dinero entre el saldo QvaPay y la wallet, en los dos sentidos, sin teclear direcciones.
- Fase 6: usar nodos propios y activarlos desde rpc-registry.