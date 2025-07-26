import { View, StyleSheet } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Image components
import FastImage from "@d11/react-native-fast-image"
import { SvgUri } from 'react-native-svg'

const QPCoin = ({ coin, size = 32 }) => {

    // Contexts
    const { theme } = useTheme()

    // Coin image path
    const coin_image_path = `https://qvpay.me/img/coins/${(coin || '').toLowerCase()}.svg`

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background, width: size, height: size }]}>
            <SvgUri
                style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: 'transparent'
                }}
                uri={coin_image_path}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 50,
        overflow: 'hidden',
    }
})

export default QPCoin