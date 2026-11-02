// Generic, list-shape-agnostic reorder helpers for drag-and-drop. Kept free
// of any layer-domain knowledge (that lives in vectorLayers.js) so these stay
// trivial to unit test.

// Moves the item at fromIndex to toIndex, clamping toIndex into range.
// Returns the same array reference if there is nothing to do, otherwise a
// new array (never mutates the input).
export function moveItem(list, fromIndex, toIndex) {
  if (!Array.isArray(list) || fromIndex < 0 || fromIndex >= list.length) return list;
  const clamped = Math.max(0, Math.min(toIndex, list.length - 1));
  if (clamped === fromIndex) return list;
  const next = list.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(clamped, 0, item);
  return next;
}

// Reorders `fromName` to sit at `toName`'s position, but only relative to
// other members of `groupNames`; every entry outside the group keeps its
// exact slot in the returned array. This lets a flat "master" order array
// back map draw-order while the panel UI only lets a row drag within its own
// group section (Boundaries rows only reorder among themselves, same for
// Tectonics), which matches the grouped panel layout.
//
// Returns the same `order` reference, unchanged, if fromName/toName are not
// both members of groupNames (defensive no-op, never throws).
export function reorderWithinGroup(order, groupNames, fromName, toName) {
  if (!Array.isArray(order) || !Array.isArray(groupNames)) return order;
  const groupSet = new Set(groupNames);
  if (fromName === toName || !groupSet.has(fromName) || !groupSet.has(toName)) return order;

  const groupSeq = order.filter((name) => groupSet.has(name));
  const fromIdx = groupSeq.indexOf(fromName);
  const toIdx = groupSeq.indexOf(toName);
  if (fromIdx === -1 || toIdx === -1) return order;

  const reordered = moveItem(groupSeq, fromIdx, toIdx);
  let cursor = 0;
  return order.map((name) => (groupSet.has(name) ? reordered[cursor++] : name));
}
