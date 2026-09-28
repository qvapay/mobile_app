import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { ROUTES } from '../../../routes'
import type { RootStackParamList } from '../../../types/navigation'

/**
 * Cierre común de crear (quiz de backup pasado) e importar. Con sesión se
 * vuelve a donde se entró (tab Crypto): `popToTop`. Sin sesión el stack nació
 * en Welcome y `popToTop` devolvería ahí, así que se entra en el modo wallet
 * como raíz — la reconciliación de useAppNavigation no lo hace sola a
 * propósito (no reacciona a `hasWallet` para no cortar el quiz a medias).
 *
 * @param navigation - Navigation del stack raíz.
 * @param isAuthenticated - Sesión QvaPay activa.
 */
export const finishWalletSetup = (navigation: Pick<NativeStackNavigationProp<RootStackParamList>, 'popToTop' | 'reset'>, isAuthenticated: boolean) => {
	if (isAuthenticated) { navigation.popToTop(); return }
	navigation.reset({ index: 0, routes: [{ name: ROUTES.WALLET_ONLY }] })
}
