import PromoBanner from '../../../ui/PromoBanner'
import { useHomePromo } from '../hooks/useHomePromo'

const HomePromoSection = () => {
	const { data: promo } = useHomePromo()
	return <PromoBanner promo={promo} />
}

export default HomePromoSection

