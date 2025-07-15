import { StyleSheet } from 'react-native'

const colors = {
    primary_bg: "#0E0E1C",              // Dark BG
    secondary_bg: "#21415F",            // Dark serious Blue
    primary: "#6759EF",                 // Primary Blue/Purple color
    success: "#7BFFB1",                 // Intense Green
    warning: "#ff9f43",                 // Orange pastel
    danger: "#DB253E",                  // Red pastel
    dark: "#4b4b4b",                    // Black like blue
    gray: "#9da3b4",                    // Gray like white
    elevated_dark_color: "#1E2039",     // Dark for elevation purlposes
    placeholder: "#b4b7bd",             // Gray like blue
    contrast_text: "#BBBBDD",
    almost_white: "#F7F7F7",
}

const theme = {
    darkColors: {
        primary: colors.primary,
        secondary: colors.secondary_bg,
        background: colors.primary_bg,
        success: colors.success,
        danger: colors.danger,
        elevation: colors.elevated_dark_color,
        placeholder: colors.placeholder,
        elevation_light: colors.gray,
        contrast_text: colors.contrast_text,
        almost_white: colors.almost_white,
    },
    mode: 'dark',
}

const textStyles = StyleSheet.create({
    text: {
        color: colors.almost_white,
        fontFamily: 'Rubik-Regular',
    },
    fullName: {
        fontSize: 20,
        marginLeft: 10,
        fontFamily: 'Rubik-Regular',
        color: colors.almost_white,
    },
    amount: {
        fontSize: 60,
        marginBottom: 10,
        alignSelf: 'center',
        fontFamily: "Rubik-Black",
        color: colors.almost_white,
    },
    title: {
        fontSize: 18,
        fontFamily: 'Rubik-Bold',
        color: colors.almost_white,
    },
    h1: {
        fontSize: 30,
        textAlign: 'left',
        marginVertical: 8,
        fontFamily: 'Rubik-Bold',
        color: colors.almost_white,
    },
    h2: {
        fontSize: 24,
        textAlign: 'left',
        marginVertical: 5,
        color: colors.almost_white,
        fontFamily: 'Rubik-SemiBold',
    },
    h3: {
        fontSize: 18,
        color: colors.almost_white,
        textAlign: 'left',
        fontFamily: 'Rubik-Medium',
    },
    h4: {
        fontSize: 16,
        textAlign: 'left',
        color: colors.almost_white,
        fontFamily: 'Rubik-Regular',
    },
    h5: {
        fontSize: 14,
        textAlign: 'left',
        fontFamily: 'Rubik-Light',
        color: colors.almost_white,
    },
    h6: {
        fontSize: 13,
        textAlign: 'left',
        fontFamily: 'Rubik-Light',
        color: colors.almost_white,
    },
    smallDescription: {
        fontSize: 12,
        color: colors.gray,
        fontFamily: "Rubik-Light",
    },
})

const containerStyles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        backgroundColor: colors.primary_bg,
    },
    section: {
        flex: 1,
        marginVertical: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    profilePictureSection: {
        flex: 1,
        marginTop: 25,
        alignItems: 'center',
        justifyContent: 'center',
    },
})

const globalStyles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 10,
        justifyContent: 'center',
        backgroundColor: colors.primary_bg,
    },
    text: {
        color: colors.almost_white,
        fontFamily: 'Rubik-Regular',
    },
    section: {
        flex: 1,
        marginVertical: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    profilePictureSection: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullName: {
        fontSize: 22,
        marginLeft: 10,
        color: colors.almost_white,
        fontFamily: 'Rubik-Bold'
    },
    amount: {
        fontSize: 60,
        color: colors.almost_white,
        marginBottom: 10,
        alignSelf: 'center',
        fontFamily: "Rubik-Black",
    },
    title: {
        fontSize: 20,
        color: colors.almost_white,
        marginVertical: 10,
        fontFamily: 'Rubik-Bold'
    },
    subtitle: {
        fontSize: 16,
        color: colors.almost_white,
        fontFamily: 'Rubik-Regular'
    },
    bio: {
        fontSize: 16,
        color: colors.almost_white,
        marginVertical: 10,
        textAlign: 'center',
        fontFamily: 'Rubik-Regular'
    },
    modalTopBar: {
        width: 50,
        height: 3,
        borderRadius: 10,
        marginBottom: 15,
        alignSelf: 'center',
        backgroundColor: colors.gray,
    }
})

export { theme, globalStyles, textStyles, containerStyles, colors }