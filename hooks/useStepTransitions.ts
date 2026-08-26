import { useMemo } from 'react'
import { Easing, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'
import type { EntryAnimationsValues, ExitAnimationsValues, LayoutAnimation, SharedValue } from 'react-native-reanimated'

// Spring shared by every step transition
const STEP_SPRING = { mass: 0.8, damping: 18, stiffness: 170 }

/**
 * Direction-aware wizard/onboard step transitions for Reanimated
 * (used by the Register wizard and Onboard screens).
 *
 * `direction` is a shared value (1 = forward, -1 = back) the consumer sets
 * BEFORE switching steps; the worklets read it at the exact moment they
 * animate, so enter and exit always slide toward the correct side even when
 * the user alternates next/prev.
 *
 * Usage:
 *   const { direction, makeStepEnter, stepExit } = useStepTransitions()
 *   direction.value = 1; setStep(s => s + 1)
 *   <Animated.View key={step} entering={makeStepEnter(0)} exiting={stepExit}>
 *
 * @returns `{ direction, makeStepEnter, stepExit }` —
 *   `makeStepEnter(delay)` builds an entering worklet with an optional ms delay
 *   for staggered cascades (image → title → text); `stepExit` is the shared
 *   exiting worklet.
 */
export default function useStepTransitions(): {
	direction: SharedValue<number>
	makeStepEnter: (delay?: number) => (values: EntryAnimationsValues) => LayoutAnimation
	stepExit: (values: ExitAnimationsValues) => LayoutAnimation
} {

	const direction = useSharedValue(1)

	const { makeStepEnter, stepExit } = useMemo(() => {
		const makeEnter = (delay: number = 0) => (_values: EntryAnimationsValues): LayoutAnimation => {
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
		const exit = (_values: ExitAnimationsValues): LayoutAnimation => {
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
