import { ROUTES } from '../../routes'

// Settings Items - grouped to match web dashboard structure.
// Cada item lleva su icono FontAwesome6 (solid) y un color de tinte fijo para el
// tile — paleta propia estilo iOS Settings, no depende del theme para que cada
// fila conserve su identidad en claro y oscuro. `verifiedKey` marca items cuyo
// estado se resuelve contra el user en SettingsMenu (check verde / pill GOLD).
// `keywords` alimenta el buscador del menú (settingsSearch.js): sinónimos y
// términos que un usuario teclearía aunque no coincidan con el título.
const settings = {
    appearance: {
        title: 'APARIENCIA',
        options: [
            {
                title: 'Tema',
                screen: ROUTES.THEME,
                icon: 'palette',
                color: '#6759EF',
                keywords: ['oscuro', 'claro', 'dark', 'color', 'acento', 'apariencia'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Fuente',
                screen: ROUTES.FONT_SIZE,
                icon: 'font',
                color: '#14B8A6',
                keywords: ['letra', 'tamaño', 'texto', 'tipografía'],
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
                icon: 'address-card',
                color: '#3B82F6',
                keywords: ['nombre', 'usuario', 'bio', 'correo', 'email', 'perfil'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Verificar Celular',
                screen: ROUTES.PHONE,
                icon: 'mobile-screen-button',
                color: '#22C55E',
                keywords: ['teléfono', 'móvil', 'número', 'sms'],
                verifiedKey: 'phone',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Verificar Telegram',
                screen: ROUTES.TELEGRAM,
                icon: 'paper-plane',
                color: '#229ED9',
                keywords: ['bot', 'chat', 'vincular'],
                verifiedKey: 'telegram',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Empresa',
                screen: ROUTES.ENTERPRISE,
                icon: 'building',
                color: '#8B5CF6',
                keywords: ['negocio', 'pyme', 'empresarial', 'tienda', 'marketplace', 'vendedor'],
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
                icon: 'crown',
                color: '#F0B90B',
                keywords: ['dorado', 'vip', 'premium', 'insignia', 'verificado'],
                verifiedKey: 'gold',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Invitar amigos',
                screen: ROUTES.REFERALS,
                icon: 'gift',
                color: '#EC4899',
                keywords: ['referidos', 'invitación', 'bono', 'compartir'],
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
                icon: 'key',
                color: '#F97316',
                keywords: ['clave', 'password', 'seguridad'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Face ID / Touch ID',
                screen: ROUTES.BIOMETRICS,
                icon: 'fingerprint',
                color: '#10B981',
                keywords: ['biometría', 'huella', 'cara', 'rostro', 'facial'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Passkeys',
                screen: ROUTES.PASSKEYS,
                icon: 'shield-halved',
                color: '#06B6D4',
                keywords: ['llaves de acceso', 'sin contraseña', 'webauthn'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Bloqueo de app',
                screen: ROUTES.APP_LOCK,
                icon: 'lock',
                color: '#64748B',
                keywords: ['pin', 'bloquear', 'candado'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Verificación de identidad',
                screen: ROUTES.KYC,
                icon: 'id-card',
                color: '#6366F1',
                keywords: ['kyc', 'documento', 'pasaporte', 'selfie', 'identidad'],
                verifiedKey: 'kyc',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Eliminar cuenta',
                screen: ROUTES.DELETE_ACCOUNT,
                icon: 'trash-can',
                color: '#DB253E',
                keywords: ['borrar', 'cerrar cuenta', 'baja'],
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
                icon: 'bell',
                color: '#F43F5E',
                keywords: ['push', 'avisos', 'alertas', 'sonidos'],
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
                icon: 'credit-card',
                color: '#0EA5E9',
                keywords: ['tarjeta', 'banco', 'cuenta bancaria', 'retiro'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Contactos',
                screen: ROUTES.CONTACTS,
                icon: 'address-book',
                color: '#34D399',
                keywords: ['agenda', 'amigos', 'favoritos'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'Micro pagos',
                screen: ROUTES.ROUNDUP,
                icon: 'coins',
                color: '#F59E0B',
                keywords: ['redondeo', 'ahorro', 'roundup', 'centavos'],
                enabled: true,
                notifications: 0,
            },
        ],
    },
}

export default settings
