import { uiRefs } from './uiRefs';

// Used by UI initialization.
export function initUi() {
  // Primary inputs / toolbar buttons
  uiRefs.strokeColorInput = document.getElementById('strokeColor') as HTMLInputElement | null;
  uiRefs.modeAddBtn = document.getElementById('modeAdd') as HTMLButtonElement | null;
  uiRefs.modeMoveBtn = document.getElementById('modeMove') as HTMLButtonElement | null;
  uiRefs.modeMultiselectBtn = document.getElementById('modeMultiselect') as HTMLButtonElement | null;
  uiRefs.modeSegmentBtn = document.getElementById('modeSegment') as HTMLButtonElement | null;
  uiRefs.modeParallelBtn = document.getElementById('modeParallel') as HTMLButtonElement | null;
  uiRefs.modePerpBtn = document.getElementById('modePerp') as HTMLButtonElement | null;
  uiRefs.modeCircleThreeBtn = document.getElementById('modeCircleThree') as HTMLButtonElement | null;
  uiRefs.modeTriangleBtn = document.getElementById('modeTriangle') as HTMLButtonElement | null;
  uiRefs.modeSquareBtn = document.getElementById('modeSquare') as HTMLButtonElement | null;
}
