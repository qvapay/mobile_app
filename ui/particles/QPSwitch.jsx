import { useRef, useState, useEffect } from 'react'
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Animated segmented control for Buy/Sell
const QPSwitch = ({ type, onChange }) => {

    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)

    const translate = useRef(new Animated.Value(type === 'buy' ? 0 : 1)).current
    const [containerWidth, setContainerWidth] = useState(0)

    useEffect(() => {
        Animated.spring(translate, {
            toValue: type === 'buy' ? 0 : 1,
            useNativeDriver: true,
            friction: 12,
            tension: 120
        }).start()
    }, [type])

    const halfWidth = Math.max(0, containerWidth / 2)
    const pillWidth = Math.max(0, halfWidth - 4) // 2px inset on each side within half
    const leftStart = 2 // Starting position with 2px margin
    const rightStart = halfWidth - 1 // Starting position for right side with 2px margin
    const pillTranslateX = translate.interpolate({ inputRange: [0, 1], outputRange: [leftStart, rightStart] })

    return (
        <View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)} style={[styles.segmentedContainer, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]} >
            <Animated.View
                pointerEvents='none'
                style={[styles.segmentedPill, {
                    left: 0,
                    width: pillWidth,
                    backgroundColor: type === 'buy' ? theme.colors.success : theme.colors.danger,
                    transform: [{ translateX: pillTranslateX }]
                }]}
            />

            <Pressable style={styles.segmentedOption} onPress={() => onChange('buy')}>
                <Text style={[textStyles.h6, { color: type === 'buy' ? theme.colors.almostBlack : theme.colors.primaryText }]}>Comprar</Text>
            </Pressable>
            <Pressable style={styles.segmentedOption} onPress={() => onChange('sell')}>
                <Text style={[textStyles.h6, { color: type === 'sell' ? theme.colors.almostWhite : theme.colors.primaryText }]}>Vender</Text>
            </Pressable>
        </View>
    )
}

const styles = StyleSheet.create({
    segmentedContainer: {
        position: 'relative',
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center'
    },
    segmentedPill: {
        position: 'absolute',
        left: 0,
        top: 2,
        bottom: 2,
        borderRadius: 20,
    },
    segmentedOption: {
        flex: 1,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center'
    }
})

export default QPSwitch