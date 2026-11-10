/**
 * Aviso legal del IOF — copia LITERAL de qpweb (`content/docs/store/pix.mdx`,
 * `components/store/PixPayment.js`).
 *
 * Vive fuera de i18n A PROPÓSITO: no es copy de UI. Quien muestra el QR por su cuenta debe enseñar
 * este texto, en portugués y sin reescribirlo, junto al botón de pagar y junto al QR, sea cual sea
 * el idioma de la app. Cualquier cambio: primero en qpweb, luego aquí, palabra por palabra.
 */
export const PIX_IOF_NOTICE = {
	text: 'Esta é uma compra internacional e não inclui a tarifa de 3.5% de IOF. Ao prosseguir, você reconhece e aceita os ',
	linkLabel: 'termos e condições do Ebanx',
	end: '.',
	url: 'https://www.ebanx.com/pt-br/legal/consumidores/brasil/termos-para-processar-pagamentos/',
} as const
