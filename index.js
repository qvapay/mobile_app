import './polyfills'
import { AppRegistry } from 'react-native'
import { registerPushBackgroundHandler } from './push/background'
import App from './App'
import { name as appName } from './app.json'

// Android: handler de FCM en segundo plano, ANTES de registrar el componente
registerPushBackgroundHandler()

AppRegistry.registerComponent(appName, () => App)
