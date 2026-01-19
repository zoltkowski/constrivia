const MOVE_SELECT_PATH = '<path d="M12 3 9.5 5.5 12 8l2.5-2.5L12 3Zm0 13-2.5 2.5L12 21l2.5-2.5L12 16Zm-9-4 2.5 2.5L8 12 5.5 9.5 3 12Zm13 0 2.5 2.5L21 12l-2.5-2.5L16 12ZM8 12l8 0" />';
const MULTI_MOVE_PATH = '<path d="M12 3 9.5 5.5 12 8l2.5-2.5L12 3Zm0 13-2.5 2.5L12 21l2.5-2.5L12 16Zm-9-4 2.5 2.5L8 12 5.5 9.5 3 12Zm13 0 2.5 2.5L21 12l-2.5-2.5L16 12Z"></path>';
const VIEW_VERTICES_MARKUP =
  '<circle cx="8" cy="12" r="3.8" fill="none" stroke="currentColor"/><circle cx="8" cy="12" r="1.6" class="icon-fill"/><circle cx="16" cy="12" r="3.8" fill="none" stroke="currentColor"/><circle cx="16" cy="12" r="1.6" class="icon-fill"/>';
const VIEW_EDGES_MARKUP = '<line x1="5" y1="12" x2="19" y2="12"/>';
const TICK1_MARKUP =
  '<line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round" stroke-width="1.8"/><line x1="12" y1="8" x2="12" y2="16" stroke-linecap="round" stroke-width="1.8"/>';
const EYE_MARKUP =
  '<path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="3"/>';
const EYE_OFF_MARKUP =
  '<path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="3"/><path d="M4 4 20 20"/>';
const POINT_HOLLOW_MARKUP =
  '<circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" stroke-width="2"/>';
const POINT_FILLED_MARKUP = '<circle cx="12" cy="12" r="5.2" class="icon-fill"/>';
const DELETE_MARKUP =
  '<path d="M5 6h14"/><path d="M10 10v8"/><path d="M14 10v8"/><path d="M7 6 8 4h8l1 2"/><path d="M6 6v14h12V6"/>';
const wrapIcon = (viewBox: string, markup: string) =>
  `<svg class="icon" viewBox="${viewBox}" aria-hidden="true">${markup}</svg>`;

export const LABEL_ALIGN_ICON_LEFT =
  '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="3" width="8" height="2" rx="1"/><rect x="1" y="7" width="12" height="2" rx="1"/><rect x="1" y="11" width="8" height="2" rx="1"/></svg>';
export const LABEL_ALIGN_ICON_CENTER =
  '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="2" y="11" width="12" height="2" rx="1"/></svg>';

export const ICONS = {
  moveSelect: wrapIcon('0 0 24 24', MOVE_SELECT_PATH),
  vertices:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" class="icon-fill"/></svg>',
  edges:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  rayLeft:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H6"/><path d="m6 8-4 4 4 4"/></svg>',
  rayRight:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14"/><path d="m18 8 4 4-4 4"/></svg>',
  viewVertices: wrapIcon('0 0 24 24', VIEW_VERTICES_MARKUP),
  viewEdges: wrapIcon('0 0 24 24', VIEW_EDGES_MARKUP),
  viewBoth:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="3.2" fill="none" stroke="currentColor"/><circle cx="6" cy="12" r="1.5" class="icon-fill"/><circle cx="18" cy="12" r="3.2" fill="none" stroke="currentColor"/><circle cx="18" cy="12" r="1.5" class="icon-fill"/><line x1="6" y1="12" x2="18" y2="12" stroke-linecap="round" stroke-width="2"/></svg>',
  rayLine:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12"/></svg>',
  rayRightOnly:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="14" y2="12"/><path d="m14 8 6 4-6 4"/></svg>',
  rayLeftOnly:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="10" y1="12" x2="20" y2="12"/><path d="m10 8-6 4 6 4"/></svg>',
  raySegment:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="2" class="icon-fill"/><circle cx="16" cy="12" r="2" class="icon-fill"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  tick1: wrapIcon('0 0 24 24', TICK1_MARKUP),
  tick2:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round" stroke-width="1.8"/><line x1="10" y1="8" x2="10" y2="16" stroke-linecap="round" stroke-width="1.8"/><line x1="14" y1="8" x2="14" y2="16" stroke-linecap="round" stroke-width="1.8"/></svg>',
  tick3:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round" stroke-width="1.8"/><line x1="9" y1="7.5" x2="9" y2="16.5" stroke-linecap="round" stroke-width="1.8"/><line x1="12" y1="7.5" x2="12" y2="16.5" stroke-linecap="round" stroke-width="1.8"/><line x1="15" y1="7.5" x2="15" y2="16.5" stroke-linecap="round" stroke-width="1.8"/></svg>',
  eye: wrapIcon('0 0 24 24', EYE_MARKUP),
  eyeOff: wrapIcon('0 0 24 24', EYE_OFF_MARKUP)
};

export const POINT_STYLE_ICON_HOLLOW = wrapIcon('0 0 24 24', POINT_HOLLOW_MARKUP);
export const POINT_STYLE_ICON_FILLED = wrapIcon('0 0 24 24', POINT_FILLED_MARKUP);

export const GITHUB_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 .5C5.73.5.75 5.48.75 11.78c0 4.94 3.2 9.12 7.64 10.59.56.1.76-.24.76-.53 0-.26-.01-1.12-.02-2.03-3.11.67-3.77-1.5-3.77-1.5-.51-1.29-1.24-1.63-1.24-1.63-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.24.93.1-.73.39-1.21.71-1.49-2.48-.28-5.09-1.24-5.09-5.49 0-1.21.43-2.2 1.13-2.98-.11-.28-.49-1.42.11-2.97 0 0 .92-.29 3.01 1.14a10.5 10.5 0 0 1 2.74-.37c.93.01 1.87.13 2.74.37 2.09-1.43 3.01-1.14 3.01-1.14.6 1.55.22 2.69.11 2.97.7.78 1.13 1.77 1.13 2.98 0 4.26-2.62 5.2-5.11 5.48.4.35.76 1.05.76 2.12 0 1.53-.01 2.76-.01 3.14 0 .29.2.64.77.53 4.43-1.47 7.63-5.65 7.63-10.59C23.25 5.48 18.27.5 12 .5z" fill="currentColor"/></svg>';

export const CHANGE_FOLDER_ICON =
  '<svg class="icon" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 13h8"/><path d="M9 17h5"/></svg>';
export const DELETE_ICON = wrapIcon('0 0 24 24', DELETE_MARKUP);

export const MULTI_CLONE_ICON_PASTE = {
  viewBox: '0 0 64 64',
  markup:
    '<rect x="18" y="10" width="28" height="10" rx="3" /><path d="M22 10h20" /><rect x="14" y="18" width="36" height="36" rx="4" /><path d="M22 30h20M22 38h20M22 46h14" />'
} as const;

type IconDef = { viewBox: string; markup: string };

function resolveIconDef(key: string): IconDef | null {
  if (key.startsWith('tool:')) {
    const toolId = key.slice(5) as keyof typeof TOOL_ICON_DEFS;
    const tool = TOOL_ICON_DEFS[toolId];
    if (tool) return { viewBox: tool.viewBox, markup: tool.icon };
  }
  const ui = UI_ICON_DEFS[key as keyof typeof UI_ICON_DEFS];
  return ui ?? null;
}

// Used by UI initialization.
export function applyUiIcons(root: ParentNode = document) {
  const svgs = root.querySelectorAll<SVGElement>('svg[data-icon]');
  svgs.forEach((svg) => {
    const key = svg.getAttribute('data-icon');
    if (!key) return;
    const def = resolveIconDef(key);
    if (!def) return;
    svg.setAttribute('viewBox', def.viewBox);
    svg.innerHTML = def.markup;
  });
}

export const MULTI_CLONE_ICON_COPY = {
  viewBox: '0 0 24 24',
  markup:
    '<rect x="8" y="8" width="13" height="13" rx="2" fill="none" stroke="currentColor"/><path d="M6 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />'
} as const;

export const UI_ICON_DEFS = {
  'angle-exterior': {
    viewBox: '0 0 100 100',
    markup:
      '<line x1="50" y1="20" x2="15" y2="80" stroke="currentColor" stroke-width="4" stroke-linecap="round" /> <line x1="50" y1="20" x2="85" y2="80" stroke="currentColor" stroke-width="4" stroke-linecap="round" /> <path d="M 18 35 A 25 25 0 0 1 82 35" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />'
  },
  'angle-right': {
    viewBox: '0 0 24 24',
    markup: '<line x1="6" y1="4" x2="6" y2="20" /> <line x1="6" y1="20" x2="20" y2="20" /> <rect x="6" y="16" width="4" height="4" fill="none"/>'
  },
  'arc-1': { viewBox: '0 0 24 24', markup: '<path d="M6 16a6 6 0 0 1 12 0"/>' },
  'arc-2': { viewBox: '0 0 24 24', markup: '<path d="M6 17a6 6 0 0 1 12 0"/><path d="M7 13.5a5 5 0 0 1 10 0"/>' },
  'arc-3': {
    viewBox: '0 0 24 24',
    markup: '<path d="M6 18a6 6 0 0 1 12 0"/><path d="M6.5 15a5.5 5.5 0 0 1 11 0"/><path d="M7 12a5 5 0 0 1 10 0"/>'
  },
  'arc-fill': {
    viewBox: '0 0 24 24',
    markup: '<path d="M6 16a6 6 0 0 1 12 0 Z" fill="currentColor" stroke="none"/>'
  },
  'circle-outline': { viewBox: '0 0 24 24', markup: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>' },
  close: { viewBox: '0 0 24 24', markup: '<path d="M6 6l12 12M18 6 6 18" />' },
  'cloud-files': { viewBox: '0 0 24 24', markup: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' },
  'cloud-tab-cloud': { viewBox: '0 0 24 24', markup: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>' },
  'cloud-tab-library': { viewBox: '0 0 24 24', markup: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>' },
    'cloud-tab-local': { viewBox: '0 0 24 24', markup: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>' },
    'color-custom': { viewBox: '0 0 24 24', markup: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor"/> <path d="M12 8v8M8 12h8" stroke-width="2" />' },
    lock: {
      viewBox: '0 0 24 24',
      markup: '<rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor"/>'
    },
    'config-export': {
    viewBox: '0 0 24 24',
    markup: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  'config-import': {
    viewBox: '0 0 24 24',
    markup: '<path d="M12 21V9" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/> <path d="m7 13 5-5 5 5" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/> <path d="M5 5h14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  'copy-image': { viewBox: '0 0 24 24', markup: '<rect x="8" y="8" width="11" height="11" rx="2" /> <rect x="5" y="5" width="11" height="11" rx="2" fill="none" stroke="currentColor" />' },
  'copy-style': {
    viewBox: '0 0 320.632 320.632',
    markup: `<g fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" transform="matrix(1.0773929,0,0,1.0560657,2.6335276,-5.8480088)">
  <path d="m 192.004,242.182 c 0.668,0.668 1.536,1 2.408,1 0.872,0 1.74,-0.332 2.408,-1 l 15.86,-15.86 c 5.164,-5.164 8.008,-12.052 8.008,-19.396 0,-5.876 -1.888,-11.408 -5.248,-16.048 5.892,-6.444 11.912,-15.892 8.66,-24.508 -1.38,-3.664 -4.552,-6.216 -6.56,-9.516 -3.884,-6.384 -5.232,-14.1 -3.836,-21.396 2.648,-13.832 13.56,-24.072 24.556,-31.964 16.304,-11.708 35.588,-20.372 46.892,-37.752 8.616,-13.244 12.348,-35.484 2.364,-48.964 -0.032,-0.044 -0.076,-0.06 -0.108,-0.1 -0.256,-0.42 -0.608,-0.804 -1.112,-1.124 -14.604,-9.16 -36.004,-5.228 -49.58,4.244 -16.992,11.864 -25.368,31.096 -37.32,47.316 -7.704,10.452 -17.736,20.576 -30.928,23.1 -7.272,1.392 -15.032,0.036 -21.396,-3.836 -2.892,-1.76 -5.308,-4.744 -8.444,-6.116 -9.812,-4.296 -20.524,3.112 -27.324,9.844 -1.308,1.296 -1.3,3.52 0,4.82 31.904,31.904 63.804,63.804 95.708,95.708 0.132,0.624 0.38,1.224 0.864,1.708 3.88,3.88 6.012,9.06 6.012,14.588 0,5.524 -2.136,10.704 -6.012,14.58 L 194.424,234.962 68.956,109.51 82.408,96.058 c 5.372,-5.38 13.292,-7.348 20.62,-5.12 1.816,0.552 3.704,-0.472 4.244,-2.276 C 107.816,86.866 106.8,84.958 105,84.414 95.268,81.486 84.756,84.082 77.592,91.242 l -15.86,15.86 c -0.636,0.64 -1,1.508 -1,2.408 0,0.904 0.364,1.772 1,2.408 l 116.808,116.804 -47.572,66.548 -11.724,-11.724 19.06,-23.46 c 0.832,-1.02 0.676,-2.52 -0.348,-3.352 -1.02,-0.836 -2.52,-0.684 -3.352,0.348 l -18.748,23.08 -17.56,-17.56 c 0.168,-0.116 0.348,-0.204 0.488,-0.364 l 11.468,-13.304 c 0.86,-1 0.748,-2.504 -0.248,-3.364 -0.988,-0.852 -2.496,-0.752 -3.364,0.248 l -11.472,13.308 c -0.056,0.068 -0.076,0.148 -0.124,0.22 L 71.172,235.478 96.636,210.014 c 0.932,-0.928 0.932,-2.44 0,-3.368 -0.928,-0.928 -2.44,-0.928 -3.368,0 L 67.804,232.11 45.788,210.094 57.092,200.838 c 1.02,-0.836 1.172,-2.336 0.336,-3.356 -0.844,-1.024 -2.344,-1.16 -3.356,-0.332 L 42.4,206.706 25.408,189.71 46.368,173.19 c 1.032,-0.82 1.212,-2.312 0.396,-3.352 -0.812,-1.032 -2.308,-1.2 -3.352,-0.396 l -21.396,16.872 -13.36,-13.36 53.448,-38.208 c 1.528,-1.092 1.884,-3.22 0.788,-4.748 -1.084,-1.524 -3.216,-1.892 -4.748,-0.788 l -56.72,40.544 c -0.816,0.584 -1.332,1.492 -1.412,2.488 -0.084,1 0.276,1.98 0.988,2.692 l 128.004,128.004 c 0.644,0.644 1.504,1 2.408,1 0.092,0 0.184,-0.004 0.28,-0.016 0.996,-0.08 1.904,-0.6 2.488,-1.412 l 49.252,-68.9 z m 19.308,-56.876 c -30.904,-30.9 -61.804,-61.804 -92.704,-92.704 3.208,-2.832 7.028,-5.516 10.984,-6.412 6.976,-1.564 14.384,7.072 21.18,9.392 14.116,4.824 28.184,0.472 39.444,-8.616 14.056,-11.348 21.9,-27.836 32.132,-42.308 12.52,-17.716 37.56,-36.852 59.828,-23.584 13.812,20.028 -3.536,46.108 -19.732,58.224 -14.784,11.056 -32.136,18.788 -44.34,33.056 -9.388,10.984 -14.468,24.816 -10.26,39.112 2.164,7.356 11.52,15.584 9.876,22.856 -0.892,3.956 -3.576,7.776 -6.408,10.984 z" />
</g>`
  },
  'debug-list': {
    viewBox: '0 0 24 24',
    markup: '<rect x="4" y="4" width="16" height="16" rx="2" /> <line x1="8" y1="9" x2="16" y2="9"/> <line x1="8" y1="13" x2="16" y2="13"/> <line x1="8" y1="17" x2="13" y2="17"/>'
  },
  delete: { viewBox: '0 0 24 24', markup: DELETE_MARKUP },
  eraser: {
    viewBox: '0 0 256.00098 256.00098',
    markup:
      '<path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" d="M216.001,211.833H120.6875l98.14258-98.1416a20.0237,20.0237,0,0,0-.001-28.28418L173.57422,40.15234a20.01987,20.01987,0,0,0-28.2832,0l-56.564,56.564-.00537.00439-.00439.00537-56.564,56.564a20.02163,20.02163,0,0,0,0,28.2832l37.08887,37.08789a4.00051,4.00051,0,0,0,2.82812,1.17188H216.001a4,4,0,0,0,0-8ZM150.94727,45.80859a12.0157,12.0157,0,0,1,16.9707,0l45.25488,45.25489a12.016,12.016,0,0,1,0,16.97168L159.43213,161.7749,97.20654,99.54932ZM109.37305,211.833H73.72754l-35.918-35.916a12.01392,12.01392,0,0,1,0-16.9707l53.74072-53.74072,62.22559,62.22558Z"/>'
  },
  'export-json': { viewBox: '0 0 24 24', markup: '<path d="M12 3v12"/> <path d="m7 11 5 5 5-5"/> <path d="M5 19h14"/>' },
  'eye-off': { viewBox: '0 0 24 24', markup: EYE_OFF_MARKUP },
  'fill-rect': { viewBox: '0 0 24 24', markup: '<rect class="fill-icon" x="7" y="7" width="10" height="10" />' },
  help: {
    viewBox: '0 0 24 24',
    markup: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor"/> <text x="12" y="16" text-anchor="middle" font-size="14" fill="currentColor">?</text>'
  },
  highlighter: {
    viewBox: '0 0 24 24',
    markup: '<path d="M2 21s4-4 6-4 3 1 5 1 6-4 6-4 2-2 2-3-1-2-1-2l-6 6s-1 1-3 1-3-1-3-1L2 21z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  'icon-minus': { viewBox: '0 0 24 24', markup: '<line x1="6" y1="12" x2="18" y2="12" />' },
  'icon-plus': { viewBox: '0 0 24 24', markup: '<line x1="6" y1="12" x2="18" y2="12" /> <line x1="12" y1="6" x2="12" y2="18" />' },
  'invert-colors': {
    viewBox: '0 0 64 64',
    markup: '<path d="M32 6a26 26 0 1 0 0 52V6z" fill="currentColor" /> <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="4" />'
  },
  'label-auto': {
    viewBox: '0 0 64 64',
    markup:
      '<rect x="18" y="18" width="28" height="28" rx="4" fill="none" stroke="currentColor" stroke-width="4"/> <path d="M32 6v10M32 48v10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/> <path d="M6 32h10M48 32h10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
  },
  'label-away': { viewBox: '0 0 24 24', markup: '<path d="M12 5v14" /> <path d="M7 10l-3 3 3 3" /> <path d="M17 10l3 3-3 3" />' },
  'label-closer': {
    viewBox: '0 0 64 64',
    markup:
      '<path d="M18 20L28 32L18 44" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/> <path d="M46 20L36 32L46 44" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/> <path d="M32 18v28" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
  },
  language: {
    viewBox: '0 0 64 64',
    markup:
      '<circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="4"/> <path d="M32 8c8 7 12 16 12 24s-4 17-12 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/> <path d="M32 8c-8 7-12 16-12 24s4 17 12 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/> <path d="M12 26h40M12 38h40" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
  },
  'line-dashed': { viewBox: '0 0 24 24', markup: '<line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="4 3"/>' },
  'line-dotted': { viewBox: '0 0 24 24', markup: '<line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="1 3"/>' },
  'line-solid': { viewBox: '0 0 24 24', markup: '<line x1="4" y1="12" x2="20" y2="12"/>' },
  measure: {
    viewBox: '0 0 315.577 315.577',
    markup: `<g fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" stroke-linejoin="round">
  <g transform="matrix(1.2726273,0,0,1.1704081,0.32400103,-10.70947)">
    <path d="M 246.46247,110.32815 203.70955,48.640329 c -1.24795,-1.800675 -3.45252,-2.277823 -4.92639,-1.07024 l -13.75091,11.26663 C 146.74547,7.172456 81.373969,-6.1145871 37.72155,29.651447 -5.9277688,65.414948 -12.202837,137.40467 22.922549,191.65919 L 9.16853,202.92836 c -1.4707639,1.20506 -1.6565793,3.64074 -0.4086209,5.44142 l 42.7529199,61.68781 c 1.245334,1.79688 3.4499,2.27405 4.920662,1.06899 L 246.04813,115.76831 c 1.47693,-1.20315 1.66231,-3.63949 0.41434,-5.44016 z m -146.11045,17.36237 c -1.123985,-2.25218 -0.839838,-4.95227 0.89413,-6.37297 1.73395,-1.42069 4.20557,-0.9785 5.88378,0.81958 z m 12.17177,-9.97277 c -4.19841,-5.38544 -11.11063,-6.75024 -15.792289,-2.91436 -4.678609,3.83335 -5.37725,11.434 -1.770234,17.30398 l -25.20743,20.65337 C 56.766939,130.28859 59.923195,101.57056 77.550749,87.127649 95.178299,72.68475 121.44361,77.296592 137.72812,97.066897 Z M 143.03836,92.716017 C 124.2463,69.383608 93.583496,63.778242 73.036096,80.613482 52.48867,97.448748 48.998671,131.03676 64.44668,157.10909 L 27.949934,187.01222 C -4.4603652,136.3811 1.602737,69.45811 42.233118,36.168144 82.863494,2.8781777 143.70334,14.98511 179.53511,62.812882 Z m 87.62642,25.449183 c -0.0132,-0.0189 -0.0144,-0.0416 -0.0303,-0.0643 l -7.41956,-10.7056 c -0.87305,-1.25973 -2.41693,-1.59612 -3.448,-0.75132 -1.03419,0.84734 -1.15925,2.55117 -0.2862,3.81088 l 7.41955,10.7056 c 0.0132,0.0189 0.0296,0.029 0.0487,0.0493 l -8.92681,7.31404 c -0.0132,-0.0189 -0.0175,-0.0391 -0.0334,-0.0617 l -7.41955,-10.7056 c -0.87305,-1.25973 -2.41383,-1.59864 -3.44802,-0.75131 -1.03108,0.84481 -1.15613,2.54862 -0.28309,3.80834 l 7.41956,10.70561 c 0.0132,0.0188 0.0296,0.029 0.0455,0.0517 l -8.92989,7.31659 c -0.0102,-0.0216 -0.0143,-0.0415 -0.0301,-0.0642 l -7.41956,-10.70562 c -0.87305,-1.25972 -2.41383,-1.59863 -3.44801,-0.75129 -1.03108,0.84481 -1.15924,2.55115 -0.28619,3.81088 l 7.41955,10.7056 c 0.0127,0.0193 0.0328,0.0266 0.0487,0.0493 l -8.92988,7.3166 c -0.0127,-0.0193 -0.0142,-0.0416 -0.0298,-0.0644 l -7.41955,-10.7056 c -0.87305,-1.25972 -2.41694,-1.59613 -3.44801,-0.75131 -1.03108,0.84482 -1.15924,2.55116 -0.28619,3.81088 l 7.41954,10.7056 c 0.0128,0.0193 0.0328,0.0266 0.0487,0.0493 l -8.92988,7.3166 c -0.0128,-0.0193 -0.0142,-0.0416 -0.0298,-0.0644 l -7.41956,-10.70561 c -0.87306,-1.25971 -2.41693,-1.59609 -3.44802,-0.7513 -1.03417,0.84734 -1.15924,2.55116 -0.28619,3.81088 l 7.41955,10.70561 c 0.0127,0.0193 0.0298,0.0288 0.0487,0.0493 l -8.92989,7.31659 c -0.0128,-0.0193 -0.017,-0.0394 -0.0328,-0.0622 l -7.41955,-10.70561 c -0.87305,-1.25972 -2.41384,-1.59862 -3.44493,-0.75382 -1.03417,0.84735 -1.15924,2.55115 -0.28619,3.81086 l 7.41956,10.70563 c 0.0127,0.0193 0.0298,0.0288 0.0459,0.0514 l -8.92679,7.31406 c -0.0102,-0.0217 -0.0142,-0.0417 -0.0298,-0.0644 l -7.41956,-10.70561 c -0.87304,-1.25972 -2.41382,-1.59864 -3.44802,-0.75131 -1.03108,0.84482 -1.15923,2.55116 -0.28619,3.81088 l 7.41956,10.70561 c 0.0127,0.0193 0.0328,0.0266 0.0487,0.0493 l -8.92989,7.31657 c -0.0127,-0.0193 -0.0142,-0.0416 -0.03,-0.0643 l -7.41955,-10.7056 c -0.87307,-1.25971 -2.41694,-1.59612 -3.44804,-0.7513 -1.03108,0.84481 -1.15922,2.55115 -0.28618,3.81085 l 7.41956,10.70564 c 0.0127,0.0193 0.0328,0.0266 0.0487,0.0493 l -8.9299,7.31661 c -0.0127,-0.0193 -0.0142,-0.0417 -0.0298,-0.0644 l -7.41954,-10.70563 c -0.87307,-1.25971 -2.41693,-1.5961 -3.44803,-0.75128 -1.03417,0.84734 -1.15924,2.55113 -0.28617,3.81087 l 7.41954,10.7056 c 0.0128,0.0193 0.0298,0.029 0.0487,0.0493 l -8.92989,7.3166 c -0.0127,-0.0193 -0.017,-0.0394 -0.0327,-0.0621 L 58.82349,242.08984 c -0.873052,-1.25971 -2.413823,-1.59864 -3.444922,-0.75383 -1.034183,0.84736 -1.15924,2.55115 -0.286187,3.81086 l 7.419562,10.70563 c 0.01276,0.0193 0.0299,0.0288 0.04588,0.0515 L 54.571598,262.44652 16.333335,207.27285 200.63187,56.270246 238.87013,111.44392 Z" />
  </g>
</g>`
  },
  'menu-dots': {
    viewBox: '0 0 24 24',
    markup:
      '<line x1="5" y1="7" x2="19" y2="7"/> <circle cx="13" cy="7" r="1.8" class="icon-fill"/> <line x1="5" y1="12" x2="19" y2="12"/> <circle cx="10" cy="12" r="1.8" class="icon-fill"/> <line x1="5" y1="17" x2="19" y2="17"/> <circle cx="16" cy="17" r="1.8" class="icon-fill"/>'
  },
  'menu-lines': { viewBox: '0 0 24 24', markup: '<path d="M4 7h16"/> <path d="M4 12h16"/> <path d="M4 17h16"/>' },
  'move-select': { viewBox: '0 0 24 24', markup: MULTI_MOVE_PATH },
  'multi-move': { viewBox: '0 0 24 24', markup: MULTI_MOVE_PATH },
  'multi-clone-copy': { viewBox: MULTI_CLONE_ICON_COPY.viewBox, markup: MULTI_CLONE_ICON_COPY.markup },
  'nav-next': { viewBox: '0 0 24 24', markup: '<path d="M9 18l6-6-6-6"/>' },
  'nav-prev': { viewBox: '0 0 24 24', markup: '<path d="M15 18l-6-6 6-6"/>' },
  'point-hollow': { viewBox: '0 0 24 24', markup: POINT_HOLLOW_MARKUP },
  'ray-left-point': { viewBox: '0 0 24 24', markup: '<line x1="4" y1="12" x2="18" y2="12"/> <circle cx="18" cy="12" r="1.7" class="icon-fill"/>' },
  'ray-right-point': { viewBox: '0 0 24 24', markup: '<circle cx="6" cy="12" r="1.7" class="icon-fill"/> <line x1="6" y1="12" x2="20" y2="12"/>' },
  'ray-segment': { viewBox: '0 0 24 24', markup: '<circle cx="7" cy="12" r="1.8" class="icon-fill"/> <circle cx="17" cy="12" r="1.8" class="icon-fill"/> <line x1="7" y1="12" x2="17" y2="12"/>' },
  redo: { viewBox: '0 0 24 24', markup: '<path d="m14 8 5 4-5 4"/><path d="M19 12H10a5 5 0 1 0 0 10h2"/>' },
  'save-image': { viewBox: '0 0 24 24', markup: '<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" /> <path d="M12 8v8" /> <path d="m8.5 12.5 3.5 3.5 3.5-3.5" />' },
  settings: {
    viewBox: '0 0 24 24',
    markup:
      '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/> <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/> <g> <rect x="11" y="1" width="2" height="4" fill="currentColor"/> <rect x="11" y="19" width="2" height="4" fill="currentColor"/> <rect x="1" y="11" width="4" height="2" fill="currentColor"/> <rect x="19" y="11" width="4" height="2" fill="currentColor"/> <rect x="11" y="1" width="2" height="4" transform="rotate(45 12 12)" fill="currentColor"/> <rect x="11" y="1" width="2" height="4" transform="rotate(135 12 12)" fill="currentColor"/> <rect x="11" y="1" width="2" height="4" transform="rotate(225 12 12)" fill="currentColor"/> <rect x="11" y="1" width="2" height="4" transform="rotate(315 12 12)" fill="currentColor"/> </g>'
  },
  'theme-dark': { viewBox: '0 0 24 24', markup: '<path d="M21 12a9 9 0 1 1-9-9 6 6 0 0 0 9 9Z"/>' },
  'theme-light': { viewBox: '0 0 24 24', markup: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>' },
  'tick-1': { viewBox: '0 0 24 24', markup: TICK1_MARKUP },
  undo: { viewBox: '0 0 24 24', markup: '<path d="M10 8 5 12l5 4"/><path d="M5 12h9a5 5 0 1 1 0 10h-2"/>' },
  'view-edges': { viewBox: '0 0 24 24', markup: VIEW_EDGES_MARKUP },
  'view-vertices': { viewBox: '0 0 24 24', markup: VIEW_VERTICES_MARKUP }
} as const;

export const TOOL_ICON_DEFS = {
  modeMove: { icon: MOVE_SELECT_PATH, viewBox: '0 0 24 24' },
  modeMultiselect: {
    icon:
      '<rect x="3" y="3" width="8" height="8" rx="1" stroke-dasharray="2 2"/><rect x="13" y="3" width="8" height="8" rx="1" stroke-dasharray="2 2"/><rect x="3" y="13" width="8" height="8" rx="1" stroke-dasharray="2 2"/><rect x="13" y="13" width="8" height="8" rx="1" stroke-dasharray="2 2"/>',
    viewBox: '0 0 24 24'
  },
  modeLabel: {
    icon: '<path d="M5 7h9l5 5-5 5H5V7Z"/><path d="M8 11h4" /><path d="M8 14h3" />',
    viewBox: '0 0 24 24'
  },
  modeAdd: { icon: '<circle cx="12" cy="12" r="4.5" class="icon-fill"/>', viewBox: '0 0 24 24' },
  modeIntersection: {
    icon:
      '<path d="M20 44L44 20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M20 20L44 44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="4" fill="currentColor"/>',
    viewBox: '0 0 64 64'
  },
  modeSegment: {
    icon: '<circle cx="6" cy="12" r="2.2" class="icon-fill"/><circle cx="18" cy="12" r="2.2" class="icon-fill"/><line x1="6" y1="12" x2="18" y2="12"/>',
    viewBox: '0 0 24 24'
  },
  modeParallel: {
    icon: '<line x1="5" y1="8" x2="19" y2="8"/><line x1="5" y1="16" x2="19" y2="16"/>',
    viewBox: '0 0 24 24'
  },
  modePerpendicular: {
    icon: '<line x1="5" y1="12" x2="19" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/>',
    viewBox: '0 0 24 24'
  },
  modeCircle: {
    icon: '<circle cx="12" cy="12" r="8"/><line x1="12" y1="12" x2="18" y2="12"/><circle cx="18" cy="12" r="1.4" class="icon-fill"/>',
    viewBox: '0 0 24 24'
  },
  modeCircleThree: {
    icon:
      '<ellipse cx="12" cy="12" rx="8.5" ry="7.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="6.5" r="2.2" class="icon-fill" stroke="currentColor" stroke-width="0.8"/><circle cx="16.5" cy="6" r="2.2" class="icon-fill" stroke="currentColor" stroke-width="0.8"/><circle cx="17.5" cy="16" r="2.2" class="icon-fill" stroke="currentColor" stroke-width="0.8"/>',
    viewBox: '0 0 24 24'
  },
  modeTriangleUp: { icon: '<path d="M4 18h16L12 5Z"/>', viewBox: '0 0 24 24' },
  modeSquare: { icon: '<rect x="5" y="5" width="14" height="14"/>', viewBox: '0 0 24 24' },
  modeNgon: {
    icon:
      '<polygon points="20,15.5 15.5,20 8.5,20 4,15.5 4,8.5 8.5,4 15.5,4 20,8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    viewBox: '0 0 24 24'
  },
  modePolygon: {
    icon:
      '<polygon points="5,4 19,7 16,19 5,15"/><circle cx="5" cy="4" r="1.2" class="icon-fill"/><circle cx="19" cy="7" r="1.2" class="icon-fill"/><circle cx="16" cy="19" r="1.2" class="icon-fill"/><circle cx="5" cy="15" r="1.2" class="icon-fill"/>',
    viewBox: '0 0 24 24'
  },
  modeAngle: {
    icon:
      '<line x1="14" y1="54" x2="50" y2="54" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><line x1="14" y1="54" x2="42" y2="18" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><path d="M20 46 A12 12 0 0 1 32 54" fill="none" stroke="currentColor" stroke-width="3" />',
    viewBox: '0 0 64 64'
  },
  modeBisector: {
    icon: '<line x1="6" y1="18" x2="20" y2="18" /><line x1="6" y1="18" x2="14" y2="6" /><line x1="6" y1="18" x2="20" y2="10" />',
    viewBox: '0 0 24 24'
  },
  modeMidpoint: {
    icon:
      '<circle cx="6" cy="12" r="1.5" class="icon-fill"/><circle cx="18" cy="12" r="1.5" class="icon-fill"/><circle cx="12" cy="12" r="2.5" class="icon-fill"/><circle cx="12" cy="12" r="1" fill="var(--bg)" stroke="none"/>',
    viewBox: '0 0 24 24'
  },
  modeSymmetric: {
    icon:
      '<line x1="12" y1="4" x2="12" y2="20" /><circle cx="7.5" cy="10" r="1.7" class="icon-fill"/><circle cx="16.5" cy="14" r="1.7" class="icon-fill"/><path d="M7.5 10 16.5 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    viewBox: '0 0 24 24'
  },
  modeTangent: {
    icon:
      '<circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="2" y1="17" x2="22" y2="17" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" transform="rotate(-25 12 12)"/>',
    viewBox: '0 0 24 24'
  },
  modePerpBisector: {
    icon:
      '<circle cx="7" cy="12" r="2" class="icon-fill"/><circle cx="17" cy="12" r="2" class="icon-fill"/><circle cx="12" cy="12" r="2.5" class="icon-fill"/><circle cx="12" cy="12" r="1" fill="var(--bg)" stroke="none"/><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="1.5"/>',
    viewBox: '0 0 24 24'
  },
  modeHandwriting: {
    icon:
      '<path d="M5.5 18.5 4 20l1.5-.1L9 19l10.5-10.5a1.6 1.6 0 0 0 0-2.2L17.7 4a1.6 1.6 0 0 0-2.2 0L5 14.5l.5 4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 5.5 18.5 8.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>',
    viewBox: '0 0 24 24'
  }
} as const;
