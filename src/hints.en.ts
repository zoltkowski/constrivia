export const HINTS_EN = {
  tools: {
    select: 'Click an object to select it; click again to deselect.',
    multiselect: 'Drag to select multiple objects or click them one by one.',
    label: 'Click an object to add or edit its label.',
    point: 'Click anywhere on the canvas to add a point.',
    segment: 'Click the first point, then the second to create a segment.',
    parallel: 'Choose a point, then click a reference line to create a parallel line.',
    perpendicular: 'Choose a point, then click a reference line to create a perpendicular.',
    circle3: 'Click three distinct points on the circumference to draw a circle.',
      circle: 'Click the center point, then a second point to set the radius and draw a circle.',
    triangle: 'Click a start point and drag to set triangle size.',
    square: 'Click a start point and a second point to set side direction and length.',
    polygon: 'Click successive vertices; finish with a double-click or clicking the first vertex.',
    angle: 'Click a point on the first arm, then the vertex, then a point on the second arm.',
    bisector: 'Click two arms (segments) or an existing angle — a bisector will be created.',
    midpoint: 'Select two endpoints or click a segment to add its midpoint.',
    symmetric: 'Click the source point, then the symmetry axis (point, segment or line).',
    tangent: 'Click a point and a circle — the tool will create the tangent at that point.',
    perpBisector: 'Select two points — the perpendicular bisector will be created.',
    ngon: 'Choose number of sides (n) then click to place an n-gon.',
    handwriting: 'Draw freehand; the tool converts the sketch into geometry objects.'
  },
  menu: {
    clearAll: 'Removes all objects from the current document. This action is irreversible.',
    showHidden: 'Toggles visibility of objects marked as hidden (helper points, helper lines).',
    showMeasurements: 'Show/hide measurement labels (lengths and angles).',
    copyImage: 'Copy the canvas image to clipboard as PNG (if supported by the browser).',
    saveImage: 'Save the current view as a PNG file.',
    invertColors: 'Temporarily invert UI and drawing colors, useful for export.',
    debug: 'Open the panel with a list of all objects and their properties (for diagnostics).',
    settings: 'Open the configuration panel — change layout, appearance and measurement precision.',
    help: 'Open the help page with instructions and tool descriptions.',
    style: 'Open the style menu — choose color, width and line type, and point display.'
  },
  style: {
    pointColor: 'Set the point color for the selected element.',
    pointSize: 'Adjust the rendered size of points.',
    lineColor: 'Set the color for a line or segment.',
    lineWidth: 'Adjust the thickness of lines/segments.',
    lineStyle: 'Choose stroke style: solid, dashed or dotted.',
    angleRadius: 'Change the radius used to render angle markers.',
    fill: 'If supported, choose a fill color and opacity for the object.'
  },
  config: {
    generalHints: 'Show hints — when enabled, the app displays short contextual tips.',
    buttons: 'The button configurator lets you reorder and group toolbar tools.',
    appearance: 'Change theme, colors, sizes and preview options here.',
    precision: 'Set the display precision for lengths and angles (decimal places).',
    importExport: 'Export or import configuration to migrate settings between installs.'
  }
};

export default HINTS_EN;
