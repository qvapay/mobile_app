import { View, StyleSheet } from 'react-native'

// Image components
import { SvgUri } from 'react-native-svg'

const QPCoin = ({ coin, size = 32 }) => {

    // Coin image path
    const coin_image_path = `https://media.qvapay.com/coins/${(coin || '').toLowerCase()}.svg`

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <SvgUri style={styles.svg} uri={coin_image_path} width={size} height={size} />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 50,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    svg: {
        borderRadius: 50,
    }
})

export default QPCoin