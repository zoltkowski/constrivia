import { hslToRgb, rgbToHex, rgbToHsl } from '../colorUtils';

type ThemeLike = {
  palette: string[];
  defaultStroke: string;
  bg: string;
};

export type StylePaletteHandlers = {
  setStyleColorAlpha: (next: number) => void;
  syncCustomColorInputs: () => void;
  setStyleColorFromValue: (color?: string) => void;
  rememberColor: (color: string) => void;
  paletteColors: () => string[];
  updateColorButtons: () => void;
};

export function createStylePaletteHandlers(deps: {
  getTheme: () => ThemeLike;
  getStyleColorInput: () => HTMLInputElement | null;
  getCustomColorInput: () => HTMLInputElement | null;
  getCustomColorAlphaInput: () => HTMLInputElement | null;
  getCustomColorAlphaValue: () => HTMLElement | null;
  getColorSwatchButtons: () => HTMLButtonElement[];
  getCustomColorBtn: () => HTMLButtonElement | null;
  getRecentColors: () => string[];
  setRecentColors: (colors: string[]) => void;
  saveRecentColorsToStorage: (colors: string[]) => void;
  normalizeColor: (color: string) => string;
  parseHexColor: (color: string) => { r: number; g: number; b: number } | null;
  clamp: (value: number, min: number, max: number) => number;
  clamp01: (value: number) => number;
  getStyleColorAlpha: () => number;
  setStyleColorAlphaState: (value: number) => void;
}) : StylePaletteHandlers {
  const rotateHueHex = (hex: string, deg: number) => {
    const parsed = deps.parseHexColor(hex);
    if (!parsed) return hex;
    const hsl = rgbToHsl(parsed.r, parsed.g, parsed.b);
    const newHdeg = ((hsl.h * 360 + deg) % 360 + 360) % 360;
    const newH = newHdeg / 360;
    const nrgb = hslToRgb(newH, hsl.s, hsl.l);
    return rgbToHex(nrgb.r, nrgb.g, nrgb.b);
  };

  const parseColorToHexAlpha = (color?: string): { hex: string; alpha: number } => {
    const styleColorInput = deps.getStyleColorInput();
    const theme = deps.getTheme();
    const fallback = styleColorInput?.value ?? theme.defaultStroke;
    if (!color) return { hex: fallback, alpha: 1 };
    const trimmed = color.trim();
    if (!trimmed) return { hex: fallback, alpha: 1 };
    const lower = trimmed.toLowerCase();
    if (lower === 'transparent') return { hex: fallback, alpha: 0 };
    const rgbaMatch = lower.match(/^rgba?\(([^)]+)\)$/);
    if (rgbaMatch) {
      const parts = rgbaMatch[1].split(',').map((p) => p.trim());
      if (parts.length >= 3) {
        const parseChannel = (value: string) => {
          if (value.endsWith('%')) {
            const pct = Number(value.slice(0, -1));
            return deps.clamp((pct / 100) * 255, 0, 255);
          }
          return deps.clamp(Number(value), 0, 255);
        };
        const r = parseChannel(parts[0]);
        const g = parseChannel(parts[1]);
        const b = parseChannel(parts[2]);
        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
          const alphaRaw = parts.length >= 4 ? parts[3] : '1';
          const alpha = alphaRaw.endsWith('%')
            ? deps.clamp01(Number(alphaRaw.slice(0, -1)) / 100)
            : deps.clamp01(Number(alphaRaw));
          return { hex: rgbToHex(r, g, b), alpha: Number.isFinite(alpha) ? alpha : 1 };
        }
      }
    }
    const parsed = deps.parseHexColor(trimmed);
    if (parsed) return { hex: rgbToHex(parsed.r, parsed.g, parsed.b), alpha: 1 };
    return { hex: fallback, alpha: 1 };
  };

  const setStyleColorAlpha = (next: number) => {
    const resolved = Number.isFinite(next) ? next : 1;
    const clamped = deps.clamp01(resolved);
    deps.setStyleColorAlphaState(clamped);
    const customColorAlphaInput = deps.getCustomColorAlphaInput();
    const customColorAlphaValue = deps.getCustomColorAlphaValue();
    if (customColorAlphaInput) customColorAlphaInput.value = String(clamped);
    if (customColorAlphaValue) customColorAlphaValue.textContent = `${Math.round(clamped * 100)}%`;
  };

  const syncCustomColorInputs = () => {
    const customColorInput = deps.getCustomColorInput();
    const styleColorInput = deps.getStyleColorInput();
    if (customColorInput && styleColorInput) customColorInput.value = styleColorInput.value;
    setStyleColorAlpha(deps.getStyleColorAlpha());
  };

  const setStyleColorFromValue = (color?: string) => {
    const styleColorInput = deps.getStyleColorInput();
    if (!styleColorInput) return;
    const resolved = parseColorToHexAlpha(color);
    styleColorInput.value = resolved.hex;
    setStyleColorAlpha(resolved.alpha);
    const customColorInput = deps.getCustomColorInput();
    if (customColorInput) customColorInput.value = resolved.hex;
  };

  const paletteColors = (): string[] => {
    const theme = deps.getTheme();
    const colorSwatchButtons = deps.getColorSwatchButtons();
    const baseColors = theme.palette.length ? [...theme.palette] : [theme.defaultStroke];
    const swatchCount = Math.max(colorSwatchButtons.length, 4);
    const result: string[] = [];
    const usedNorm = new Set<string>();
    const bgNorm = deps.normalizeColor(theme.bg);

    const pushIfUnique = (hex: string) => {
      const n = deps.normalizeColor(hex);
      if (usedNorm.has(n)) return false;
      const parsed = deps.parseHexColor(hex);
      if (!parsed) return false;
      for (const r of result) {
        const pr = deps.parseHexColor(r);
        if (!pr) continue;
        const dr = (parsed.r - pr.r) ** 2 + (parsed.g - pr.g) ** 2 + (parsed.b - pr.b) ** 2;
        if (dr < 3600) return false;
      }
      result.push(hex);
      usedNorm.add(n);
      return true;
    };

    for (let i = 0; i < baseColors.length && result.length < swatchCount; i++) {
      const c = baseColors[i];
      if (!pushIfUnique(c)) continue;
    }

    const primary = theme.defaultStroke || baseColors[0];
    if (primary && result.length < swatchCount) pushIfUnique(primary);

    const recentColors = deps.getRecentColors();
    for (let i = 0; i < recentColors.length && result.length < swatchCount; i++) {
      pushIfUnique(recentColors[i]);
    }

    const seed = (baseColors[0] ?? theme.defaultStroke) || '#ff0000';
    const pSeed = deps.parseHexColor(seed) || deps.parseHexColor('#ff0000')!;
    const seedHsl = rgbToHsl(pSeed.r, pSeed.g, pSeed.b);
    const hueStart = Math.round((seedHsl.h * 360) % 360);
    const baseHues = [0, 30, 60, 120, 180, 210, 260, 300];
    const satCandidates = [0.92, 0.82, 0.72];
    const lightCandidates = [0.46, 0.36, 0.56];
    let hueIdx = 0;
    while (result.length < swatchCount && hueIdx < baseHues.length * 3) {
      const base = baseHues[hueIdx % baseHues.length];
      const ring = Math.floor(hueIdx / baseHues.length);
      const hue = (base + hueStart + ring * 8) % 360;
      let placed = false;
      for (let si = 0; si < satCandidates.length && !placed; si++) {
        for (let li = 0; li < lightCandidates.length && !placed; li++) {
          const s = satCandidates[si];
          const l = lightCandidates[li];
          const nrgb = hslToRgb(hue / 360, s, l);
          const cand = rgbToHex(nrgb.r, nrgb.g, nrgb.b);
          if (pushIfUnique(cand)) placed = true;
        }
      }
      hueIdx += 1;
    }

    const fallback = bgNorm === '#ffffff' ? '#222222' : '#ffffff';
    while (result.length < swatchCount) {
      if (!pushIfUnique(fallback)) break;
      if (result.length < swatchCount && !pushIfUnique('#000000')) break;
    }

    return result.slice(0, swatchCount);
  };

  const updateColorButtons = () => {
    const styleColorInput = deps.getStyleColorInput();
    if (!styleColorInput) return;
    const currentColor = styleColorInput.value;
    const colorSwatchButtons = deps.getColorSwatchButtons();
    const swatchCount = colorSwatchButtons.length;
    if (swatchCount === 0) return;

    const assigned: string[] = new Array(swatchCount).fill('');
    assigned[0] = currentColor;

    const used = new Set<string>([deps.normalizeColor(assigned[0])]);

    const candidates: string[] = [];
    paletteColors().forEach((c) => candidates.push(c));
    deps.getRecentColors().forEach((c) => candidates.push(c));

    let fillIdx = 1;
    for (let i = 0; i < candidates.length && fillIdx < swatchCount; i += 1) {
      const cand = candidates[i];
      if (!cand) continue;
      const nc = deps.normalizeColor(cand);
      if (used.has(nc)) continue;
      const parsed = deps.parseHexColor(cand);
      let tooClose = false;
      if (parsed) {
        for (let j = 0; j < fillIdx; j++) {
          const ex = assigned[j];
          if (!ex) continue;
          const pr = deps.parseHexColor(ex);
          if (!pr) continue;
          const dr = (parsed.r - pr.r) ** 2 + (parsed.g - pr.g) ** 2 + (parsed.b - pr.b) ** 2;
          if (dr < 3600) {
            tooClose = true;
            break;
          }
        }
      }
      if (tooClose) continue;
      assigned[fillIdx] = cand;
      used.add(nc);
      fillIdx += 1;
    }

    let genBase = currentColor || (paletteColors()[0] ?? deps.getTheme().defaultStroke);
    let attempts = 0;
    while (fillIdx < swatchCount) {
      const cand = rotateHueHex(genBase, 30 + (attempts % 12) * 25);
      const nc = deps.normalizeColor(cand);
      if (used.has(nc)) {
        attempts += 1;
        if (attempts > 120) break;
        continue;
      }
      const parsed = deps.parseHexColor(cand);
      let tooClose = false;
      if (parsed) {
        for (let j = 0; j < fillIdx; j++) {
          const ex = assigned[j];
          if (!ex) continue;
          const pr = deps.parseHexColor(ex);
          if (!pr) continue;
          const dr = (parsed.r - pr.r) ** 2 + (parsed.g - pr.g) ** 2 + (parsed.b - pr.b) ** 2;
          if (dr < 3600) {
            tooClose = true;
            break;
          }
        }
      }
      if (!tooClose) {
        assigned[fillIdx] = cand;
        used.add(nc);
        fillIdx += 1;
      }
      attempts += 1;
      if (attempts > 36) {
        const fallback = deps.getTheme().bg === '#ffffff' ? '#222222' : '#ffffff';
        if (!used.has(deps.normalizeColor(fallback))) {
          assigned[fillIdx] = fallback;
          used.add(deps.normalizeColor(fallback));
          fillIdx += 1;
        } else {
          assigned[fillIdx] = '#000000';
          fillIdx += 1;
        }
      }
    }

    colorSwatchButtons.forEach((btn, idx) => {
      const color = assigned[idx] || deps.getTheme().defaultStroke;
      btn.dataset.color = color;
      btn.style.background = color;
      const isActive = deps.normalizeColor(color) === deps.normalizeColor(currentColor);
      btn.classList.toggle('active', isActive);
    });
    const customColorBtn = deps.getCustomColorBtn();
    if (customColorBtn) {
      const palette = paletteColors();
      const isCustom = !palette.some((c) => deps.normalizeColor(c) === deps.normalizeColor(currentColor));
      customColorBtn.classList.toggle('active', isCustom);
    }
  };

  const rememberColor = (color: string) => {
    const norm = deps.normalizeColor(color);
    const next = deps.getRecentColors().slice();
    const existing = next.findIndex((c) => deps.normalizeColor(c) === norm);
    if (existing >= 0) next.splice(existing, 1);
    next.unshift(color);
    const trimmed = next.length > 20 ? next.slice(0, 20) : next;
    deps.setRecentColors(trimmed);
    deps.saveRecentColorsToStorage(trimmed);
    updateColorButtons();
  };

  return {
    setStyleColorAlpha,
    syncCustomColorInputs,
    setStyleColorFromValue,
    rememberColor,
    paletteColors,
    updateColorButtons
  };
}
