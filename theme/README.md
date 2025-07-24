# Theme Utils - Memoized Style System

This document explains how to use the memoized theme utilities for optimal performance.

## Available Functions

### 1. Direct Style Creation (Non-memoized)
```javascript
import { createTextStyles, createContainerStyles } from './themeUtils'

// Use these when you need styles outside of React components
const textStyles = createTextStyles(theme)
const containerStyles = createContainerStyles(theme)
```

### 2. Memoized Style Creation
```javascript
import { createMemoizedTextStyles, createMemoizedContainerStyles } from './themeUtils'

// Use these when you need memoized styles but want to control the memoization
const textStyles = createMemoizedTextStyles(theme)
const containerStyles = createMemoizedContainerStyles(theme)
```

### 3. Custom Hooks (Recommended)
```javascript
import { useTextStyles, useContainerStyles, useThemeStyles } from './themeUtils'

const MyComponent = () => {
  const { theme } = useTheme()
  
  // Individual style hooks
  const textStyles = useTextStyles(theme)
  const containerStyles = useContainerStyles(theme)
  
  // Or use the combined hook
  const { text, container } = useThemeStyles(theme)
  
  return (
    <View style={container.container}>
      <Text style={text.title}>Hello World</Text>
    </View>
  )
}
```

### 4. Context-Level Styles (Most Efficient)
```javascript
import { useTheme } from './ThemeContext'

const MyComponent = () => {
  // Get both theme and pre-memoized styles from context
  const { theme, styles } = useTheme()
  
  return (
    <View style={styles.container.container}>
      <Text style={styles.text.title}>Hello World</Text>
    </View>
  )
}
```

## Performance Benefits

1. **Context-Level Memoization**: Styles are memoized at the theme context level, preventing recreation on every component render
2. **Automatic Dependency Tracking**: Styles only recalculate when the theme changes
3. **Reduced Re-renders**: Stable style references prevent unnecessary child component re-renders
4. **Memory Efficiency**: Prevents creating new StyleSheet objects on every render

## Migration Guide

### Before (Non-memoized)
```javascript
const MyComponent = () => {
  const { theme } = useTheme()
  const containerStyles = createContainerStyles(theme) // Recreated on every render
  
  return <View style={containerStyles.container}>...</View>
}
```

### After (Memoized)
```javascript
const MyComponent = () => {
  const { theme, styles } = useTheme() // Pre-memoized styles
  
  return <View style={styles.container.container}>...</View>
}
```

## Best Practices

1. **Use context-level styles** when possible for maximum performance
2. **Use custom hooks** when you need styles outside of the main theme context
3. **Avoid creating styles inline** in render methods
4. **Prefer the combined `useThemeStyles` hook** when you need both text and container styles

## Available Styles

### Text Styles
- `text` - Basic text style
- `title` - Large title text
- `subtitle` - Subtitle text
- `amount` - Large amount display
- `h1` through `h6` - Heading styles
- `caption` - Small caption text

### Container Styles
- `container` - Full flex container
- `subContainer` - Container with padding
- `card` - Card-style container
- `box` - Inline box container
- `row` - Horizontal layout
- `center` - Centered layout 