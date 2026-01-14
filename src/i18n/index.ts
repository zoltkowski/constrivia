import HINTS_PL from '../hints';
import HINTS_EN from '../hints.en';
import UI_PL from '../ui.pl';
import UI_EN from '../ui.en';

type Lang = 'pl' | 'en';

// Export a mutable HINTS object so other modules keep the reference.
export const HINTS: any = { ...HINTS_PL };

let currentLang: Lang = (localStorage.getItem('geometry.lang') as Lang) || 'pl';

// Used by UI state helpers.
export function setLanguage(lang: Lang) {
	currentLang = lang;
	const src = lang === 'en' ? HINTS_EN : HINTS_PL;
	// Replace contents while keeping the same reference
	Object.keys(HINTS).forEach((k) => delete HINTS[k]);
	Object.assign(HINTS, src);
	localStorage.setItem('geometry.lang', lang);
}

// Used by UI/state updates.
export function applyUILanguage(lang: Lang) {
	const ui = lang === 'en' ? UI_EN : UI_PL;
	try {
		Object.keys(ui).forEach((id) => {
			const el = document.getElementById(id);
			if (!el) return;
			const entry = ui[id];
			if (entry.text !== undefined) {
				// preserve SVG children when replacing text in buttons
				if (el.querySelector && el.querySelector('svg')) {
					// remove existing text nodes while keeping svg
					Array.from(el.childNodes).forEach((n) => {
						if (n.nodeType === Node.TEXT_NODE) el.removeChild(n);
					});
					const span = document.createElement('span');
					span.textContent = entry.text;
					el.appendChild(span);
				} else {
					el.textContent = entry.text;
				}
			}
			if (entry.title !== undefined) el.setAttribute('title', entry.title);
			if (entry.aria !== undefined) el.setAttribute('aria-label', entry.aria);
			if (entry.placeholder !== undefined && (el as HTMLInputElement).placeholder !== undefined)
				(el as HTMLInputElement).placeholder = entry.placeholder;
		});
		// translate elements using data-i18n attributes
		document.querySelectorAll('[data-i18n]').forEach((node) => {
			const key = (node as HTMLElement).getAttribute('data-i18n') as string;
			if (!key) return;
			const entry = (ui as any)[key];
			if (!entry) return;
			const el = node as HTMLElement;
			if (entry.text !== undefined) {
				el.textContent = entry.text;
			}
			if (entry.title !== undefined) el.setAttribute('title', entry.title);
			if (entry.aria !== undefined) el.setAttribute('aria-label', entry.aria);
			if (entry.placeholder !== undefined && (el as HTMLInputElement).placeholder !== undefined)
				(el as HTMLInputElement).placeholder = entry.placeholder;
		});
	} catch (e) {
		// ignore if DOM not ready
	}
}

// Used by UI state helpers.
export function getLanguage() { return currentLang; }

// Do not apply UI at module import; UI should be applied after DOM is ready by caller.

export default HINTS;
