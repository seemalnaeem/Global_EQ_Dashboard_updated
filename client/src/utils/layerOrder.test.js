import { describe, it, expect } from 'vitest';
import { moveItem, reorderWithinGroup } from './layerOrder.js';

describe('moveItem', () => {
  it('moves an item from one index to another', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('clamps an out-of-range target index instead of throwing', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
  });

  it('returns the same reference when there is nothing to move', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 0, 0)).toBe(list);
    expect(moveItem(list, 5, 0)).toBe(list);
  });
});

describe('reorderWithinGroup', () => {
  const order = ['fault_lines', 'tectonic_boundaries', 'national_boundary', 'tehsil_boundary'];
  const boundaries = ['national_boundary', 'provincial_boundary', 'district_boundary', 'tehsil_boundary'];

  it('reorders two members of a group, leaving non-group members in place', () => {
    const next = reorderWithinGroup(order, boundaries, 'tehsil_boundary', 'national_boundary');
    expect(next).toEqual(['fault_lines', 'tectonic_boundaries', 'tehsil_boundary', 'national_boundary']);
  });

  it('is a no-op when either name is outside the group', () => {
    expect(reorderWithinGroup(order, boundaries, 'fault_lines', 'national_boundary')).toBe(order);
    expect(reorderWithinGroup(order, boundaries, 'national_boundary', 'fault_lines')).toBe(order);
  });

  it('is a no-op when moving a name onto itself', () => {
    expect(reorderWithinGroup(order, boundaries, 'national_boundary', 'national_boundary')).toBe(order);
  });

  it('never throws on an unknown name', () => {
    expect(reorderWithinGroup(order, boundaries, 'ghost_layer', 'national_boundary')).toBe(order);
  });
});
