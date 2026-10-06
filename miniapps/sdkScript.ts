/**
 * SDK `window.QvaPay` que se inyecta en la mini-app ANTES de que cargue su
 * contenido (`injectedJavaScriptBeforeContentLoaded`, solo marco principal).
 * PURO: genera strings, sin react-native.
 *
 * El desarrollador no tiene que incluir ningún script: dentro de QvaPay el
 * objeto ya existe. Fuera de QvaPay (navegador normal) no existe y la mini-app
 * puede detectarlo con `typeof window.QvaPay === 'undefined'`.
 *
 * Contrato público documentado en qpweb (docs de mini-apps): cambiar nombres o
 * formas aquí rompe mini-apps publicadas — solo añadir, y subir
 * `PROTOCOL_VERSION` si algo deja de ser compatible.
 */
import { PROTOCOL_VERSION } from './protocol'

/** Nombre del receptor global por el que la app responde y empuja eventos. */
export const RECEIVER = '__qvapayReceive'

/**
 * Código del SDK. Se evalúa en el navegador del WebView: ES5-compatible y
 * autocontenido (sin imports). El tema inicial viaja embebido para que la
 * mini-app pueda pintar en su primer frame sin esperar a `getTheme()`.
 *
 * @param initialTheme - Resultado de `getTheme` en el momento de abrir.
 * @param launchParams - Datos públicos de arranque (`slug`, `language`).
 */
export function buildSdkScript(initialTheme: unknown, launchParams: { slug: string, language: string }): string {
	const theme = JSON.stringify(initialTheme)
	const launch = JSON.stringify(launchParams)
	return `(function () {
	if (window.QvaPay && window.QvaPay.__native) { return; }
	var V = ${PROTOCOL_VERSION};
	var seq = 0;
	var pending = {};
	var listeners = { themeChanged: [], backButton: [], mainButton: [] };
	var theme = ${theme};

	function post(method, params) {
		return new Promise(function (resolve, reject) {
			if (!window.ReactNativeWebView) { reject({ code: 'NOT_ALLOWED', message: 'Not running inside QvaPay' }); return; }
			var id = 'q' + (++seq) + '_' + Date.now().toString(36);
			pending[id] = { resolve: resolve, reject: reject };
			window.ReactNativeWebView.postMessage(JSON.stringify({ v: V, id: id, method: method, params: params || {} }));
		});
	}

	function emit(event, data) {
		var list = (listeners[event] || []).slice();
		for (var i = 0; i < list.length; i++) { try { list[i](data); } catch (e) { setTimeout(function () { throw e; }); } }
	}

	Object.defineProperty(window, '${RECEIVER}', {
		configurable: false,
		writable: false,
		value: function (raw) {
			var msg;
			try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return; }
			if (!msg) { return; }
			if (msg.event) {
				if (msg.event === 'themeChanged') { theme = msg.data; }
				emit(msg.event, msg.data);
				return;
			}
			var p = pending[msg.id];
			if (!p) { return; }
			delete pending[msg.id];
			if (msg.ok) { p.resolve(msg.result); } else { p.reject(msg.error || { code: 'FAILED', message: 'Unknown error' }); }
		}
	});

	var sdk = {
		__native: true,
		version: String(V),
		launchParams: ${launch},
		get theme() { return theme; },
		ready: function () { return post('ready'); },
		close: function () { return post('close'); },
		getTheme: function () { return post('getTheme'); },
		on: function (event, cb) { if (listeners[event] && typeof cb === 'function') { listeners[event].push(cb); } },
		off: function (event, cb) {
			if (!listeners[event]) { return; }
			listeners[event] = listeners[event].filter(function (fn) { return fn !== cb; });
		},
		openLink: function (url) { return post('openLink', { url: url }); },
		auth: {
			requestLogin: function (opts) { return post('auth.requestLogin', { scopes: (opts && opts.scopes) || ['profile'] }); }
		},
		payments: {
			payInvoice: function (invoiceUuid) { return post('payments.payInvoice', { invoiceUuid: invoiceUuid }); }
		},
		ui: {
			mainButton: { set: function (state) { return post('ui.mainButton.set', state || {}); } },
			backButton: { set: function (state) { return post('ui.backButton.set', state || {}); } },
			haptic: function (type) { return post('ui.haptic', { type: type || 'light' }); },
			toast: function (message, opts) { return post('ui.toast', { message: message, type: (opts && opts.type) || 'info' }); }
		}
	};

	Object.defineProperty(window, 'QvaPay', { configurable: false, writable: false, value: Object.freeze(sdk) });
	try { window.dispatchEvent(new Event('qvapay:ready')); } catch (e) {}
})();
true;`
}

/**
 * Expresión JS que entrega un payload ya serializado al receptor del SDK.
 * El payload se pasa como LITERAL de string JSON (doble `stringify`), nunca
 * concatenado como código: así un mensaje con comillas o `</script>` no puede
 * romper la expresión.
 *
 * @param payload - Respuesta/evento serializado por `protocol.ts`.
 */
export function buildDeliveryScript(payload: string): string {
	return `window.${RECEIVER} && window.${RECEIVER}(${JSON.stringify(payload)}); true;`
}
