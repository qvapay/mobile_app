# Plan: Custom Pull-to-Refresh — Top Edge Glow

## Contexto

Las 11 pantallas con pull-to-refresh usan el `RefreshControl` nativo de React Native, que muestra un spinner genérico que desplaza el contenido. Se reemplazará con un indicador custom: un **glow de color primario** (~50px) que emana del borde superior de la pantalla y pulsa en opacidad. Usa Reanimated v4 + LinearGradient (ambos ya instalados).

---

## Archivos

| Archivo | Acción |
|---------|--------|
| `ui/QPRefreshIndicator.jsx` | **CREAR** — Componente del glow + helper `createHiddenRefreshControl` |
| `screens/home/Home.jsx` | Migrar |
| `screens/p2p/P2P.jsx` | Migrar (Animated.FlatList) |
| `screens/p2p/P2POffer.jsx` | Migrar (dentro de KeyboardAvoidingView) |
| `screens/transaction/Transaction.jsx` | Migrar |
| `screens/store/Store.jsx` | Migrar |
| `screens/store/MyPurchases.jsx` | Migrar (FlatList) |
| `screens/store/PurchaseDetail.jsx` | Migrar |
| `screens/store/PhoneTopupIndex.jsx` | Migrar |
| `screens/store/GiftCards.jsx` | Migrar |
| `screens/settings/subpanels/Referals.jsx` | Migrar + envolver en View (ScrollView es root) |
| `screens/settings/subpanels/Contacts.jsx` | Migrar |

---

## 1. Crear `ui/QPRefreshIndicator.jsx`

### Exports

1. **`QPRefreshIndicator`** (default) — Componente visual del glow
2. **`createHiddenRefreshControl(refreshing, onRefresh)`** — Helper que retorna un `<RefreshControl>` invisible (mantiene el gesto nativo, oculta el spinner)

### QPRefreshIndicator — Props

- `refreshing` (boolean) — controla visibilidad y animaciones

### Animación del glow

- **Fade in**: `withTiming(1, { duration: 200 })` cuando `refreshing=true`
- **Pulso**: `withRepeat(withSequence(withTiming(0.6), withTiming(0.15)), -1, true)` — opacidad pulsa entre 0.15 y 0.6
- **Fade out**: `withTiming(0, { duration: 300 })` cuando `refreshing=false`, luego `cancelAnimation`
- **Dark vs Light**: glow alpha más intenso en dark (`'50'`/`'15'`) vs light (`'30'`/`'08'`)

### Visual

```
position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000
```

Un `LinearGradient` vertical de ~50px:
- `colors={[primaryColor + alpha, primaryColor + alphaLow, 'transparent']}`
- `start={{ x: 0.5, y: 0 }}`, `end={{ x: 0.5, y: 1 }}`

### createHiddenRefreshControl

```jsx
export const createHiddenRefreshControl = (refreshing, onRefresh) => (
    <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor="transparent"
        title=""
        titleColor="transparent"
        colors={['transparent']}
        progressBackgroundColor="transparent"
    />
)
```

---

## 2. Migrar 11 pantallas

### Patrón estándar (10 de 11 pantallas)

Todas tienen un `<View style={containerStyles.subContainer}>` como padre del ScrollView/FlatList.

**ANTES:**
```jsx
import { ..., RefreshControl } from 'react-native'
// ...
<View style={containerStyles.subContainer}>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} ... />}>
```

**DESPUÉS:**
```jsx
import { ... } from 'react-native'  // quitar RefreshControl
import QPRefreshIndicator, { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'
// ...
<View style={containerStyles.subContainer}>
    <QPRefreshIndicator refreshing={refreshing} />
    <ScrollView refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}>
```

### Cambios por pantalla

| # | Pantalla | Container | Cambios específicos |
|---|----------|-----------|-------------------|
| 1 | `Home.jsx` | ScrollView | Estándar. Quitar `key={refresh-...}` del RefreshControl. |
| 2 | `Transaction.jsx` | ScrollView | Estándar. |
| 3 | `Store.jsx` | ScrollView | Estándar. |
| 4 | `PurchaseDetail.jsx` | ScrollView | Estándar. |
| 5 | `PhoneTopupIndex.jsx` | ScrollView | Estándar. |
| 6 | `GiftCards.jsx` | ScrollView | Estándar. |
| 7 | `Contacts.jsx` | ScrollView | Estándar. |
| 8 | `MyPurchases.jsx` | FlatList | Estándar (FlatList acepta `refreshControl` igual). |
| 9 | `P2P.jsx` | Animated.FlatList | Estándar. `QPRefreshIndicator` va justo dentro del `<View style={containerStyles.subContainer}>`, antes del bloque `{p2pEnabled ? ...}`. |
| 10 | `P2POffer.jsx` | ScrollView en KAV | `QPRefreshIndicator` va dentro de `<View style={containerStyles.subContainer}>`, antes del `<KeyboardAvoidingView>`. Quitar props `title`/`titleColor`. |
| 11 | `Referals.jsx` | ScrollView **ES** root | Envolver en `<View style={containerStyles.subContainer}>`, cambiar ScrollView a `style={{ flex: 1 }}`. |

---

## 3. Verificación

1. Compilar iOS y Android
2. En **Home**: pull-to-refresh → ver glow púrpura pulsando en el borde superior, sin spinner nativo
3. En **P2P**: pull-to-refresh en la lista → mismo glow
4. En **P2POffer**: pull-to-refresh con teclado abierto → glow visible
5. Probar en **light mode**: glow más sutil pero visible
6. Verificar que el gesto pull-to-refresh sigue funcionando en todas las 11 pantallas
7. Verificar que `refreshing=false` hace fade out del glow correctamente
