import { View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TextStyle, ViewStyle } from 'react-native'
import type { NavigationProp } from '@react-navigation/native'

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

// Tipos
import type { Transaction, EmbeddedUser, TxWallet, TxWithdraw } from '../../types/domain'
import type { RootStackParamList } from '../../types/navigation'

/**
 * Transaction list row: coin logo or peer avatar, smart description, relative
 * time and a signed amount. Sign and color derive from whether the logged-in
 * user is the payer (red "-") or the receiver (green "+"). Descriptions stored
 * as `:sticker:<name>.webm` render as an animated TransactionSticker chip with
 * a directional "@user" label instead of text; empty descriptions fall back to
 * a derived label (deposit coin, withdraw method, app name, transfer peer…).
 * The amount honors the privacy `showBalance` setting ("***" when hidden), and
 * `index`/`totalItems` round only the group's outer corners so consecutive rows
 * read as a single card. Pressing navigates to the Transaction detail.
 *
 * @param props
 * @param props.transaction - Transaction with User/PaidBy/Wallet/Withdraw/App relations.
 * @param props.navigation - React Navigation object for the detail push.
 * @param props.index - Position in the list (corner rounding).
 * @param props.totalItems - List length (corner rounding).
 */
type Props = {
    transaction: Transaction
    navigation: NavigationProp<RootStackParamList>
    index?: number
    totalItems?: number
}

const QPTransaction = ({ transaction, navigation, index = 0, totalItems = 0 }: Props) => {

    // My user
    const { user } = useAuth()

    // Contexts
    const { t } = useTranslation()
    const { theme } = useTheme()
    // themeUtils.js declara `@returns {Object}`: sin claves hasta que se migre a TS
    const textStyles = useTextStyles(theme) as Record<string, TextStyle>
    const containerStyles = useContainerStyles(theme) as Record<string, ViewStyle>
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
        // Aire vertical de la CAJA (no de cada fila): solo el borde superior de la
        // primera fila y el inferior de la última. Espejado en TransactionSkeleton.
        ...(isFirst && { paddingTop: 14 }),
        ...(isLast && { paddingBottom: 14 }),
    }

    // Transaction data
    const { amount, description, User: owner = {} as Partial<EmbeddedUser>, PaidBy: paid_by = {} as Partial<EmbeddedUser>, Wallet: wallet = {} as Partial<TxWallet>, Withdraw: withdraw = {} as Partial<TxWithdraw>, App: app = null, BuyedService: buyedService = null, updated_at } = transaction

    const amountFloat = parseFloat(amount as string)
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
    const parsedDescription = parseTransactionDescription(description as string)
    const isStickerDescription = parsedDescription.type === 'sticker'

    // Display description with smart fallback
    const displayDescription = (description && description.trim())
        ? reduceString(description, 16)
        : wallet_coin && !withdraw?.payment_method ? t('ui.transactionRow.deposit', { coin: wallet_coin })
        : withdraw?.payment_method ? t('ui.transactionRow.withdrawal', { method: withdraw.payment_method })
        : app?.name ? app.name
        : buyedService ? t('ui.transactionRow.servicePurchase')
        : isPaidByMe && owner?.username ? t('ui.transactionRow.sentTo', { username: reduceString(owner.username, 12) })
        : !isPaidByMe && paid_by?.username ? t('ui.transactionRow.paymentFrom', { username: reduceString(paid_by.username, 12) })
        : t('ui.transactionRow.transfer')

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