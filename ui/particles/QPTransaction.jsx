import { View, Text, Pressable } from 'react-native'

// Helpers
import { timeSince, reduceString } from '../../helpers'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// Routes
import { ROUTES } from '../../routes'

// Particles
import QPCoin from './QPCoin'
import QPAvatar from './QPAvatar'
import TransactionSticker from './TransactionSticker'

// Stickers
import { parseTransactionDescription } from '../../helpers/stickers'

// QPTransaction component
const QPTransaction = ({ transaction, navigation, index = 0, totalItems = 0 }) => {

    // My user
    const { user } = useAuth()

    // Contexts
    const { theme } = useTheme()
    const textStyles = useTextStyles(theme)
    const containerStyles = useContainerStyles(theme)
    const { getSetting } = useSettings()
    const showBalance = getSetting('privacy', 'showBalance', true)

    // Determine border radius based on position
    const isFirst = index === 0
    const isLast = index === totalItems - 1
    const containerStyle = {
        borderRadius: isFirst ? 10 : isLast ? 10 : 0,
        borderTopLeftRadius: isFirst ? 10 : 0,
        borderTopRightRadius: isFirst ? 10 : 0,
        borderBottomLeftRadius: isLast ? 10 : 0,
        borderBottomRightRadius: isLast ? 10 : 0,
        marginBottom: isLast ? 10 : 0,
    }

    // Transaction data
    const { amount, description, User: owner = {}, PaidBy: paid_by = {}, Wallet: wallet = {}, Withdraw: withdraw = {}, App: app = null, BuyedService: buyedService = null, updated_at } = transaction

    const amountFloat = parseFloat(amount)
    const amountFixed = amountFloat.toFixed(2)

    // Wallet coin (deposits) or Withdraw payment_method (withdrawals)
    const wallet_coin = wallet?.Coin?.logo || wallet?.Coin?.tick || wallet?.wallet_type || withdraw?.payment_method || ''

    // My user is the owner of the transaction
    const user_uuid = user?.uuid || ''
    const paid_by_uuid = paid_by?.uuid || ''
    const isPaidByMe = user_uuid === paid_by_uuid
    const transactionSign = isPaidByMe ? '-' : '+'
    const transactionColor = isPaidByMe ? theme.colors.danger : theme.colors.successText

    // Sticker descriptions (e.g. ":sticker:lol.webm") render as animated chip,
    // not text. Fall back to the smart-text label only when there's no sticker.
    const parsedDescription = parseTransactionDescription(description)
    const isStickerDescription = parsedDescription.type === 'sticker'

    // Display description with smart fallback
    const displayDescription = (description && description.trim())
        ? reduceString(description, 16)
        : wallet_coin && !withdraw?.payment_method ? `Depósito ${wallet_coin}`
        : withdraw?.payment_method ? `Extracción ${withdraw.payment_method}`
        : app?.name ? app.name
        : buyedService ? 'Compra de servicio'
        : isPaidByMe && owner?.username ? `Envío a @${reduceString(owner.username, 12)}`
        : !isPaidByMe && paid_by?.username ? `Pago de @${reduceString(paid_by.username, 12)}`
        : 'Transferencia'

    // Navigate to transaction
    const navigateToTransaction = () => navigation.navigate(ROUTES.TRANSACTION, { transaction })

    return (
        <Pressable onPress={navigateToTransaction}>
            <View style={[containerStyles.box, { justifyContent: 'space-between' }, containerStyle]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                    {wallet_coin ? (<QPCoin coin={wallet_coin} size={48} />) : (<QPAvatar user={isPaidByMe ? owner : paid_by} size={48} />)}
                    <View style={{ flexDirection: 'column' }}>
                        {isStickerDescription ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TransactionSticker name={parsedDescription.sticker} size={28} />
                                <Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
                                    {isPaidByMe ? `→ @${reduceString(owner?.username || '', 12)}` : `← @${reduceString(paid_by?.username || '', 12)}`}
                                </Text>
                            </View>
                        ) : (
                            <Text style={textStyles.h4}>{displayDescription}</Text>
                        )}
                        <Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{timeSince(updated_at)}</Text>
                    </View>
                </View>
                <View>
                    <Text style={[textStyles.h4, { color: transactionColor }]}>{showBalance ? `${transactionSign}${amountFixed}` : '***'}</Text>
                </View>
            </View>
        </Pressable>
    )
}

export default QPTransaction