import { codegenNativeComponent, type ViewProps } from 'react-native'

/**
 * Spec de codegen de `QPSecureView` (iOS). Sin props propias: solo envuelve
 * hijos — pero codegen exige una interface que extienda ViewProps.
 */
export interface NativeProps extends ViewProps {}

export default codegenNativeComponent<NativeProps>('QPSecureView')
