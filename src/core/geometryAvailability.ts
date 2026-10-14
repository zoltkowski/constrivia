/** Whether a runtime geometry object is available for display and interaction. */
export function isGeometryAvailable(value: { geometryValid?: boolean } | null | undefined): boolean {
  return value?.geometryValid !== false;
}
