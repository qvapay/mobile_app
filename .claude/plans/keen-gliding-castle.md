# Plan: Cambiar foto de perfil desde Ajustes

## Contexto

Los usuarios no pueden cambiar su foto de perfil desde la app. El backend ya tiene el endpoint `POST /api/user/avatar` funcionando (acepta FormData con `file` + `type: 'avatar'`, procesa con sharp a 128x128 WebP, sube a S3). Solo falta la UI y el glue code en el móvil.

No hay librería de image picker instalada. La app usa `react-native-vision-camera` para KYC (solo cámara), pero para seleccionar de galería necesitamos `react-native-image-picker`.

---

## Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| `package.json` | Instalar `react-native-image-picker` |
| `api/userApi.js` | Agregar función `uploadAvatar()` |
| `ui/ProfileContainer.jsx` | Agregar icono lápiz + prop `onEditAvatar` |
| `screens/settings/SettingsMenu.jsx` | Lógica de selección de imagen, permisos, upload, modal |

---

## 1. Instalar `react-native-image-picker`

```bash
npm install react-native-image-picker
cd ios && pod install
```

Permisos iOS ya configurados en Info.plist (Vision Camera ya los usa):
- `NSCameraUsageDescription`
- `NSPhotoLibraryUsageDescription`

Android: `react-native-image-picker` maneja permisos automáticamente.

---

## 2. Agregar `uploadAvatar` en `api/userApi.js`

Siguiendo el patrón existente de `uploadKYCPicture`:

```javascript
uploadAvatar: async ({ file }) => {
    const formData = new FormData()
    formData.append('file', {
        uri: file.uri,
        name: file.name || 'avatar.jpg',
        type: file.type || 'image/jpeg'
    })
    formData.append('type', 'avatar')
    const config = { headers: { 'Content-Type': 'multipart/form-data' } }
    const response = await apiClient.post('/user/avatar', formData, config)
    return { success: true, data: response.data }
}
```

El backend responde: `{ result: 'OK', data: { url, path } }` donde `path` es lo que va en `user.image`.

---

## 3. Modificar `ui/ProfileContainer.jsx`

Agregar prop opcional `onEditAvatar`. Cuando está presente:
- Envolver el `QPAvatar` en un `Pressable`
- Superponer un icono de lápiz (FontAwesome6 `pen`) en un círculo pequeño, posicionado abajo-derecha del avatar
- Al tocar, llama `onEditAvatar()`

```jsx
<Pressable onPress={onEditAvatar} disabled={!onEditAvatar}>
    <View style={{ position: 'relative' }}>
        <QPAvatar size={120} user={user} />
        {onEditAvatar && (
            <View style={editBadgeStyle}>
                <FontAwesome6 name="pen" size={12} color="#fff" iconStyle="solid" />
            </View>
        )}
    </View>
</Pressable>
```

El badge: círculo de ~28px, `backgroundColor: theme.colors.primary`, `position: 'absolute'`, `bottom: 4, right: 4`.

---

## 4. Lógica en `screens/settings/SettingsMenu.jsx`

Al tocar el lápiz del avatar:
1. Mostrar un `ActionSheet` (Alert en Android, ActionSheetIOS en iOS) con 3 opciones:
   - "Tomar foto"
   - "Elegir de galería"
   - "Cancelar"
2. Según la opción, llamar `launchCamera()` o `launchImageLibrary()` de `react-native-image-picker`
3. Si el usuario selecciona imagen:
   - Mostrar estado de carga (loader sobre el avatar o Toast)
   - Llamar `userApi.uploadAvatar({ file: { uri, type, name } })`
   - Si éxito: llamar `updateUser({ image: response.data.path })` del AuthContext
   - Toast de éxito/error
4. El `FastImage` en QPAvatar se actualiza automáticamente porque `user.image` cambia en el contexto

Opciones de `react-native-image-picker`:
```javascript
{
    mediaType: 'photo',
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.8,
    includeBase64: false,
}
```

---

## 5. Verificación

1. `npm install react-native-image-picker && cd ios && pod install`
2. Rebuild iOS y Android
3. Ir a Ajustes → ver icono de lápiz sobre el avatar
4. Tocar → ver ActionSheet con "Tomar foto" / "Elegir de galería"
5. Tomar foto → se sube, avatar se actualiza
6. Elegir de galería → se sube, avatar se actualiza
7. Verificar que el avatar nuevo se ve en Home (header) y en Ajustes
8. Probar denegar permisos de cámara → mensaje apropiado
