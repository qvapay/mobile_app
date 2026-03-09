import { ROUTES } from '../../routes'

// Settings Items - grouped to match web dashboard structure
const settings = {
    appearance: {
        title: 'APARIENCIA',
        options: [
            {
                title: 'Tema',
                screen: ROUTES.THEME,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Fuente',
                screen: ROUTES.FONT_SIZE,
                enabled: true,
                notifications: 0,
            },
        ],
    },
    profile: {
        title: 'PERFIL',
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
                notifications: 0,
            },
            {
                title: 'Verificar Telegram',
                screen: ROUTES.TELEGRAM,
                enabled: true,
                notifications: 0,
            },
        ],
    },
    gold: {
        title: 'GOLD',
        options: [
            {
                title: 'Suscripción GOLD',
                screen: ROUTES.GOLD_CHECK,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Invitar amigos',
                screen: ROUTES.REFERALS,
                enabled: true,
                notifications: 0,
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
            {
                title: 'PIN de seguridad',
                screen: ROUTES.TRANSFER_PIN,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Face ID / Touch ID',
                screen: ROUTES.BIOMETRICS,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Bloqueo de app',
                screen: ROUTES.APP_LOCK,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Verificación de identidad',
                screen: ROUTES.KYC,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Eliminar cuenta',
                screen: ROUTES.DELETE_ACCOUNT,
                enabled: true,
                notifications: 0,
            },
        ],
    },
    notifications: {
        title: 'NOTIFICACIONES',
        options: [
            {
                title: 'Envío de notificaciones',
                screen: ROUTES.NOTIFICATIONS,
                enabled: true,
                notifications: 0,
            },
        ],
    },
    payments: {
        title: 'PAGOS',
        options: [
            {
                title: 'Métodos de pago',
                screen: ROUTES.PAYMENT_METHODS,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Contactos',
                screen: ROUTES.CONTACTS,
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Micro pagos',
                screen: ROUTES.ROUNDUP,
                enabled: true,
                notifications: 0,
            },
        ],
    },
}

export default settings