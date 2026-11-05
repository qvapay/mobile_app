import { codegenNativeComponent, type CodegenTypes, type ViewProps } from 'react-native'

/**
 * Spec de codegen de `QPBlurView` (iOS): desenfoque del sistema
 * (`UIVisualEffectView`) de lo que hay DETRÁS de la vista. Es una hoja: no
 * monta hijos, se usa de fondo a tamaño completo dentro de un contenedor
 * recortado (ver `ui/GlassSurface`).
 *
 * `blurStyle` es explícito porque el tema de la app no sigue al del sistema:
 * un material adaptativo saldría claro en una app en oscuro.
 */
export interface NativeProps extends ViewProps {
	blurStyle?: CodegenTypes.WithDefault<'light' | 'dark', 'dark'>
}

export default codegenNativeComponent<NativeProps>('QPBlurView')
