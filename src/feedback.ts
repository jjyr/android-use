import { publicObservation, type Observation } from "./types.js";

/** Model feedback only. The SDK's full observation and IDs remain unchanged. */
export function compactObservation(o: Observation, observationsInCall = 1) {
  const full = publicObservation(o);
  const elements = o.elements.filter(e => e.text || e.description || e.resourceId ||
    e.clickable || e.longClickable || e.editable || e.focused || e.scrollable || e.password);
  return {
    ...full,
    elements: elements.map(e => ({
      id: e.id, bounds: e.bounds,
      ...(e.text ? { text: e.text } : {}),
      ...(e.description ? { description: e.description } : {}),
      ...(e.resourceId ? { resourceId: e.resourceId } : {}),
      ...(e.clickable ? { clickable: true } : {}),
      ...(e.longClickable ? { longClickable: true } : {}),
      ...(e.editable ? { editable: true } : {}),
      ...(e.focused ? { focused: true } : {}),
      ...(!e.enabled ? { enabled: false } : {}),
      ...(e.password ? { password: true } : {}),
      ...(e.scrollable ? { scrollable: true } : {}),
    })),
    feedback: { format: "compact", totalElements: o.elements.length,
      omittedElements: o.elements.length - elements.length, observationsInCall },
  };
}
