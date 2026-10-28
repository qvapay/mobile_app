module.exports = {
    project: {
        ios: {},
        android: {},
    },
    assets: ['./assets/fonts', './assets/sounds'],
    // Push: Firebase solo en Android. En iOS el token APNs lo entrega el módulo
    // nativo propio QPPush (ios/QvaPay/QPPush.swift) y el backend manda a APNs
    // directo; React Native Firebase descarta en iOS toda notificación que no
    // venga de FCM, así que sus pods ni se enlazan (app más liviana, sin SDK de Google).
    dependencies: {
        '@react-native-firebase/app': { platforms: { ios: null } },
        '@react-native-firebase/messaging': { platforms: { ios: null } },
    },
};
