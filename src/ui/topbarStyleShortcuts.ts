type StyleContext = 'ink' | 'point' | 'line' | 'circle' | 'polygon' | 'angle' | 'solid' | 'group';

const vertices = '#styleVerticesGroup button';
const colors = '#styleColorRow [data-slot]';
const shortcuts: Record<StyleContext, string[]> = {
  ink: [colors, '#highlighterBtn'],
  point: ['#pointPositionLockBtn', colors],
  line: ['#rayLeftOption, #rayRightOption', vertices, '#lengthLockBtn', colors],
  circle: ['#styleCircleGroup button', colors, '#fillToggleBtn'],
  polygon: [vertices, '#polygonLockToggleBtn, #polygonAngleLockBtn, #lengthLockBtn', colors],
  angle: ['#exteriorAngleBtn, #styleArcRow .arc-count-btn, #rightAngleBtn', colors],
  solid: [vertices, '#polygonLockToggleBtn, #solidTiltLockBtn, #solidHeightLockBtn, #lengthLockBtn', colors],
  group: ['#ungroupObjectsBtn']
};

export function createTopbarStyleShortcuts(slot: HTMLElement, menu: HTMLElement) {
  let context: StyleContext | null = null;
  let groups: { element: HTMLDivElement; sources: HTMLButtonElement[]; buttons: HTMLButtonElement[] }[] = [];

  function fit() {
    let remaining = slot.clientWidth;
    const gap = parseFloat(getComputedStyle(slot).columnGap);
    for (const group of groups) group.element.hidden = false;
    const widths = groups.map(group => group.element.getBoundingClientRect().width + gap);
    groups.forEach((group, index) => {
      remaining -= widths[index];
      group.element.hidden = remaining < 0;
      for (const source of group.sources) {
        source.classList.toggle('in-topbar-style-shortcuts', !group.element.hidden);
      }
    });
  }

  function sync() {
    const sourceGroups = context && menu.style.display !== 'none'
      ? shortcuts[context].flatMap(selector => {
        const sources = Array.from(menu.querySelectorAll<HTMLButtonElement>(selector))
          .filter(button => !button.hidden && button.style.display !== 'none');
        return selector === colors ? sources.map(button => [button]) : sources.length ? [sources] : [];
      }) : [];
    if (sourceGroups.length !== groups.length || sourceGroups.some((sources, index) =>
      sources.length !== groups[index].sources.length ||
      sources.some((source, buttonIndex) => source !== groups[index].sources[buttonIndex])
    )) {
      for (const group of groups) {
        for (const source of group.sources) source.classList.remove('in-topbar-style-shortcuts');
      }
      groups = sourceGroups.map(sources => {
        const element = document.createElement('div');
        element.className = 'topbar-style-group';
        const buttons = sources.map(source => {
          const button = document.createElement('button');
          button.type = 'button';
          button.addEventListener('click', () => source.click());
          element.append(button);
          return button;
        });
        return { element, sources, buttons };
      });
      slot.replaceChildren(...groups.map(group => group.element));
    }
    for (const { sources, buttons } of groups) {
      sources.forEach((source, index) => {
        const button = buttons[index];
        button.className = Array.from(source.classList).filter(name => name !== 'in-topbar-style-shortcuts').join(' ');
        button.disabled = source.disabled;
        button.title = source.title;
        button.setAttribute('aria-label', source.getAttribute('aria-label') || source.title);
        const pressed = source.getAttribute('aria-pressed');
        if (pressed !== null || source.matches('.color-btn, .arc-count-btn') ||
            source.id.startsWith('ray') || source.id.startsWith('view') || source.id === 'rightAngleBtn') {
          button.setAttribute('aria-pressed', pressed ?? String(source.classList.contains('active')));
        }
        button.style.background = source.style.background;
        if (button.innerHTML !== source.innerHTML) button.innerHTML = source.innerHTML;
      });
    }
    fit();
  }

  new ResizeObserver(fit).observe(slot);
  new MutationObserver(sync).observe(menu, { attributes: true, childList: true, subtree: true, characterData: true });
  return (next: StyleContext | null) => {
    if (next === context) return;
    context = next;
    sync();
  };
}
