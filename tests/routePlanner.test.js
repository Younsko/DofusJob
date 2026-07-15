import { describe, expect, it } from 'vitest';
import {
  buildRoute,
  exportRouteText,
  getDefaultSelection,
  manhattan,
  travelCommand,
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
    expect(leg.cost).toBe(5);
    expect(leg.walkCost).toBe(2);
    expect(leg.zaapCount).toBe(1);
    expect(leg.originZaap).toBeUndefined();
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

  it('chooses the most efficient first map when the start is free', () => {
    const plan = buildRoute({
      resources,
      spots,
      zaaps,
      selectedResourceIds: ['iron', 'gold', 'ash'],
      enabledJobs: ['miner', 'lumberjack'],
      levels: { miner: 200, lumberjack: 200 },
      start: null,
      maxStops: 1
    });

    expect(plan.route[0].id).toBe('far-rich');
    expect(plan.route[0].travel.mode).toBe('start');
    expect(plan.route[0].travel.seconds).toBe(0);
  });

  it('prefers a mixed dense map when its combined XP per minute beats one isolated node', () => {
    const mixedResources = [
      { id: 'a', name: 'Bois A', job: 'lumberjack', level: 56 },
      { id: 'b', name: 'Bois B', job: 'lumberjack', level: 52 },
      { id: 'c', name: 'Bois C', job: 'lumberjack', level: 48 },
      { id: 'solo', name: 'Bois seul', job: 'lumberjack', level: 60 }
    ];
    const plan = buildRoute({
      resources: mixedResources,
      spots: [
        { id: 'mixed', name: 'Bosquet mixte', x: 2, y: 0, resources: { a: 1, b: 1, c: 1 } },
        { id: 'solo', name: 'Arbre isolé', x: 2, y: 1, resources: { solo: 1 } }
      ],
      zaaps: [],
      enabledJobs: ['lumberjack'],
      levels: { lumberjack: 80 },
      objective: 'xp',
      start: { x: 0, y: 0 },
      maxStops: 1
    });

    expect(plan.route[0].id).toBe('mixed');
    expect(plan.route[0].totalXp).toBeGreaterThan(40);
  });

  it('selects current tier resources by default', () => {
    const selected = getDefaultSelection(resources, { miner: 180, lumberjack: 1 }, ['miner']);
    expect(selected).toContain('gold');
    expect(selected).toContain('iron');
    expect(selected).not.toContain('ash');
  });

  it('exports route steps as copy-ready travel commands', () => {
    const plan = buildRoute({
      resources,
      spots,
      zaaps,
      selectedResourceIds: ['iron', 'gold', 'ash'],
      levels: { miner: 200, lumberjack: 200 },
      start: { x: 0, y: 0 },
      maxStops: 1
    });

    const text = exportRouteText(plan);

    expect(travelCommand({ x: 3, y: -2 })).toBe('/travel 3 -2');
    expect(text).toContain('/travel 0 0');
    expect(text).toContain('/travel 50 0');
    expect(text).toContain('Zaap: Lointain [48, 0]');
  });
});
