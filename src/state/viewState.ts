export type ThemeName = 'dark' | 'light';

export const viewState = {
  currentTheme: 'dark' as ThemeName,
  showHidden: false as boolean,
  showMeasurements: false as boolean,
  zoomMenuOpen: false as boolean,
  zoomMenuBtn: null as HTMLButtonElement | null,
  zoomMenuContainer: null as HTMLElement | null,
  showHiddenBtn: null as HTMLButtonElement | null,
  showMeasurementsBtn: null as HTMLButtonElement | null,
  viewModeOpen: false as boolean,
  rayModeOpen: false as boolean,
  themeDarkBtn: null as HTMLButtonElement | null
};

export default viewState;
