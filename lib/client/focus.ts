/**
 * Whether to put the cursor in a text field by itself (when a drawer, dialog or form opens, or a row is added).
 * Not on touch devices: that would pop the keyboard up before the person has picked a field. Tapping a field, or
 * the value you want to change, still focuses it.
 */
export function canAutoFocus(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return !window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}
