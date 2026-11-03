import LightningHero from './LightningHero'
import IconHero from './IconHero'
import type { WhatsNewHero } from '../releases'

/** Resuelve la clave de héroe del manifiesto a su componente. */
const WhatsNewHeroView = ({ hero }: { hero: WhatsNewHero }) => {
	if (hero.kind === 'lightning') return <LightningHero />
	return <IconHero icon={hero.icon} tint={hero.tint} />
}

export default WhatsNewHeroView
