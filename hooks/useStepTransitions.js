import { useMemo } from 'react'
import { Easing, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'

// Spring compartido de las transiciones de step
const STEP_SPRING = { mass: 0.8, damping: 18, stiffness: 170 }

// Transiciones de wizard/onboard conscientes de la dirección. `direction` es un
// shared value (1 = adelante, -1 = atrás) que el consumidor setea ANTES de cambiar
// de step; los worklets lo leen en el momento exacto de animar, así que entrada y
// salida siempre apuntan al lado correcto aunque el usuario alterne next/prev.
//
// Uso:
//   const { direction, makeStepEnter, stepExit } = useStepTransitions()
//   direction.value = 1; setStep(s => s + 1)
//   <Animated.View key={step} entering={makeStepEnter(0)} exiting={stepExit}>
//
// `makeStepEnter(delay)` permite cascadas escalonadas (imagen → título → texto).
export default function useStepTransitions() {

	const direction = useSharedValue(1)

	const { makeStepEnter, stepExit } = useMemo(() => {
		const makeEnter = (delay = 0) => (values) => {
			'worklet'
			return {
				initialValues: {
					opacity: 0,
					transform: [{ translateX: direction.value * 90 }, { scale: 0.96 }],
				},
				animations: {
					opacity: withDelay(delay, withTiming(1, { duration: 320 })),
					transform: [
						{ translateX: withDelay(delay, withSpring(0, STEP_SPRING)) },
						{ scale: withDelay(delay, withSpring(1, STEP_SPRING)) },
					],
				},
			}
		}
		const exit = (values) => {
			'worklet'
			return {
				initialValues: {
					opacity: 1,
					transform: [{ translateX: 0 }, { scale: 1 }],
				},
				animations: {
					opacity: withTiming(0, { duration: 180 }),
					transform: [
						{ translateX: withTiming(-direction.value * 60, { duration: 220, easing: Easing.out(Easing.quad) }) },
						{ scale: withTiming(0.98, { duration: 220 }) },
					],
				},
			}
		}
		return { makeStepEnter: makeEnter, stepExit: exit }
	}, [direction])

	return { direction, makeStepEnter, stepExit }
}
