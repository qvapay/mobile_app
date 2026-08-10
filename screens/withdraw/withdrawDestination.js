/**
 * Crypto detection for the withdraw destination gate (own wallet vs third
 * parties), mirroring the web wizard's `Number(coin?.CoinCategory?.id) === 1`.
 * `/coins/v2` only started exposing `coins_categories_id` alongside this
 * feature, so `network` (set exclusively on crypto coins: TRC20, ERC20, BSC…)
 * covers responses from backends that don't include the field yet.
 */

export const CRYPTO_CATEGORY_ID = 1

export const isCryptoCoin = (coin) =>
	Number(coin?.coins_categories_id) === CRYPTO_CATEGORY_ID || !!coin?.network
