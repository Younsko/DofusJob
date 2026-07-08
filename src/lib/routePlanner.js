const ZAAP_FLAT_COST = 3;
const DIRECT_WALK_BIAS = 0.5;

export function coordLabel(point) {
  return `[${point.x}, ${point.y}]`;
}

export function travelCommand(point) {
  return `/travel ${point.x} ${point.y}`;
}

export function manhattan(a, b) {
  return Math.abs(Number(a.x) - Number(b.x)) + Math.abs(Number(a.y) - Number(b.y));
}

export function clampLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(200, Math.max(1, Math.round(numeric)));
}

export function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

export function nearestZaap(point, zaaps) {
  return zaaps
    .map((zaap) => ({ ...zaap, distance: manhattan(point, zaap) }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))[0];
}

export function travelBetween(from, target, zaaps, options = {}) {
  const preferZaaps = options.preferZaaps !== false;
  const directCost = manhattan(from, target);

  if (!preferZaaps || !zaaps.length) {
    return {
      mode: 'walk',
      cost: directCost,
      walkCost: directCost,
      zaapCount: 0,
      from,
      target,
      segments: [{ mode: 'walk', from, to: target, cost: directCost }]
    };
  }

  const originZaap = nearestZaap(from, zaaps);
  const targetZaap = nearestZaap(target, zaaps);
  const walkToOrigin = manhattan(from, originZaap);
  const walkFromTarget = manhattan(targetZaap, target);
  const viaZaapCost = walkToOrigin + ZAAP_FLAT_COST + walkFromTarget;

  if (originZaap.id !== targetZaap.id && viaZaapCost + DIRECT_WALK_BIAS < directCost) {
    const segments = [];
    if (walkToOrigin > 0) {
      segments.push({ mode: 'walk', from, to: originZaap, cost: walkToOrigin });
    }
    segments.push({ mode: 'zaap', from: originZaap, to: targetZaap, cost: ZAAP_FLAT_COST });
    if (walkFromTarget > 0) {
      segments.push({ mode: 'walk', from: targetZaap, to: target, cost: walkFromTarget });
    }

    return {
      mode: 'zaap',
      cost: viaZaapCost,
      walkCost: walkToOrigin + walkFromTarget,
      zaapCount: 1,
      originZaap,
      targetZaap,
      from,
      target,
      segments
    };
  }

  return {
    mode: 'walk',
    cost: directCost,
    walkCost: directCost,
    zaapCount: 0,
    from,
    target,
    segments: [{ mode: 'walk', from, to: target, cost: directCost }]
  };
}

export function getSpotPayload(spot, resourceMap, selectedIds, levels, priorityMode, priorities) {
  const selected = [];
  const jobs = new Set();

  for (const [resourceId, quantity] of Object.entries(spot.resources || {})) {
    if (!selectedIds.has(resourceId)) continue;

    const resource = resourceMap.get(resourceId);
    if (!resource) continue;

    const level = clampLevel(levels[resource.job] ?? 200);
    if (resource.level > level) continue;

    const priority =
      priorityMode === 'manual'
        ? Number(priorities[resourceId] ?? 3)
        : 1 + resource.level / 48;
    const levelFit = 1 + Math.min(1, resource.level / Math.max(1, level)) * 0.35;
    const weightedQuantity = quantity * priority * levelFit;

    selected.push({
      resource,
      quantity,
      priority,
      weightedQuantity
    });
    jobs.add(resource.job);
  }

  if (!selected.length) return null;

  const rawQuantity = selected.reduce((sum, item) => sum + item.quantity, 0);
  const weightedQuantity = selected.reduce((sum, item) => sum + item.weightedQuantity, 0);
  const quality = Number.isFinite(spot.quality) ? spot.quality : 0.7;
  const diversityBonus = 1 + Math.max(0, jobs.size - 1) * 0.12 + Math.max(0, selected.length - 1) * 0.035;
  const value = weightedQuantity * (0.72 + quality * 0.45) * diversityBonus;

  return {
    ...spot,
    selected,
    jobs: [...jobs],
    rawQuantity,
    weightedQuantity,
    value,
    quality
  };
}

export function rankSelectedResources(resources, selectedIds, levels, priorityMode, priorities) {
  return resources
    .filter((resource) => selectedIds.has(resource.id))
    .filter((resource) => resource.level <= clampLevel(levels[resource.job] ?? 200))
    .map((resource) => ({
      ...resource,
      priority:
        priorityMode === 'manual' ? Number(priorities[resource.id] ?? 3) : 1 + resource.level / 48
    }))
    .sort((a, b) => b.priority - a.priority || b.level - a.level || a.name.localeCompare(b.name));
}

export function buildRoute({
  resources,
  spots,
  zaaps,
  selectedResourceIds,
  levels,
  priorities = {},
  priorityMode = 'auto',
  start,
  maxStops = 12,
  preferZaaps = true
}) {
  const selectedIds = new Set(selectedResourceIds);
  const resourceMap = indexById(resources);
  const candidates = spots
    .map((spot) => getSpotPayload(spot, resourceMap, selectedIds, levels, priorityMode, priorities))
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);

  const route = [];
  const usedSpotIds = new Set();
  let current = { ...start, name: 'Depart' };
  let totals = {
    cost: 0,
    walkCost: 0,
    zaapCount: 0,
    value: 0,
    rawQuantity: 0
  };

  while (route.length < maxStops && usedSpotIds.size < candidates.length) {
    const next = candidates
      .filter((spot) => !usedSpotIds.has(spot.id))
      .map((spot) => {
        const travel = travelBetween(current, spot, zaaps, { preferZaaps });
        const distancePenalty = Math.max(2.5, travel.cost);
        const routeScore = spot.value / distancePenalty;
        return { spot, travel, routeScore };
      })
      .sort((a, b) => b.routeScore - a.routeScore || b.spot.value - a.spot.value)[0];

    if (!next) break;

    const step = {
      index: route.length + 1,
      ...next.spot,
      travel: next.travel,
      routeScore: next.routeScore
    };

    route.push(step);
    usedSpotIds.add(step.id);
    current = step;
    totals = {
      cost: totals.cost + next.travel.cost,
      walkCost: totals.walkCost + next.travel.walkCost,
      zaapCount: totals.zaapCount + next.travel.zaapCount,
      value: totals.value + step.value,
      rawQuantity: totals.rawQuantity + step.rawQuantity
    };
  }

  return {
    start,
    route,
    candidates,
    resources: rankSelectedResources(resources, selectedIds, levels, priorityMode, priorities),
    totals: {
      ...totals,
      efficiency: totals.cost ? totals.value / totals.cost : totals.value
    }
  };
}

export function getDefaultSelection(resources, levels, enabledJobs) {
  const jobs = new Set(enabledJobs);
  return resources
    .filter((resource) => jobs.has(resource.job))
    .filter((resource) => resource.level <= clampLevel(levels[resource.job] ?? 1))
    .filter((resource) => {
      const jobLevel = clampLevel(levels[resource.job] ?? 1);
      const floor = Math.max(1, jobLevel - 65);
      return resource.level >= floor || resource.level <= 20;
    })
    .map((resource) => resource.id);
}

export function formatLegInstruction(step) {
  const travel = step.travel;
  const target = `${step.name} ${coordLabel(step)}`;

  if (travel.mode === 'zaap') {
    const origin = `${travel.originZaap.name} ${coordLabel(travel.originZaap)}`;
    const destination = `${travel.targetZaap.name} ${coordLabel(travel.targetZaap)}`;
    return `Marche jusqu a ${origin}, prends ${destination}, puis va sur ${target}.`;
  }

  return `Marche jusqu a ${target}.`;
}

export function summarizeStepResources(step) {
  return step.selected
    .map((item) => `${item.resource.name} x${item.quantity}`)
    .join(', ');
}

export function exportRouteText(plan) {
  const lines = [
    `Depart ${travelCommand(plan.start)} ${coordLabel(plan.start)}`,
    `Score ${plan.totals.value.toFixed(1)} | marche ${plan.totals.walkCost} cases | zaaps ${plan.totals.zaapCount}`,
    ''
  ];

  for (const step of plan.route) {
    lines.push(`${step.index}. ${travelCommand(step)} - ${step.name} ${coordLabel(step)}`);
    if (step.travel.mode === 'zaap') {
      lines.push(
        `   Rapide: ${travelCommand(step.travel.originZaap)} -> ${travelCommand(step.travel.targetZaap)} -> ${travelCommand(step)}`
      );
    } else {
      lines.push(`   Marche: ${travelCommand(step.travel.from)} -> ${travelCommand(step)}`);
    }
    lines.push(`   Recolte: ${summarizeStepResources(step)}`);
  }

  return lines.join('\n');
}
