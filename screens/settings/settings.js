// Settings Items as an object of multiple dimensions:
const settings = {
    general: {
        title: 'GENERAL',
        options: [
            {
                title: 'Tema',
                screen: 'Theme',
                enabled: true,
                notifications: 0,
            },
        ],
    },
    account: {
        title: 'CUENTA',
        options: [
            {
                title: 'Datos personales',
                screen: 'Userdata',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Verificar Celular',
                screen: 'Phone',
                enabled: true,
                notifications: 0
            },
            {
                title: 'Verificar Telegram',
                screen: 'Telegram',
                enabled: true,
                notifications: 0
            },
        ],
    },
    security: {
        title: 'SEGURIDAD',
        options: [
            {
                title: 'Cambiar contraseña',
                screen: 'Password',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Autenticación de dos factores',
                screen: 'TwoFactorSettings',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'PIN de seguridad',
                screen: 'TransferPin',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Verificación de identidad',
                screen: 'KYCStack',
                enabled: true,
                notifications: 0
            },
            {
                title: 'Eliminar cuenta',
                screen: 'DeleteAccount',
                enabled: true,
                notifications: 0
            },
        ],
    },
    notifications: {
        title: 'NOTIFICACIONES',
        options: [
            {
                title: 'Configuración de notificaciones',
                screen: 'Notification',
                enabled: true,
                notifications: 0,
            },
        ],
    },
    payment_methods: {
        title: 'AJUSTES DE PAGO',
        options: [
            {
                title: 'Métodos de pago',
                screen: 'PaymewntMethods',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Contactos favoritos',
                screen: 'FavoriteContacts',
                enabled: true,
                notifications: 0,
            },
        ],
    }
}

export default settings