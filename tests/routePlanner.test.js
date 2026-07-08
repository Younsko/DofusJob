import { describe, expect, it } from 'vitest';
import {
  buildRoute,
  getDefaultSelection,
  manhattan,
  travelBetween
} from '../src/lib/routePlanner.js';

const resources = [
  { id: 'iron', name: 'Fer', job: 'miner', level: 1 },
  { id: 'gold', name: 'Or', job: 'miner', level: 160 },
  { id: 'ash', name: 'Frene', job: 'lumberjack', level: 1 }
];

const spots = [
  {
    id: 'near-low',
    name: 'Spot bas proche',
    x: 1,
    y: 0,
    quality: 0.7,
    resources: { iron: 3, ash: 2 }
  },
  {
    id: 'far-rich',
    name: 'Spot riche lointain',
    x: 50,
    y: 0,
    quality: 0.95,
    resources: { gold: 9 }
  }
];

const zaaps = [
  { id: 'start', name: 'Depart', x: 0, y: 0 },
  { id: 'far', name: 'Lointain', x: 48, y: 0 }
];

describe('route planner', () => {
  it('calculates grid distance with Dofus coordinates', () => {
    expect(manhattan({ x: -2, y: 4 }, { x: 3, y: -1 })).toBe(10);
  });

  it('uses zaaps when they reduce travel cost', () => {
    const leg = travelBetween({ x: 0, y: 0 }, { x: 50, y: 0 }, zaaps);
    expect(leg.mode).toBe('zaap');
    expect(leg.cost).toBeLessThan(50);
    expect(leg.zaapCount).toBe(1);
  });

  it('keeps direct walking for nearby targets', () => {
    const leg = travelBetween({ x: 0, y: 0 }, { x: 2, y: 1 }, zaaps);
    expect(leg.mode).toBe('walk');
    expect(leg.cost).toBe(3);
  });

  it('prioritizes high level selected resources when the level allows it', () => {
    const plan = buildRoute({
      resources,
      spots,
      zaaps,
      selectedResourceIds: ['iron', 'gold', 'ash'],
      levels: { miner: 200, lumberjack: 200 },
      start: { x: 0, y: 0 },
      maxStops: 1
    });

    expect(plan.route[0].id).toBe('far-rich');
  });

  it('filters resources above the player level', () => {
    const plan = buildRoute({
      resources,
      spots,
      zaaps,
      selectedResourceIds: ['iron', 'gold', 'ash'],
      levels: { miner: 20, lumberjack: 20 },
      start: { x: 0, y: 0 },
      maxStops: 3
    });

    expect(plan.route.map((step) => step.id)).not.toContain('far-rich');
  });

  it('selects current tier resources by default', () => {
    const selected = getDefaultSelection(resources, { miner: 180, lumberjack: 1 }, ['miner']);
    expect(selected).toContain('gold');
    expect(selected).toContain('iron');
    expect(selected).not.toContain('ash');
  });
});

