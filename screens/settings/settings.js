import { ROUTES } from '../../routes'

// Settings Items - grouped to match web dashboard structure.
// Cada item lleva su icono FontAwesome6 (solid) y un color de tinte fijo para el
// tile — paleta propia estilo iOS Settings, no depende del theme para que cada
// fila conserve su identidad en claro y oscuro. `verifiedKey` marca items cuyo
// estado se resuelve contra el user en SettingsMenu (check verde / pill GOLD).
// `keywords` alimenta el buscador del menú (settingsSearch.js): sinónimos
// BILINGÜES (es + en) que un usuario teclearía aunque no coincidan con el
// título. Los `title` son CLAVES de i18n (settings.menu.*) — SettingsMenu y
// filterSettings los resuelven con t() en render/búsqueda, así el menú entero
// cambia de idioma en vivo.
const settings = {
    appearance: {
        title: 'settings.menu.groups.appearance',
        options: [
            {
                title: 'settings.menu.items.theme',
                screen: ROUTES.THEME,
                icon: 'palette',
                color: '#6759EF',
                keywords: ['oscuro', 'claro', 'dark', 'color', 'acento', 'apariencia', 'theme', 'appearance', 'accent'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.fontSize',
                screen: ROUTES.FONT_SIZE,
                icon: 'font',
                color: '#14B8A6',
                keywords: ['letra', 'tamaño', 'texto', 'tipografía', 'font', 'size', 'text'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.language',
                screen: ROUTES.LANGUAGE,
                icon: 'language',
                color: '#3B82F6',
                keywords: ['español', 'ingles', 'english', 'language', 'traducción', 'idiomas'],
                enabled: true,
                notifications: 0,
            },
        ],
    },
    profile: {
        title: 'settings.menu.groups.profile',
        options: [
            {
                title: 'settings.menu.items.userdata',
                screen: ROUTES.USERDATA,
                icon: 'address-card',
                color: '#3B82F6',
                keywords: ['nombre', 'usuario', 'bio', 'correo', 'email', 'perfil', 'profile', 'name', 'username'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.phone',
                screen: ROUTES.PHONE,
                icon: 'mobile-screen-button',
                color: '#22C55E',
                keywords: ['teléfono', 'móvil', 'número', 'sms', 'phone', 'mobile', 'verify'],
                verifiedKey: 'phone',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.telegram',
                screen: ROUTES.TELEGRAM,
                icon: 'paper-plane',
                color: '#229ED9',
                keywords: ['bot', 'chat', 'vincular', 'link'],
                verifiedKey: 'telegram',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.enterprise',
                screen: ROUTES.ENTERPRISE,
                icon: 'building',
                color: '#8B5CF6',
                keywords: ['negocio', 'pyme', 'empresarial', 'tienda', 'marketplace', 'vendedor', 'business', 'company', 'seller'],
                enabled: true,
                notifications: 0,
            },
        ],
    },
    gold: {
        title: 'settings.menu.groups.gold',
        options: [
            {
                title: 'settings.menu.items.goldCheck',
                screen: ROUTES.GOLD_CHECK,
                icon: 'crown',
                color: '#F0B90B',
                keywords: ['dorado', 'vip', 'premium', 'insignia', 'verificado', 'subscription', 'badge'],
                verifiedKey: 'gold',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.referals',
                screen: ROUTES.REFERALS,
                icon: 'gift',
                color: '#EC4899',
                keywords: ['referidos', 'invitación', 'bono', 'compartir', 'referral', 'invite', 'friends', 'bonus'],
                enabled: true,
                notifications: 0,
            },
        ],
    },
    security: {
        title: 'settings.menu.groups.security',
        options: [
            {
                title: 'settings.menu.items.password',
                screen: ROUTES.PASSWORD,
                icon: 'key',
                color: '#F97316',
                keywords: ['clave', 'password', 'seguridad', 'security'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.biometrics',
                screen: ROUTES.BIOMETRICS,
                icon: 'fingerprint',
                color: '#10B981',
                keywords: ['biometría', 'huella', 'cara', 'rostro', 'facial', 'fingerprint', 'face', 'biometrics'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.passkeys',
                screen: ROUTES.PASSKEYS,
                icon: 'shield-halved',
                color: '#06B6D4',
                keywords: ['llaves de acceso', 'sin contraseña', 'webauthn', 'passkey', 'passwordless'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.appLock',
                screen: ROUTES.APP_LOCK,
                icon: 'lock',
                color: '#64748B',
                keywords: ['pin', 'bloquear', 'candado', 'lock', 'app lock'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.kyc',
                screen: ROUTES.KYC,
                icon: 'id-card',
                color: '#6366F1',
                keywords: ['kyc', 'documento', 'pasaporte', 'selfie', 'identidad', 'identity', 'document', 'passport'],
                verifiedKey: 'kyc',
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.deleteAccount',
                screen: ROUTES.DELETE_ACCOUNT,
                icon: 'trash-can',
                color: '#DB253E',
                keywords: ['borrar', 'cerrar cuenta', 'baja', 'delete', 'close account'],
                enabled: true,
                notifications: 0,
            },
        ],
    },
    notifications: {
        title: 'settings.menu.groups.notifications',
        options: [
            {
                title: 'settings.menu.items.notifications',
                screen: ROUTES.NOTIFICATIONS,
                icon: 'bell',
                color: '#F43F5E',
                keywords: ['push', 'avisos', 'alertas', 'sonidos', 'notifications', 'alerts', 'sounds'],
                enabled: true,
                notifications: 0,
            },
        ],
    },
    payments: {
        title: 'settings.menu.groups.payments',
        options: [
            {
                title: 'settings.menu.items.paymentMethods',
                screen: ROUTES.PAYMENT_METHODS,
                icon: 'credit-card',
                color: '#0EA5E9',
                keywords: ['tarjeta', 'banco', 'cuenta bancaria', 'retiro', 'card', 'bank', 'withdrawal'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.contacts',
                screen: ROUTES.CONTACTS,
                icon: 'address-book',
                color: '#34D399',
                keywords: ['agenda', 'amigos', 'favoritos', 'friends', 'favorites', 'address book'],
                enabled: true,
                notifications: 0,
            },
            {
                title: 'settings.menu.items.roundup',
                screen: ROUTES.ROUNDUP,
                icon: 'coins',
                color: '#F59E0B',
                keywords: ['redondeo', 'ahorro', 'roundup', 'centavos', 'round up', 'savings', 'spare change'],
                enabled: true,
                notifications: 0,
            },
        ],
    },
}

export default settings
