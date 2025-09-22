import { ROUTES } from '../../routes'

// Settings Items as an object of multiple dimensions:
const settings = {
    general: {
        title: 'GENERAL',
        options: [
            {
                title: 'Tema',
                screen: ROUTES.THEME,
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
                screen: ROUTES.USERDATA,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Verificar Celular',
                screen: ROUTES.PHONE,
                enabled: true,
                notifications: 0
            },
            {
                title: 'Verificar Telegram',
                screen: ROUTES.TELEGRAM,
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
                screen: ROUTES.PASSWORD,
                enabled: true,
                notifications: 0,
            },
            // {
            //     title: 'Autenticación de dos factores',
            //     screen: ROUTES.TWO_FACTOR,
            //     enabled: true,
            //     notifications: 0,
            // },
            {
                title: 'PIN de seguridad',
                screen: ROUTES.TRANSFER_PIN,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Verificación de identidad',
                screen: ROUTES.KYC,
                enabled: true,
                notifications: 0
            },
            {
                title: 'Eliminar cuenta',
                screen: ROUTES.DELETE_ACCOUNT,
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
                screen: ROUTES.NOTIFICATIONS,
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
                screen: ROUTES.PAYMENT_METHODS,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Contactos favoritos',
                screen: ROUTES.CONTACTS,
                enabled: true,
                notifications: 0,
            },
        ],
    }
}

export default settings