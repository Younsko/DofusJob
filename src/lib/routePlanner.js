const MAP_TRAVEL_SECONDS = 2.8;
const ZAAP_SECONDS = 12;
const HARVEST_SECONDS = 3;
const ZAAP_MIN_DISTANCE = 7;

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
  return new Map(items.map((item) => [String(item.id), item]));
}

export function getHarvestXp(resource) {
  return 10 + Math.floor(Number(resource.level || 1) / 2);
}

export function nearestZaap(point, zaaps) {
  return zaaps
    .map((zaap) => ({ ...zaap, distance: manhattan(point, zaap) }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))[0];
}

export function travelBetween(from, target, zaaps, options = {}) {
  const directMaps = manhattan(from, target);
  const directSeconds = directMaps * MAP_TRAVEL_SECONDS;
  const targetZaap = options.preferZaaps === false ? null : nearestZaap(target, zaaps);
  const exitMaps = targetZaap ? manhattan(targetZaap, target) : Infinity;
  const zaapSeconds = ZAAP_SECONDS + exitMaps * MAP_TRAVEL_SECONDS;
  const useZaap = Boolean(targetZaap && directMaps >= ZAAP_MIN_DISTANCE && zaapSeconds < directSeconds);

  return {
    mode: useZaap ? 'zaap' : 'walk',
    cost: useZaap ? 3 + exitMaps : directMaps,
    seconds: useZaap ? zaapSeconds : directSeconds,
    walkCost: useZaap ? exitMaps : directMaps,
    zaapCount: useZaap ? 1 : 0,
    targetZaap: useZaap ? targetZaap : null,
    from,
    target,
    segments: useZaap
      ? [
          { mode: 'zaap', from, to: targetZaap, cost: ZAAP_SECONDS / MAP_TRAVEL_SECONDS },
          ...(exitMaps ? [{ mode: 'walk', from: targetZaap, to: target, cost: exitMaps }] : [])
        ]
      : [{ mode: 'walk', from, to: target, cost: directMaps }]
  };
}

export function getSpotPayload(spot, resourceMap, selectedIds, levels, options = {}) {
  const objective = options.objective || 'xp';
  const enabledJobs = new Set(options.enabledJobs || []);
  const selected = [];

  for (const [resourceId, rawQuantity] of Object.entries(spot.resources || {})) {
    const resource = resourceMap.get(String(resourceId));
    if (!resource || !enabledJobs.has(resource.job)) continue;
    if (resource.level > clampLevel(levels[resource.job] ?? 1)) continue;
    if (objective === 'resource' && !selectedIds.has(String(resourceId))) continue;

    const quantity = Math.max(0, Number(rawQuantity) || 0);
    const xpEach = getHarvestXp(resource);
    const xp = quantity * xpEach;
    selected.push({
      resource,
      quantity,
      xpEach,
      xp,
      cells: spot.resourceCells?.[String(resourceId)] || []
    });
  }

  if (!selected.length) return null;
  selected.sort((a, b) => b.xp - a.xp || b.resource.level - a.resource.level);
  const nodeCount = selected.reduce((sum, item) => sum + item.quantity, 0);
  const totalXp = selected.reduce((sum, item) => sum + item.xp, 0);
  const harvestSeconds = nodeCount * HARVEST_SECONDS;

  return {
    ...spot,
    selected,
    rawQuantity: nodeCount,
    nodeCount,
    totalXp,
    value: totalXp,
    harvestSeconds,
    diversity: selected.length
  };
}

export function rankSelectedResources(resources, selectedIds, levels, objective, enabledJobs) {
  const jobs = new Set(enabledJobs);
  return resources
    .filter((resource) => jobs.has(resource.job))
    .filter((resource) => resource.level <= clampLevel(levels[resource.job] ?? 1))
    .filter((resource) => objective !== 'resource' || selectedIds.has(String(resource.id)))
    .map((resource) => ({ ...resource, xpEach: getHarvestXp(resource) }))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

export function buildRoute({
  resources,
  spots,
  zaaps,
  selectedResourceIds = [],
  enabledJobs = [],
  levels,
  objective = 'xp',
  start = null,
  maxStops = 18,
  preferZaaps = true
}) {
  const selectedIds = new Set(selectedResourceIds.map(String));
  const resourceMap = indexById(resources);
  const effectiveJobs = enabledJobs.length
    ? enabledJobs
    : resources
        .filter((resource) => selectedIds.has(String(resource.id)))
        .map((resource) => resource.job);
  const candidates = spots
    .map((spot) =>
      getSpotPayload(spot, resourceMap, selectedIds, levels, { objective, enabledJobs: effectiveJobs })
    )
    .filter(Boolean);

  const route = [];
  const used = new Set();
  let current = start ? { ...start, name: 'Départ choisi' } : null;
  let totals = { seconds: 0, walkCost: 0, zaapCount: 0, totalXp: 0, rawQuantity: 0 };

  while (route.length < maxStops && used.size < candidates.length) {
    const next = candidates
      .filter((spot) => !used.has(spot.id))
      .map((spot) => {
        const travel = current
          ? travelBetween(current, spot, zaaps, { preferZaaps })
          : {
              mode: 'start',
              cost: 0,
              seconds: 0,
              walkCost: 0,
              zaapCount: 0,
              targetZaap: null,
              from: null,
              target: spot,
              segments: []
            };
        const seconds = Math.max(1, travel.seconds + spot.harvestSeconds);
        const densityBonus = 1 + Math.min(0.18, Math.max(0, spot.diversity - 1) * 0.04);
        const continuityBonus = current && manhattan(current, spot) <= 2 ? 1.16 : 1;
        return {
          spot,
          travel,
          routeScore: (spot.totalXp / seconds) * densityBonus * continuityBonus
        };
      })
      .sort(
        (a, b) =>
          b.routeScore - a.routeScore ||
          b.spot.totalXp - a.spot.totalXp ||
          a.travel.seconds - b.travel.seconds
      )[0];

    if (!next) break;
    const step = {
      index: route.length + 1,
      ...next.spot,
      travel: next.travel,
      routeScore: next.routeScore,
      stepSeconds: next.travel.seconds + next.spot.harvestSeconds
    };
    route.push(step);
    used.add(step.id);
    current = step;
    totals = {
      seconds: totals.seconds + step.stepSeconds,
      walkCost: totals.walkCost + step.travel.walkCost,
      zaapCount: totals.zaapCount + step.travel.zaapCount,
      totalXp: totals.totalXp + step.totalXp,
      rawQuantity: totals.rawQuantity + step.nodeCount
    };
  }

  return {
    start,
    objective,
    route,
    candidates: candidates.sort((a, b) => b.totalXp - a.totalXp),
    resources: rankSelectedResources(resources, selectedIds, levels, objective, effectiveJobs),
    totals: {
      ...totals,
      minutes: totals.seconds / 60,
      xpPerHour: totals.seconds ? (totals.totalXp * 3600) / totals.seconds : 0,
      efficiency: totals.seconds ? totals.totalXp / totals.seconds : 0
    }
  };
}

export function getDefaultSelection(resources, levels, enabledJobs) {
  const jobs = new Set(enabledJobs);
  return resources
    .filter((resource) => jobs.has(resource.job))
    .filter((resource) => resource.level <= clampLevel(levels[resource.job] ?? 1))
    .filter((resource) => resource.level <= 1 || resource.level >= Math.max(1, clampLevel(levels[resource.job]) - 40))
    .map((resource) => String(resource.id));
}

export function formatLegInstruction(step) {
  if (step.travel.mode === 'zaap') {
    return `Téléporte-toi au ${step.travel.targetZaap.name}, puis suis la commande.`;
  }
  return step.travel.walkCost <= 1 ? 'Passe sur la map suivante.' : 'Lance la commande de trajet.';
}

export function summarizeStepResources(step) {
  return step.selected.map((item) => `${item.resource.name} ×${item.quantity}`).join(', ');
}

export function getRouteActionLines(step) {
  const lines = [];
  if (step.travel.mode === 'zaap') {
    lines.push({
      type: step.travel.targetZaap.type === 'transporter' ? 'transport' : 'zaap',
      label: step.travel.targetZaap.name,
      point: step.travel.targetZaap
    });
  }
  lines.push({ type: 'travel', label: step.name, point: step });
  return lines;
}

export function exportRouteText(plan) {
  const lines = [
    `DOFUSJOB - ${plan.objective === 'xp' ? 'XP MAX' : 'RESSOURCE CIBLEE'}`,
    `${Math.round(plan.totals.totalXp)} XP - ${plan.totals.rawQuantity} nodes - ${Math.round(plan.totals.minutes)} min`,
    plan.start
      ? `Départ choisi: ${travelCommand(plan.start)}`
      : `Départ optimal: ${plan.route[0] ? travelCommand(plan.route[0]) : 'aucun'}`,
    ''
  ];

  for (const step of plan.route) {
    lines.push(`${step.index}. ${travelCommand(step)} - ${step.name}`);
    if (step.travel.mode === 'zaap') {
      lines.push(`   Zaap: ${step.travel.targetZaap.name} ${coordLabel(step.travel.targetZaap)}`);
    }
    lines.push(`   Récolte: ${summarizeStepResources(step)} - ${step.totalXp} XP`);
  }
  return lines.join('\n');
}
