import './styles.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Check,
  ChevronUp,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Fish,
  FlaskConical,
  Gauge,
  Import,
  LocateFixed,
  MapPinned,
  Maximize2,
  Navigation,
  Pickaxe,
  RefreshCcw,
  Route,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TreePine,
  Upload,
  Wheat,
  Zap,
  ZoomIn,
  ZoomOut,
  createIcons
} from 'lucide';
import { JOB_ORDER, JOBS } from './data/jobs.js';
import { validateDataset } from './lib/dataset.js';
import { DOFUS_DATA } from './generated/dofusData.js';
import {
  buildRoute,
  coordLabel,
  exportRouteText,
  formatLegInstruction,
  getDefaultSelection,
  getRouteActionLines,
  indexById,
  nearestZaap,
  travelCommand
} from './lib/routePlanner.js';
import { clearState, loadState, saveState } from './lib/storage.js';

const ICONS = {
  Check,
  ChevronUp,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Fish,
  FlaskConical,
  Gauge,
  Import,
  LocateFixed,
  MapPinned,
  Maximize2,
  Navigation,
  Pickaxe,
  RefreshCcw,
  Route,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TreePine,
  Upload,
  Wheat,
  Zap,
  ZoomIn,
  ZoomOut
};

const DEFAULT_LEVELS = {
  miner: 80,
  lumberjack: 80,
  farmer: 80,
  alchemist: 80,
  fisherman: 80
};

const MAP_WIDTH = 1120;
const MAP_HEIGHT = 760;
const TILE_SIZE = 250;
const MAX_RASTER_TILES = 96;
const MAX_RENDERABLE_CANDIDATES = 80;
const DOFUSDB_WORLDS = {
  1: {
    id: 1,
    origineX: 6480,
    origineY: 4944,
    mapWidth: 69.5,
    mapHeight: 49.70000076293945,
    totalWidth: 10000,
    totalHeight: 8000,
    scales: [
      { name: '0.2', x: 0.20000000298023224, y: 0.20000000298023224 },
      { name: '0.4', x: 0.4000000059604645, y: 0.4000000059604645 },
      { name: '0.6', x: 0.6000000238418579, y: 0.6000000238418579 },
      { name: '0.8', x: 0.800000011920929, y: 0.800000011920929 },
      { name: '1', x: 1, y: 1 }
    ]
  }
};

const app = document.querySelector('#app');
const initialDataset = DOFUS_DATA;
let state = createInitialState();
let toastTimer = null;
let planningSpotCache = new Map();
let leafletMap = null;

function createInitialState() {
  const saved = loadState();
  const levels = { ...DEFAULT_LEVELS, ...(saved?.levels || {}) };
  const enabledJobs = new Set(saved?.enabledJobs || JOB_ORDER);
  const validResourceIds = new Set(initialDataset.resources.map((resource) => resource.id));
  const savedSelection = (saved?.selectedResourceIds || []).filter((id) => validResourceIds.has(id));
  const selectedResourceIds = new Set(
    savedSelection.length
      ? savedSelection
      : getDefaultSelection(initialDataset.resources, levels, enabledJobs)
  );

  const savedMaxStops = Number(saved?.maxStops || 24);
  const savedMapIsLeaflet = saved?.mapEngineVersion === 2;

  return {
    dataset: initialDataset,
    levels,
    enabledJobs,
    selectedResourceIds,
    priorities: saved?.priorities || {},
    priorityMode: saved?.priorityMode || 'auto',
    start: saved?.start || { x: 5, y: -18 },
    worldMap: Number(saved?.worldMap || 1),
    maxStops: savedMaxStops === 12 ? 24 : savedMaxStops,
    preferZaaps: saved?.preferZaaps !== false,
    showZaaps: saved?.showZaaps !== false,
    showGrid: saved?.showGrid !== false,
    mapZoom: clampMapZoom(savedMapIsLeaflet ? saved?.mapZoom || 1.55 : 1.55),
    mapFocus: savedMapIsLeaflet ? normalizeMapFocus(saved?.mapFocus) : null,
    search: '',
    focusedSpotId: null,
    notice: '',
    plan: null
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return entities[character];
  });
}

function clampMapZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(5, Math.max(1, numeric));
}

function normalizeMapFocus(focus) {
  if (!focus) return null;
  const x = Number(focus.x);
  const y = Number(focus.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function getResourceMap() {
  return indexById(state.dataset.resources);
}

function getCurrentSpots() {
  return getCurrentPlanningSpots();
}

function getCurrentZaaps() {
  return state.dataset.zaaps.filter((zaap) => Number(zaap.worldMap || 1) === state.worldMap);
}

function getCurrentTransporters() {
  return (state.dataset.transporters || []).filter(
    (transporter) => Number(transporter.worldMap || 1) === state.worldMap
  );
}

function getCurrentTravelNodes() {
  return [...getCurrentZaaps(), ...getCurrentTransporters()];
}

function getCurrentMapCells() {
  return (state.dataset.maps || []).filter((map) => Number(map.worldMap || 1) === state.worldMap);
}

function getCurrentSubareaSpots() {
  return state.dataset.spots.filter((spot) => Number(spot.worldMap || 1) === state.worldMap);
}

function getCurrentPlanningSpots() {
  const cacheKey = `${state.dataset.meta?.id || 'custom'}:${state.worldMap}`;
  if (planningSpotCache.has(cacheKey)) return planningSpotCache.get(cacheKey);
  const subareaById = new Map(getCurrentSubareaSpots().map((spot) => [spot.subareaId, spot]));

  const spots = getCurrentMapCells()
    .map((map) => {
      const subarea = subareaById.get(map.subareaId);
      if (!subarea) return null;
      const resources = {};

      for (const [resourceId, density] of Object.entries(subarea.resources || {})) {
        const quantity = estimateMapResourceQuantity(map, resourceId, density);
        if (quantity > 0) resources[resourceId] = quantity;
      }

      if (!Object.keys(resources).length) return null;

      return {
        id: `map-${map.id}`,
        source: 'dofusjob-map-estimate',
        mapId: map.id,
        subareaId: map.subareaId,
        name: subarea.name,
        zone: subarea.zone,
        worldMap: map.worldMap,
        worldMapName: subarea.worldMapName,
        kind: 'map',
        x: map.x,
        y: map.y,
        quality: subarea.quality,
        mapCount: 1,
        resources
      };
    })
    .filter(Boolean);
  planningSpotCache.set(cacheKey, spots);
  return spots;
}

function estimateMapResourceQuantity(map, resourceId, density) {
  const seed = hashString(`${map.id}:${resourceId}`);
  const base = Math.max(1, Number(density) || 1);
  const chance = Math.min(88, 24 + base * 7);
  if (seed % 100 >= chance) return 0;
  const maxQuantity = Math.max(1, Math.min(4, Math.ceil(base / 3)));
  return 1 + ((seed >>> 8) % maxQuantity);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getMapPoints() {
  return [
    state.start,
    ...getCurrentMapCells(),
    ...getCurrentZaaps(),
    ...getCurrentTransporters()
  ];
}

function getMapProjectionContext() {
  const points = getMapPoints();
  const bounds = getBounds(points);
  const world = DOFUSDB_WORLDS[state.worldMap];

  if (world) {
    const pixelBounds = getWorldPixelBounds(points, world);
    const pixelProjection = createPixelProjection(pixelBounds, MAP_WIDTH, MAP_HEIGHT);
    const project = (point) => pixelProjection.project(dofusGridToPixel(point, world));
    const projectCenter = (point) => pixelProjection.project(dofusCenterToPixel(point, world));
    const unprojectCenter = (point) => pixelToDofusCenter(pixelProjection.unproject(point), world);
    const unprojectPixel = (point) => pixelProjection.unproject(point);

    return {
      bounds,
      pixelBounds,
      project,
      projectCenter,
      projectPixel: pixelProjection.project,
      unprojectCenter,
      unprojectPixel,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      world
    };
  }

  const project = createProjector(bounds, MAP_WIDTH, MAP_HEIGHT);
  return {
    bounds,
    project,
    projectCenter: project,
    projectPixel: null,
    unprojectCenter: (point) => unprojectMapPoint(point, bounds, MAP_WIDTH, MAP_HEIGHT),
    unprojectPixel: null,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    world: null
  };
}

function getResourceStats() {
  const stats = new Map();
  for (const resource of state.dataset.resources) {
    stats.set(resource.id, { spotCount: 0, quantity: 0 });
  }

  for (const spot of getCurrentSpots()) {
    for (const [resourceId, quantity] of Object.entries(spot.resources || {})) {
      const item = stats.get(resourceId);
      if (!item) continue;
      item.spotCount += 1;
      item.quantity += Number(quantity) || 0;
    }
  }

  return stats;
}

function getVisibleResources() {
  const query = normalize(state.search);
  const stats = getResourceStats();

  return state.dataset.resources
    .filter((resource) => state.enabledJobs.has(resource.job))
    .filter((resource) => {
      if (!query) return true;
      const job = JOBS[resource.job]?.label || '';
      return normalize(`${resource.name} ${job} ${resource.family}`).includes(query);
    })
    .map((resource) => ({
      ...resource,
      stats: stats.get(resource.id) || { spotCount: 0, quantity: 0 },
      isAvailable: resource.level <= Number(state.levels[resource.job] || 1)
    }))
    .sort((a, b) => a.job.localeCompare(b.job) || a.level - b.level || a.name.localeCompare(b.name));
}

function computePlan() {
  state.plan = buildRoute({
    resources: state.dataset.resources,
    spots: getCurrentSpots(),
    zaaps: getCurrentTravelNodes(),
    selectedResourceIds: [...state.selectedResourceIds],
    levels: state.levels,
    priorities: state.priorities,
    priorityMode: state.priorityMode,
    start: state.start,
    maxStops: state.maxStops,
    preferZaaps: state.preferZaaps
  });
}

function render() {
  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
  }
  computePlan();
  saveState(state);

  app.innerHTML = `
    <div class="app-shell">
      ${renderHeader()}
      <main class="planner">
        <aside class="panel panel-left">
          ${renderJobControls()}
          ${renderResourceControls()}
        </aside>
        <section class="map-workspace">
          ${renderToolbar()}
          ${renderMap()}
        </section>
        <aside class="panel panel-right">
          ${renderRouteSummary()}
          ${renderRouteSteps()}
        </aside>
      </main>
      <div class="toast-stack" aria-live="polite"></div>
    </div>
  `;

  createIcons({ icons: ICONS });
  mountLeafletMap();
  bindEvents();
}

function renderHeader() {
  const nearest = nearestZaap(state.start, getCurrentTravelNodes());
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark"><i data-lucide="route"></i></div>
        <div>
          <h1>DofusJob</h1>
          <p>${escapeHtml(state.dataset.meta?.label || 'Dataset local')} · ${state.plan?.candidates.length || 0} spots actifs</p>
        </div>
      </div>
      <div class="top-controls">
        <label class="field compact">
          <span>Depart X</span>
          <input id="start-x" type="number" value="${state.start.x}" />
        </label>
        <label class="field compact">
          <span>Depart Y</span>
          <input id="start-y" type="number" value="${state.start.y}" />
        </label>
        <label class="field compact">
          <span>Maps</span>
          <input id="max-stops" type="number" min="1" max="60" value="${state.maxStops}" />
        </label>
        <label class="field world-field">
          <span>Carte</span>
          <select id="world-map">
            ${renderWorldOptions()}
          </select>
        </label>
        <div class="nearest-zaap">
          <i data-lucide="zap"></i>
          <span>${nearest ? `${escapeHtml(nearest.name)} ${coordLabel(nearest)}` : 'Aucun transport'}</span>
        </div>
      </div>
    </header>
  `;
}

function renderWorldOptions() {
  return (state.dataset.worldMaps || [{ id: 1, name: 'Monde des Douze', mapCount: 0 }])
    .map(
      (worldMap) => `
        <option value="${worldMap.id}" ${Number(worldMap.id) === state.worldMap ? 'selected' : ''}>
          ${escapeHtml(worldMap.name)} (${worldMap.mapCount})
        </option>
      `
    )
    .join('');
}

function renderJobControls() {
  return `
    <section class="panel-section">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Profil</span>
          <h2>Metiers</h2>
        </div>
        <button class="icon-button" type="button" data-action="reset-app" title="Reinitialiser">
          <i data-lucide="refresh-ccw"></i>
        </button>
      </div>
      <div class="job-grid">
        ${JOB_ORDER.map((jobId) => renderJobControl(jobId)).join('')}
      </div>
      <div class="level-presets">
        <button type="button" class="mini-button" data-action="set-levels" data-level="60">60</button>
        <button type="button" class="mini-button" data-action="set-levels" data-level="120">120</button>
        <button type="button" class="mini-button" data-action="set-levels" data-level="200">200</button>
      </div>
    </section>
  `;
}

function renderJobControl(jobId) {
  const job = JOBS[jobId];
  const active = state.enabledJobs.has(jobId);
  return `
    <div class="job-row ${active ? 'is-active' : ''}" style="--job-color:${job.color};--job-soft:${job.softColor}">
      <button type="button" class="job-toggle" data-action="toggle-job" data-job="${jobId}" aria-pressed="${active}">
        <i data-lucide="${iconName(job.icon)}"></i>
        <span>${escapeHtml(job.label)}</span>
      </button>
      <input class="job-level" data-job="${jobId}" type="number" min="1" max="200" value="${state.levels[jobId]}" />
    </div>
  `;
}

function renderResourceControls() {
  const visible = getVisibleResources();
  return `
    <section class="panel-section resource-section">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Selection</span>
          <h2>Ressources</h2>
        </div>
        <div class="selection-count">${state.selectedResourceIds.size}</div>
      </div>
      <div class="search-line">
        <i data-lucide="search"></i>
        <input id="resource-search" type="search" placeholder="Filtrer" value="${escapeHtml(state.search)}" />
      </div>
      <div class="mode-row">
        <button type="button" class="segmented ${state.priorityMode === 'auto' ? 'is-active' : ''}" data-action="set-priority-mode" data-mode="auto">
          <i data-lucide="sparkles"></i>
          Auto
        </button>
        <button type="button" class="segmented ${state.priorityMode === 'manual' ? 'is-active' : ''}" data-action="set-priority-mode" data-mode="manual">
          <i data-lucide="sliders-horizontal"></i>
          Manuel
        </button>
      </div>
      <div class="quick-actions">
        <button type="button" class="text-button" data-action="auto-select">
          <i data-lucide="target"></i>
          Tranche actuelle
        </button>
        <button type="button" class="text-button" data-action="select-visible">
          <i data-lucide="check"></i>
          Visibles
        </button>
      </div>
      <div class="resource-list">
        ${visible.map((resource) => renderResourceRow(resource)).join('')}
      </div>
    </section>
  `;
}

function renderResourceRow(resource) {
  const selected = state.selectedResourceIds.has(resource.id);
  const job = JOBS[resource.job];
  const priority = Number(state.priorities[resource.id] || 3);
  return `
    <label class="resource-row ${selected ? 'is-selected' : ''} ${resource.isAvailable ? '' : 'is-locked'}" style="--job-color:${job.color};--job-soft:${job.softColor}">
      <input
        class="resource-toggle"
        data-resource-id="${resource.id}"
        type="checkbox"
        ${selected ? 'checked' : ''}
        ${resource.isAvailable ? '' : 'disabled'}
      />
      <span class="resource-dot">
        ${resource.icon ? `<img src="${escapeHtml(resource.icon)}" alt="" loading="lazy" />` : ''}
      </span>
      <span class="resource-main">
        <span class="resource-name">${escapeHtml(resource.name)}</span>
        <span class="resource-meta">Niv. ${resource.level} · ${resource.stats.spotCount} spots · ${resource.stats.quantity} unites</span>
      </span>
      ${
        state.priorityMode === 'manual' && selected
          ? `
            <span class="priority-control">
              <input class="priority-range" data-resource-id="${resource.id}" type="range" min="1" max="6" value="${priority}" />
              <output class="priority-value">${priority}</output>
            </span>
          `
          : `<span class="resource-level">${resource.level}</span>`
      }
    </label>
  `;
}

function renderToolbar() {
  const mapCount = getCurrentMapCells().length;
  const transporterCount = getCurrentTransporters().length;
  return `
    <div class="map-toolbar">
      <div class="map-tabs">
        <button type="button" class="tool-toggle ${state.preferZaaps ? 'is-active' : ''}" data-action="toggle-zaap-routing">
          <i data-lucide="zap"></i>
          Trajet rapide
        </button>
        <button type="button" class="tool-toggle ${state.showGrid ? 'is-active' : ''}" data-action="toggle-grid">
          <i data-lucide="${state.showGrid ? 'eye' : 'eye-off'}"></i>
          Grille
        </button>
        <button type="button" class="tool-toggle ${state.showZaaps ? 'is-active' : ''}" data-action="toggle-zaaps">
          <i data-lucide="map-pinned"></i>
          Zaaps + transports
        </button>
        <span class="map-count">${mapCount} cases · ${transporterCount} transporteurs</span>
      </div>
      <div class="map-actions">
        <div class="zoom-controls" aria-label="Zoom carte">
          <button type="button" class="icon-button" data-action="zoom-out" title="Dezoomer">
            <i data-lucide="zoom-out"></i>
          </button>
          <span class="zoom-readout">${Math.round(state.mapZoom * 100)}%</span>
          <button type="button" class="icon-button" data-action="zoom-in" title="Zoomer">
            <i data-lucide="zoom-in"></i>
          </button>
          <button type="button" class="icon-button" data-action="focus-route" title="Centrer la route">
            <i data-lucide="crosshair"></i>
          </button>
          <button type="button" class="icon-button" data-action="reset-map-view" title="Vue complete">
            <i data-lucide="maximize-2"></i>
          </button>
        </div>
        <input id="dataset-file" class="file-input" type="file" accept="application/json" />
        <label for="dataset-file" class="text-button">
          <i data-lucide="upload"></i>
          Import JSON
        </label>
        <button type="button" class="text-button" data-action="export-route">
          <i data-lucide="copy"></i>
          Copier route
        </button>
      </div>
    </div>
    ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ''}
  `;
}

function renderRouteSummary() {
  const plan = state.plan;
  const topResources = plan.resources.slice(0, 6);
  return `
    <section class="panel-section">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Run</span>
          <h2>Itineraire</h2>
        </div>
        <div class="score-pill">
          <i data-lucide="gauge"></i>
          ${plan.totals.efficiency.toFixed(1)}
        </div>
      </div>
      <div class="metric-grid">
        <div>
          <span>${plan.route.length}</span>
          <small>stops</small>
        </div>
        <div>
          <span>${Math.round(plan.totals.walkCost)}</span>
          <small>cases</small>
        </div>
        <div>
          <span>${plan.totals.zaapCount}</span>
          <small>zaaps</small>
        </div>
        <div>
          <span>${Math.round(plan.totals.rawQuantity)}</span>
          <small>unites</small>
        </div>
      </div>
      <div class="priority-stack">
        ${topResources
          .map((resource, index) => {
            const job = JOBS[resource.job];
            return `
              <div class="priority-chip" style="--job-color:${job.color};--job-soft:${job.softColor}">
                <span>${index + 1}</span>
                ${escapeHtml(resource.name)}
              </div>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function renderRouteSteps() {
  const plan = state.plan;
  if (!plan.route.length) {
    return `
      <section class="panel-section route-section">
        <div class="empty-state">
          <i data-lucide="locate-fixed"></i>
          <strong>Aucune route active</strong>
          <span>Verifie les niveaux et les ressources cochees.</span>
        </div>
      </section>
    `;
  }

  return `
    <section class="panel-section route-section">
      <div class="step-list">
        ${plan.route.map((step) => renderStep(step)).join('')}
      </div>
    </section>
  `;
}

function renderTravelCommandButton(point, className = '') {
  const command = travelCommand(point);
  return `
    <button type="button" class="command-pill ${className}" data-action="copy-travel" data-command="${escapeHtml(command)}" title="Copier ${escapeHtml(command)}">
      <i data-lucide="copy"></i>
      <span>${escapeHtml(command)}</span>
    </button>
  `;
}

function renderCoordButton(point) {
  const command = travelCommand(point);
  return `
    <button type="button" class="coord-button" data-action="copy-travel" data-command="${escapeHtml(command)}" title="Copier ${escapeHtml(command)}">
      ${coordLabel(point)}
    </button>
  `;
}

function renderStepActions(step) {
  return getRouteActionLines(step)
    .map((action, index) => {
      const isTravel = action.type === 'travel';
      const icon = action.type === 'zaap' ? 'zap' : action.type === 'transport' ? 'navigation' : 'map-pinned';
      const label = action.type === 'zaap' ? 'Zaap' : action.type === 'transport' ? 'Transport' : 'Map';
      return `
        <div class="run-action ${isTravel ? 'is-command' : ''}">
          <span class="run-action-index">${index + 1}</span>
          <i data-lucide="${icon}"></i>
          <div>
            <strong>${label}</strong>
            <span>${escapeHtml(action.label)} ${coordLabel(action.point)}</span>
          </div>
          ${isTravel ? renderTravelCommandButton(action.point, 'run-command') : ''}
        </div>
      `;
    })
    .join('');
}

function renderStepLoot(step) {
  return `
    <div class="loot-list">
      ${step.selected
        .map((item) => {
          const job = JOBS[item.resource.job];
          return `
            <span class="loot-chip" style="--job-color:${job.color};--job-soft:${job.softColor}">
              ${item.resource.icon ? `<img src="${escapeHtml(item.resource.icon)}" alt="" loading="lazy" />` : ''}
              <span>${escapeHtml(item.resource.name)}</span>
              <strong>x${item.quantity}</strong>
            </span>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderStep(step) {
  const focused = state.focusedSpotId === step.id;
  const dominantJob = getDominantJob(step);
  const job = JOBS[dominantJob] || JOBS.miner;
  return `
    <article class="step-row ${focused ? 'is-focused' : ''}" data-action="focus-spot" data-spot-id="${step.id}" style="--job-color:${job.color};--job-soft:${job.softColor}">
      <div class="step-index">${step.index}</div>
      <div class="step-body">
        <div class="step-title">
          <strong>${escapeHtml(step.name)}</strong>
          ${renderCoordButton(step)}
        </div>
        <p>${escapeHtml(formatLegInstruction(step))}</p>
        <div class="run-actions">${renderStepActions(step)}</div>
        ${renderStepLoot(step)}
        <div class="step-metrics">
          <span>${Math.round(step.travel.walkCost)} cases</span>
          <span>${step.travel.zaapCount ? 'zaap' : 'marche'}</span>
          <span>score ${step.value.toFixed(0)}</span>
          ${step.mapId ? `<span>map ${step.mapId}</span>` : ''}
        </div>
      </div>
    </article>
  `;
}

function getRenderableSpots(plan) {
  const routeIds = new Set(plan.route.map((step) => step.id));
  const route = plan.route;
  const candidates = plan.candidates
    .filter((spot) => !routeIds.has(spot.id))
    .slice(0, MAX_RENDERABLE_CANDIDATES);
  return [...route, ...candidates];
}

function renderMap() {
  return `
    <div class="map-frame">
      <div id="dofus-map" class="dofus-leaflet-map" role="img" aria-label="Carte DofusJob"></div>
      ${renderFocusedSpot()}
    </div>
  `;
}

function mountLeafletMap() {
  const container = app.querySelector('#dofus-map');
  const world = DOFUSDB_WORLDS[state.worldMap];
  if (!container || !world) return;

  const scales = [...world.scales].sort((a, b) => a.x - b.x);
  const crs = buildLeafletCrs(scales);
  const worldBounds = L.latLngBounds([0, 0], [world.totalHeight, world.totalWidth]);
  const canvasRenderer = L.canvas({ padding: 0.5 });

  leafletMap = L.map(container, {
    crs,
    minZoom: 0,
    maxZoom: scales.length - 1,
    zoomSnap: 0,
    zoomDelta: 0.35,
    wheelPxPerZoomLevel: 90,
    zoomControl: false,
    attributionControl: false,
    maxBounds: worldBounds,
    maxBoundsViscosity: 1,
    preferCanvas: true,
    renderer: canvasRenderer,
    fadeAnimation: false,
    markerZoomAnimation: false,
    zoomAnimation: false
  });

  createLeafletPanes(leafletMap);
  createLeafletTileLayer(world, scales, worldBounds).addTo(leafletMap);
  if (state.showGrid) createLeafletGridLayer(world).addTo(leafletMap);

  renderLeafletMapOverlays(world, canvasRenderer);

  const center = getLeafletInitialCenter(world);
  leafletMap.setView(center, toLeafletZoom(state.mapZoom, scales), { animate: false });
  leafletMap.on('moveend zoomend', () => syncLeafletMapState(world));
  requestAnimationFrame(() => leafletMap?.invalidateSize(false));
}

function buildLeafletCrs(scales) {
  return L.extend({}, L.CRS.Simple, {
    latLngToPoint(latLng, zoom) {
      const scale = getInterpolatedLeafletScale(scales, zoom);
      return L.point(latLng.lng * scale.x, latLng.lat * scale.y);
    },
    pointToLatLng(point, zoom) {
      const scale = getInterpolatedLeafletScale(scales, zoom);
      return L.latLng(point.y / scale.y, point.x / scale.x);
    },
    scale(zoom) {
      return getInterpolatedLeafletScale(scales, zoom).x;
    },
    zoom(scaleValue) {
      if (scaleValue <= scales[0].x) return 0;
      if (scaleValue >= scales[scales.length - 1].x) return scales.length - 1;

      for (let index = 0; index < scales.length - 1; index += 1) {
        const current = scales[index].x;
        const next = scales[index + 1].x;
        if (scaleValue >= current && scaleValue <= next) {
          return index + (scaleValue - current) / (next - current);
        }
      }

      return scales.length - 1;
    }
  });
}

function getInterpolatedLeafletScale(scales, zoom) {
  const clampedZoom = clamp(Number(zoom) || 0, 0, scales.length - 1);
  const floor = Math.floor(clampedZoom);
  const ratio = clampedZoom - floor;
  const current = scales[Math.max(0, Math.min(floor, scales.length - 1))];
  const next = scales[Math.max(0, Math.min(floor + 1, scales.length - 1))];

  return {
    x: current.x + (next.x - current.x) * ratio,
    y: current.y + (next.y - current.y) * ratio,
    name: current.name
  };
}

function createLeafletTileLayer(world, scales, worldBounds) {
  const tileLayer = L.tileLayer('', {
    tileSize: TILE_SIZE,
    noWrap: true,
    bounds: worldBounds,
    minZoom: 0,
    maxZoom: scales.length - 1,
    keepBuffer: 3,
    updateWhenZooming: false,
    updateWhenIdle: true
  });

  tileLayer.getTileUrl = (coords) => {
    const scale = scales[clamp(Math.round(coords.z), 0, scales.length - 1)];
    const columns = Math.ceil((world.totalWidth * scale.x) / TILE_SIZE);
    const rows = Math.ceil((world.totalHeight * scale.y) / TILE_SIZE);
    if (coords.x < 0 || coords.x >= columns || coords.y < 0 || coords.y >= rows) return '';
    const tileNumber = coords.y * columns + coords.x + 1;
    return `https://api.dofusdb.fr/img/worlds/${world.id}/${scale.name}/${tileNumber}.jpg`;
  };

  return tileLayer;
}

function createLeafletPanes(map) {
  const panes = [
    ['dofus-cells', 420],
    ['dofus-route', 470],
    ['dofus-markers', 520]
  ];

  for (const [name, zIndex] of panes) {
    const pane = map.createPane(name);
    pane.style.zIndex = zIndex;
  }
}

function createLeafletGridLayer(world) {
  const tileSize = 256;
  const GridLayer = L.GridLayer.extend({
    createTile(coords) {
      const tile = document.createElement('canvas');
      tile.width = tileSize;
      tile.height = tileSize;

      const context = tile.getContext('2d');
      const map = this._map;
      const origin = coords.scaleBy(L.point(tileSize, tileSize));
      const end = origin.add([tileSize, tileSize]);
      const topLeft = map.unproject(origin, coords.z);
      const bottomRight = map.unproject(end, coords.z);
      const minLng = topLeft.lng;
      const minLat = topLeft.lat;
      const maxLng = bottomRight.lng;
      const maxLat = bottomRight.lat;
      const width = maxLng - minLng || 1;
      const height = maxLat - minLat || 1;
      const firstX = Math.floor((minLng - world.origineX) / world.mapWidth) * world.mapWidth + world.origineX;
      const firstY = Math.floor((minLat - world.origineY) / world.mapHeight) * world.mapHeight + world.origineY;

      context.strokeStyle = 'rgba(238, 244, 234, 0.24)';
      context.lineWidth = 1;
      context.beginPath();

      for (let x = firstX; x <= maxLng + world.mapWidth; x += world.mapWidth) {
        const tileX = ((x - minLng) / width) * tileSize;
        context.moveTo(tileX, 0);
        context.lineTo(tileX, tileSize);
      }

      for (let y = firstY; y <= maxLat + world.mapHeight; y += world.mapHeight) {
        const tileY = ((y - minLat) / height) * tileSize;
        context.moveTo(0, tileY);
        context.lineTo(tileSize, tileY);
      }

      context.stroke();
      return tile;
    }
  });

  return new GridLayer({ tileSize, opacity: 1, pane: 'overlayPane' });
}

function renderLeafletMapOverlays(world, renderer) {
  const resourceMap = getResourceMap();
  const routeIds = new Set(state.plan.route.map((step) => step.id));
  const candidateIds = new Set(state.plan.candidates.map((spot) => spot.id));

  renderLeafletCells(world, renderer);
  renderLeafletRoutes(world, renderer);

  if (state.showZaaps) {
    for (const zaap of getCurrentZaaps()) addLeafletTravelMarker(zaap, world, false);
    for (const transporter of getCurrentTransporters()) addLeafletTravelMarker(transporter, world, true);
  }

  for (const spot of getRenderableSpots(state.plan)) {
    addLeafletSpotMarker(spot, world, resourceMap, candidateIds, routeIds);
  }

  addLeafletStartMarker(world);
}

function renderLeafletCells(world, renderer) {
  const mapById = new Map(getCurrentMapCells().map((map) => [map.id, map]));
  const candidateMapIds = new Set(
    state.plan.candidates
      .slice(0, 260)
      .map((spot) => spot.mapId)
      .filter(Boolean)
  );
  const routeMapIds = new Set(state.plan.route.map((spot) => spot.mapId).filter(Boolean));

  for (const mapId of candidateMapIds) {
    if (routeMapIds.has(mapId)) continue;
    const map = mapById.get(mapId);
    if (!map) continue;
    L.rectangle(dofusCellBounds(map, world), {
      pane: 'dofus-cells',
      renderer,
      interactive: false,
      color: '#ffe9a6',
      weight: 1,
      opacity: 0.2,
      fillColor: '#f4d36f',
      fillOpacity: 0.08
    }).addTo(leafletMap);
  }

  for (const mapId of routeMapIds) {
    const map = mapById.get(mapId);
    if (!map) continue;
    L.rectangle(dofusCellBounds(map, world), {
      pane: 'dofus-route',
      renderer,
      interactive: false,
      color: '#fff4d5',
      weight: 2,
      opacity: 0.92,
      fillColor: '#d86a58',
      fillOpacity: 0.42
    }).addTo(leafletMap);
  }
}

function renderLeafletRoutes(world, renderer) {
  for (const step of state.plan.route) {
    for (const segment of step.travel.segments) {
      L.polyline([dofusToLatLng(segment.from, world), dofusToLatLng(segment.to, world)], {
        pane: 'dofus-route',
        renderer,
        interactive: false,
        color: segment.mode === 'zaap' ? '#65c5e4' : '#f4d36f',
        weight: 4,
        opacity: 0.86,
        dashArray: segment.mode === 'zaap' ? '10 10' : null
      }).addTo(leafletMap);
    }
  }
}

function addLeafletSpotMarker(spot, world, resourceMap, candidateIds, routeIds) {
  const isRoute = routeIds.has(spot.id);
  const isCandidate = candidateIds.has(spot.id);
  const isFocused = state.focusedSpotId === spot.id;
  const dominantJob = getDominantJob(spot);
  const job = JOBS[dominantJob] || JOBS.miner;
  const dominantResource = getDominantResource(spot, resourceMap);
  const icon = isRoute
    ? createRouteDivIcon(spot, dominantResource)
    : createCandidateDivIcon(job, isFocused);
  const marker = L.marker(dofusToLatLng(spot, world), {
    pane: 'dofus-markers',
    icon,
    title: getSpotTitle(spot, resourceMap),
    keyboard: false,
    riseOnHover: true
  });

  marker.on('click', () => {
    focusSpot(spot.id);
    rerender(true, { preserveScroll: true });
  });
  marker.addTo(leafletMap);
}

function addLeafletTravelMarker(node, world, isTransporter) {
  L.marker(dofusToLatLng(node, world), {
    pane: 'dofus-markers',
    icon: L.divIcon({
      className: '',
      html: `<div class="dj-travel-marker ${isTransporter ? 'is-transporter' : 'is-zaap'}"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    }),
    title: `${node.name} ${coordLabel(node)}`,
    keyboard: false
  }).addTo(leafletMap);
}

function addLeafletStartMarker(world) {
  L.marker(dofusToLatLng(state.start, world), {
    pane: 'dofus-markers',
    icon: L.divIcon({
      className: '',
      html: '<div class="dj-start-marker"></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    }),
    title: `Depart ${coordLabel(state.start)}`,
    keyboard: false
  }).addTo(leafletMap);
}

function createRouteDivIcon(spot, resource) {
  const image = resource?.icon
    ? `<img src="${escapeHtml(resource.icon)}" alt="" loading="lazy" />`
    : '';
  return L.divIcon({
    className: '',
    html: `<div class="dj-route-marker ${state.focusedSpotId === spot.id ? 'is-focused' : ''}">
      ${image}
      <span>${spot.index}</span>
    </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

function createCandidateDivIcon(job, isFocused) {
  return L.divIcon({
    className: '',
    html: `<div class="dj-candidate-marker ${isFocused ? 'is-focused' : ''}" style="--job-color:${job.color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

function getLeafletInitialCenter(world) {
  if (state.mapFocus) return dofusToLatLng(state.mapFocus, world);
  if (state.plan.route.length) {
    const points = [state.start, ...state.plan.route];
    const center = points.reduce(
      (sum, point) => ({
        x: sum.x + Number(point.x) / points.length,
        y: sum.y + Number(point.y) / points.length
      }),
      { x: 0, y: 0 }
    );
    return dofusToLatLng(center, world);
  }
  return dofusToLatLng(state.start, world);
}

function syncLeafletMapState(world) {
  if (!leafletMap) return;
  state.mapFocus = latLngToDofusCenter(leafletMap.getCenter(), world);
  state.mapZoom = clampMapZoom(leafletMap.getZoom() + 1);
  app.querySelector('.zoom-readout')?.replaceChildren(`${Math.round(state.mapZoom * 100)}%`);
  saveState(state);
}

function setLeafletViewFromState() {
  const world = DOFUSDB_WORLDS[state.worldMap];
  if (!leafletMap || !world) return false;
  const scales = [...world.scales].sort((a, b) => a.x - b.x);
  const center = getLeafletInitialCenter(world);
  leafletMap.setView(center, toLeafletZoom(state.mapZoom, scales), { animate: false });
  syncLeafletMapState(world);
  return true;
}

function toLeafletZoom(mapZoom, scales) {
  return clamp(clampMapZoom(mapZoom) - 1, 0, scales.length - 1);
}

function dofusToLatLng(point, world) {
  return L.latLng(
    world.origineY + (Number(point.y) + 0.5) * world.mapHeight,
    world.origineX + (Number(point.x) + 0.5) * world.mapWidth
  );
}

function dofusCellBounds(point, world) {
  const x = world.origineX + Number(point.x) * world.mapWidth;
  const y = world.origineY + Number(point.y) * world.mapHeight;
  return L.latLngBounds([y, x], [y + world.mapHeight, x + world.mapWidth]);
}

function latLngToDofusCenter(latLng, world) {
  return {
    x: (Number(latLng.lng) - world.origineX) / world.mapWidth - 0.5,
    y: (Number(latLng.lat) - world.origineY) / world.mapHeight - 0.5
  };
}

function getBounds(points) {
  const xs = points.map((point) => Number(point.x));
  const ys = points.map((point) => Number(point.y));
  return {
    minX: Math.min(...xs) - 8,
    maxX: Math.max(...xs) + 8,
    minY: Math.min(...ys) - 8,
    maxY: Math.max(...ys) + 8
  };
}

function getWorldPixelBounds(points, world) {
  const pixelRects = points.map((point) => {
    const topLeft = dofusGridToPixel(point, world);
    return {
      minX: topLeft.x,
      maxX: topLeft.x + world.mapWidth,
      minY: topLeft.y,
      maxY: topLeft.y + world.mapHeight
    };
  });
  const minX = Math.min(...pixelRects.map((rect) => rect.minX));
  const maxX = Math.max(...pixelRects.map((rect) => rect.maxX));
  const minY = Math.min(...pixelRects.map((rect) => rect.minY));
  const maxY = Math.max(...pixelRects.map((rect) => rect.maxY));
  const padding = Math.max(world.mapWidth, world.mapHeight) * 8;

  return {
    minX: clamp(minX - padding, 0, world.totalWidth),
    maxX: clamp(maxX + padding, 0, world.totalWidth),
    minY: clamp(minY - padding, 0, world.totalHeight),
    maxY: clamp(maxY + padding, 0, world.totalHeight)
  };
}

function createProjector(bounds, width, height) {
  const padding = 56;
  const rangeX = bounds.maxX - bounds.minX || 1;
  const rangeY = bounds.maxY - bounds.minY || 1;
  return (point) => ({
    x: padding + ((Number(point.x) - bounds.minX) / rangeX) * (width - padding * 2),
    y: padding + ((Number(point.y) - bounds.minY) / rangeY) * (height - padding * 2)
  });
}

function createPixelProjection(bounds, width, height) {
  const padding = 34;
  const rangeX = bounds.maxX - bounds.minX || 1;
  const rangeY = bounds.maxY - bounds.minY || 1;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const scale = Math.min(usableWidth / rangeX, usableHeight / rangeY);
  const contentWidth = rangeX * scale;
  const contentHeight = rangeY * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;

  return {
    project: (point) => ({
      x: offsetX + (Number(point.x) - bounds.minX) * scale,
      y: offsetY + (Number(point.y) - bounds.minY) * scale
    }),
    unproject: (point) => ({
      x: bounds.minX + (Number(point.x) - offsetX) / scale,
      y: bounds.minY + (Number(point.y) - offsetY) / scale
    })
  };
}

function renderDofusDbTiles(pixelBounds, context) {
  const { world, projectPixel } = context;
  if (!world || !projectPixel || !pixelBounds) return '';

  const scale = getDofusDbScale(world, pixelBounds);
  const columns = Math.ceil((world.totalWidth * scale.x) / TILE_SIZE);
  const rows = Math.ceil((world.totalHeight * scale.y) / TILE_SIZE);
  const minTileX = clamp(Math.floor((pixelBounds.minX * scale.x) / TILE_SIZE) - 1, 0, columns - 1);
  const maxTileX = clamp(Math.ceil((pixelBounds.maxX * scale.x) / TILE_SIZE) + 1, 0, columns - 1);
  const minTileY = clamp(Math.floor((pixelBounds.minY * scale.y) / TILE_SIZE) - 1, 0, rows - 1);
  const maxTileY = clamp(Math.ceil((pixelBounds.maxY * scale.y) / TILE_SIZE) + 1, 0, rows - 1);
  const tiles = [];

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const tileNumber = tileY * columns + tileX + 1;
      const topLeft = projectPixel({
        x: (tileX * TILE_SIZE) / scale.x,
        y: (tileY * TILE_SIZE) / scale.y
      });
      const bottomRight = projectPixel({
        x: ((tileX + 1) * TILE_SIZE) / scale.x,
        y: ((tileY + 1) * TILE_SIZE) / scale.y
      });
      const x = Math.min(topLeft.x, bottomRight.x);
      const y = Math.min(topLeft.y, bottomRight.y);
      const width = Math.abs(bottomRight.x - topLeft.x);
      const height = Math.abs(bottomRight.y - topLeft.y);
      const href = `https://api.dofusdb.fr/img/worlds/${world.id}/${scale.name}/${tileNumber}.jpg`;
      tiles.push(`
        <image class="dofusdb-tile" href="${href}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" preserveAspectRatio="none" />
      `);
    }
  }

  return `<g class="dofusdb-tiles">${tiles.join('')}</g>`;
}

function parseViewBox(value) {
  const [x, y, width, height] = String(value).split(/\s+/).map(Number);
  return { x, y, width, height };
}

function getVisiblePixelBounds(viewBox, context) {
  if (!context.unprojectPixel || !context.pixelBounds) return null;
  const visible = parseViewBox(viewBox);
  const topLeft = context.unprojectPixel({ x: visible.x, y: visible.y });
  const bottomRight = context.unprojectPixel({
    x: visible.x + visible.width,
    y: visible.y + visible.height
  });
  const padding = Math.max(context.world.mapWidth, context.world.mapHeight) * clamp(7 / clampMapZoom(state.mapZoom), 2, 5);

  return {
    minX: clamp(Math.min(topLeft.x, bottomRight.x) - padding, 0, context.world.totalWidth),
    maxX: clamp(Math.max(topLeft.x, bottomRight.x) + padding, 0, context.world.totalWidth),
    minY: clamp(Math.min(topLeft.y, bottomRight.y) - padding, 0, context.world.totalHeight),
    maxY: clamp(Math.max(topLeft.y, bottomRight.y) + padding, 0, context.world.totalHeight)
  };
}

function getDofusDbScale(world, pixelBounds) {
  const zoom = clampMapZoom(state.mapZoom);
  const target = zoom >= 4.2 ? 1 : zoom >= 3.4 ? 0.8 : zoom >= 2.6 ? 0.6 : zoom >= 2.1 ? 0.4 : 0.2;
  const targetIndex = Math.max(0, world.scales.findIndex((scale) => scale.name === String(target)));

  for (let index = targetIndex; index >= 0; index -= 1) {
    const scale = world.scales[index];
    if (countTilesForScale(world, pixelBounds, scale) <= MAX_RASTER_TILES) return scale;
  }

  return world.scales[0];
}

function countTilesForScale(world, pixelBounds, scale) {
  const columns = Math.ceil((world.totalWidth * scale.x) / TILE_SIZE);
  const rows = Math.ceil((world.totalHeight * scale.y) / TILE_SIZE);
  const minTileX = clamp(Math.floor((pixelBounds.minX * scale.x) / TILE_SIZE) - 1, 0, columns - 1);
  const maxTileX = clamp(Math.ceil((pixelBounds.maxX * scale.x) / TILE_SIZE) + 1, 0, columns - 1);
  const minTileY = clamp(Math.floor((pixelBounds.minY * scale.y) / TILE_SIZE) - 1, 0, rows - 1);
  const maxTileY = clamp(Math.ceil((pixelBounds.maxY * scale.y) / TILE_SIZE) + 1, 0, rows - 1);
  return Math.max(0, maxTileX - minTileX + 1) * Math.max(0, maxTileY - minTileY + 1);
}

function dofusGridToPixel(point, world) {
  return {
    x: world.origineX + Number(point.x) * world.mapWidth,
    y: world.origineY + Number(point.y) * world.mapHeight
  };
}

function dofusCenterToPixel(point, world) {
  return {
    x: world.origineX + (Number(point.x) + 0.5) * world.mapWidth,
    y: world.origineY + (Number(point.y) + 0.5) * world.mapHeight
  };
}

function pixelToDofusCenter(point, world) {
  return {
    x: (Number(point.x) - world.origineX) / world.mapWidth - 0.5,
    y: (Number(point.y) - world.origineY) / world.mapHeight - 0.5
  };
}

function unprojectMapPoint(point, bounds, width, height) {
  const padding = 56;
  const rangeX = bounds.maxX - bounds.minX || 1;
  const rangeY = bounds.maxY - bounds.minY || 1;
  return {
    x: bounds.minX + ((point.x - padding) / (width - padding * 2)) * rangeX,
    y: bounds.minY + ((point.y - padding) / (height - padding * 2)) * rangeY
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function renderGrid(bounds, width, height, project) {
  const lines = [];
  const minX = Math.ceil(bounds.minX / 10) * 10;
  const maxX = Math.floor(bounds.maxX / 10) * 10;
  const minY = Math.ceil(bounds.minY / 10) * 10;
  const maxY = Math.floor(bounds.maxY / 10) * 10;

  for (let x = minX; x <= maxX; x += 10) {
    const from = project({ x, y: bounds.minY });
    const to = project({ x, y: bounds.maxY });
    lines.push(`<line class="grid-line" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`);
    lines.push(`<text class="grid-label" x="${from.x + 4}" y="${height - 18}">${x}</text>`);
  }

  for (let y = minY; y <= maxY; y += 10) {
    const from = project({ x: bounds.minX, y });
    const to = project({ x: bounds.maxX, y });
    lines.push(`<line class="grid-line" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`);
    lines.push(`<text class="grid-label" x="16" y="${from.y - 4}">${y}</text>`);
  }

  return `<g class="map-grid">${lines.join('')}</g>`;
}

function renderMapCells(mapCells, project, plan) {
  const candidateMapIds = new Set(
    plan.candidates
      .slice(0, 500)
      .map((spot) => spot.mapId)
      .filter(Boolean)
  );
  const routeMapIds = new Set(plan.route.map((spot) => spot.mapId).filter(Boolean));
  const harvestable = [];
  const route = [];

  for (const map of mapCells) {
    const isCandidate = candidateMapIds.has(map.id);
    const isRoute = routeMapIds.has(map.id);
    if (!isCandidate && !isRoute) continue;

    const topLeft = project(map);
    const bottomRight = project({ x: Number(map.x) + 1, y: Number(map.y) + 1 });
    const path = rectPath(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    if (isCandidate) harvestable.push(path);
    if (isRoute) route.push(path);
  }

  return `
    <g class="map-cells">
      <path class="map-cell-layer map-cell-harvestable" d="${harvestable.join(' ')}"></path>
      <path class="map-cell-layer map-cell-route" d="${route.join(' ')}"></path>
    </g>
  `;
}

function rectPath(x, y, width, height) {
  return `M${x.toFixed(2)} ${y.toFixed(2)}h${width.toFixed(2)}v${height.toFixed(2)}h-${width.toFixed(2)}Z`;
}

function renderContinents(project) {
  const regions = [
    {
      className: 'region-amakna',
      label: 'Amakna',
      points: [
        [-12, -29],
        [18, -31],
        [26, -12],
        [16, 29],
        [-13, 33],
        [-26, 11],
        [-22, -12]
      ]
    },
    {
      className: 'region-cania',
      label: 'Cania',
      points: [
        [-39, -62],
        [-8, -57],
        [-3, -34],
        [-18, -14],
        [-39, -22],
        [-47, -45]
      ]
    },
    {
      className: 'region-frigost',
      label: 'Frigost',
      points: [
        [-88, -52],
        [-67, -54],
        [-59, -36],
        [-76, -27],
        [-92, -36]
      ]
    },
    {
      className: 'region-otomai',
      label: 'Otomai',
      points: [
        [-65, 7],
        [-43, 8],
        [-37, 29],
        [-52, 39],
        [-68, 28]
      ]
    },
    {
      className: 'region-pandala',
      label: 'Pandala',
      points: [
        [16, -45],
        [37, -42],
        [42, -26],
        [30, -16],
        [14, -24]
      ]
    },
    {
      className: 'region-south',
      label: 'Sud',
      points: [
        [-33, 18],
        [-15, 3],
        [2, 12],
        [4, 41],
        [-20, 47],
        [-38, 35]
      ]
    },
    {
      className: 'region-moon',
      label: 'Moon',
      points: [
        [25, 3],
        [42, 4],
        [49, 19],
        [38, 31],
        [23, 23]
      ]
    }
  ];

  return regions
    .map((region) => {
      const points = region.points.map(([x, y]) => project({ x, y }));
      const polygon = points.map((point) => `${point.x},${point.y}`).join(' ');
      const center = points.reduce(
        (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
        { x: 0, y: 0 }
      );
      return `
        <g class="continent ${region.className}" filter="url(#softShadow)">
          <polygon points="${polygon}" />
          <text x="${center.x}" y="${center.y}">${region.label}</text>
        </g>
      `;
    })
    .join('');
}

function renderSpotMarker(spot, project, resourceMap, candidateIds, routeIds) {
  const point = project(spot);
  const dominantJob = getDominantJob(spot);
  const dominantResource = getDominantResource(spot, resourceMap);
  const job = JOBS[dominantJob] || JOBS.miner;
  const isCandidate = candidateIds.has(spot.id);
  const isRoute = routeIds.has(spot.id);
  const isFocused = state.focusedSpotId === spot.id;
  const quantity = Object.values(spot.resources || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const radius = isRoute ? 10 : isFocused ? 8 : isCandidate ? 3.4 : 2.5;
  const iconSize = isRoute ? 20 : 15;
  const className = [
    'spot-marker',
    isCandidate ? 'is-candidate' : 'is-muted',
    isRoute ? 'is-route' : '',
    isFocused ? 'is-focused' : ''
  ].join(' ');
  const title = getSpotTitle(spot, resourceMap);

  return `
    <g class="${className}" data-action="focus-spot" data-spot-id="${spot.id}" transform="translate(${point.x} ${point.y})" style="--job-color:${job.color};--job-soft:${job.softColor}">
      <circle r="${radius}"></circle>
      ${
        dominantResource?.icon && (isRoute || isFocused)
          ? `<image class="spot-resource-icon" href="${escapeHtml(dominantResource.icon)}" x="${-iconSize / 2}" y="${-iconSize / 2}" width="${iconSize}" height="${iconSize}" />`
          : ''
      }
      <title>${escapeHtml(title)}</title>
    </g>
  `;
}

function getDominantResource(spot, resourceMap) {
  return Object.entries(spot.resources || {})
    .map(([resourceId, quantity]) => ({
      resource: resourceMap.get(resourceId),
      quantity: Number(quantity || 0)
    }))
    .filter((item) => item.resource)
    .sort((a, b) => b.quantity - a.quantity || b.resource.level - a.resource.level)[0]?.resource;
}

function renderTravelMarker(node, project) {
  const point = project(node);
  const isTransporter = node.type === 'transporter';
  return `
    <g class="${isTransporter ? 'transporter-marker' : 'zaap-marker'}" transform="translate(${point.x} ${point.y})">
      ${
        isTransporter
          ? '<path d="M-9 -8 H9 L5 9 H-5 Z"></path><circle r="3"></circle>'
          : '<path d="M0 -9 L9 0 L0 9 L-9 0 Z"></path><circle r="3"></circle>'
      }
      <title>${escapeHtml(node.name)} ${coordLabel(node)}</title>
    </g>
  `;
}

function renderRouteSegment(segment, project) {
  const from = project(segment.from);
  const to = project(segment.to);
  const className = segment.mode === 'zaap' ? 'route-line route-line-zaap' : 'route-line route-line-walk';
  return `<line class="${className}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
}

function renderRoutePin(step, project) {
  const point = project(step);
  const command = travelCommand(step);
  return `
    <g class="route-pin" data-action="focus-spot" data-spot-id="${step.id}" transform="translate(${point.x} ${point.y})">
      <circle r="15"></circle>
      <text y="5">${step.index}</text>
      <title>${escapeHtml(command)} - ${escapeHtml(step.name)}</title>
    </g>
  `;
}

function renderFocusedSpot() {
  if (!state.focusedSpotId) return '';
  const spot = getCurrentSpots().find((item) => item.id === state.focusedSpotId) || state.plan.route.find((item) => item.id === state.focusedSpotId);
  if (!spot) return '';
  const resourceMap = getResourceMap();
  const resources = Object.entries(spot.resources || {})
    .map(([resourceId, quantity]) => {
      const resource = resourceMap.get(resourceId);
      if (!resource) return '';
      const job = JOBS[resource.job];
      const active = state.selectedResourceIds.has(resourceId) && resource.level <= state.levels[resource.job];
      return `
        <span class="spot-resource ${active ? 'is-active' : ''}" style="--job-color:${job.color};--job-soft:${job.softColor}">
          ${escapeHtml(resource.name)} x${quantity}
        </span>
      `;
    })
    .join('');

  return `
    <div class="spot-popover">
      <div>
        <span class="eyebrow">${escapeHtml(spot.zone || 'Zone')}</span>
        <strong>${escapeHtml(spot.name)}</strong>
      </div>
      ${renderTravelCommandButton(spot, 'popover-command')}
      <div class="spot-resource-list">${resources}</div>
    </div>
  `;
}

function getDominantJob(spot) {
  const resourceMap = getResourceMap();
  const totals = {};

  for (const [resourceId, quantity] of Object.entries(spot.resources || {})) {
    const resource = resourceMap.get(resourceId);
    if (!resource) continue;
    totals[resource.job] = (totals[resource.job] || 0) + Number(quantity || 0);
  }

  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'miner';
}

function getSpotTitle(spot, resourceMap) {
  const resources = Object.entries(spot.resources || {})
    .map(([resourceId, quantity]) => {
      const resource = resourceMap.get(resourceId);
      return resource ? `${resource.name} x${quantity}` : `${resourceId} x${quantity}`;
    })
    .join(', ');

  return `${spot.name} ${coordLabel(spot)} · ${resources}`;
}

function iconName(name) {
  return name.replace(/[A-Z]/g, (match, index) => `${index ? '-' : ''}${match.toLowerCase()}`);
}

function bindEvents() {
  app.querySelector('#start-x')?.addEventListener('change', (event) => {
    state.start.x = Number(event.target.value || 0);
    rerender();
  });
  app.querySelector('#start-y')?.addEventListener('change', (event) => {
    state.start.y = Number(event.target.value || 0);
    rerender();
  });
  app.querySelector('#max-stops')?.addEventListener('change', (event) => {
    state.maxStops = Math.min(60, Math.max(1, Number(event.target.value || 24)));
    rerender();
  });
  app.querySelector('#world-map')?.addEventListener('change', (event) => {
    state.worldMap = Number(event.target.value || 1);
    state.focusedSpotId = null;
    state.mapFocus = null;
    state.mapZoom = 1;
    rerender();
  });
  app.querySelector('#resource-search')?.addEventListener('input', (event) => {
    state.search = event.target.value;
    rerender(false);
    requestAnimationFrame(() => {
      const input = app.querySelector('#resource-search');
      input?.focus();
      input?.setSelectionRange(state.search.length, state.search.length);
    });
  });
  app.querySelector('#dataset-file')?.addEventListener('change', handleDatasetImport);

  app.querySelectorAll('.job-level').forEach((input) => {
    input.addEventListener('change', (event) => {
      const jobId = event.currentTarget.dataset.job;
      state.levels[jobId] = Math.min(200, Math.max(1, Number(event.currentTarget.value || 1)));
      pruneUnavailableSelection();
      rerender();
    });
  });

  app.querySelectorAll('.resource-toggle').forEach((input) => {
    input.addEventListener('change', (event) => {
      const resourceId = event.currentTarget.dataset.resourceId;
      if (event.currentTarget.checked) {
        state.selectedResourceIds.add(resourceId);
      } else {
        state.selectedResourceIds.delete(resourceId);
      }
      rerender(true, { preserveScroll: true });
    });
  });

  app.querySelectorAll('.priority-range').forEach((input) => {
    input.addEventListener('input', (event) => {
      const value = Number(event.currentTarget.value);
      state.priorities[event.currentTarget.dataset.resourceId] = value;
      event.currentTarget
        .closest('.priority-control')
        ?.querySelector('.priority-value')
        ?.replaceChildren(String(value));
      saveState(state);
    });
    input.addEventListener('change', () => {
      rerender(true, { preserveScroll: true });
    });
  });

  app.querySelectorAll('[data-action]').forEach((element) => {
    element.addEventListener('click', handleAction);
  });
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  if (!action) return;

  if (action === 'copy-travel') {
    event.stopPropagation();
    copyTravel(event.currentTarget.dataset.command);
    return;
  }

  if (action === 'toggle-job') {
    const jobId = event.currentTarget.dataset.job;
    if (state.enabledJobs.has(jobId)) {
      state.enabledJobs.delete(jobId);
      for (const resource of state.dataset.resources.filter((item) => item.job === jobId)) {
        state.selectedResourceIds.delete(resource.id);
      }
    } else {
      state.enabledJobs.add(jobId);
      for (const resourceId of getDefaultSelection(state.dataset.resources, state.levels, [jobId])) {
        state.selectedResourceIds.add(resourceId);
      }
    }
    if (!state.enabledJobs.size) state.enabledJobs.add(jobId);
    rerender();
    return;
  }

  if (action === 'set-levels') {
    const level = Number(event.currentTarget.dataset.level || 80);
    for (const jobId of JOB_ORDER) state.levels[jobId] = level;
    state.selectedResourceIds = new Set(getDefaultSelection(state.dataset.resources, state.levels, state.enabledJobs));
    rerender();
    return;
  }

  if (action === 'set-priority-mode') {
    state.priorityMode = event.currentTarget.dataset.mode;
    rerender();
    return;
  }

  if (action === 'auto-select') {
    state.selectedResourceIds = new Set(getDefaultSelection(state.dataset.resources, state.levels, state.enabledJobs));
    rerender();
    return;
  }

  if (action === 'select-visible') {
    for (const resource of getVisibleResources().filter((item) => item.isAvailable)) {
      state.selectedResourceIds.add(resource.id);
    }
    rerender();
    return;
  }

  if (action === 'toggle-zaap-routing') {
    state.preferZaaps = !state.preferZaaps;
    rerender();
    return;
  }

  if (action === 'toggle-grid') {
    state.showGrid = !state.showGrid;
    rerender();
    return;
  }

  if (action === 'toggle-zaaps') {
    state.showZaaps = !state.showZaaps;
    rerender();
    return;
  }

  if (action === 'zoom-in') {
    state.mapZoom = clampMapZoom(state.mapZoom * 1.25);
    if (setLeafletViewFromState()) return;
    rerender(true, { preserveScroll: true });
    return;
  }

  if (action === 'zoom-out') {
    state.mapZoom = clampMapZoom(state.mapZoom / 1.25);
    if (setLeafletViewFromState()) return;
    rerender(true, { preserveScroll: true });
    return;
  }

  if (action === 'focus-route') {
    focusRoute();
    if (setLeafletViewFromState()) return;
    rerender(true, { preserveScroll: true });
    return;
  }

  if (action === 'reset-map-view') {
    state.mapZoom = 1;
    state.mapFocus = null;
    if (setLeafletViewFromState()) return;
    rerender(true, { preserveScroll: true });
    return;
  }

  if (action === 'focus-spot') {
    focusSpot(event.currentTarget.dataset.spotId);
    rerender(true, { preserveScroll: true });
    return;
  }

  if (action === 'export-route') {
    copyRoute();
    return;
  }

  if (action === 'reset-app') {
    clearState();
    state = createInitialState();
    rerender();
  }
}

function focusSpot(spotId) {
  state.focusedSpotId = spotId;
  const spot = getCurrentSpots().find((item) => item.id === spotId) || state.plan.route.find((item) => item.id === spotId);
  if (!spot) return;
  state.mapFocus = { x: Number(spot.x), y: Number(spot.y) };
  state.mapZoom = Math.max(state.mapZoom, 2.2);
}

function focusRoute() {
  const points = [state.start, ...state.plan.route];
  if (!points.length) return;
  const center = points.reduce(
    (sum, point) => ({
      x: sum.x + Number(point.x) / points.length,
      y: sum.y + Number(point.y) / points.length
    }),
    { x: 0, y: 0 }
  );

  state.mapFocus = center;
  state.mapZoom = Math.max(state.mapZoom, 1.55);
}

async function handleDatasetImport(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = validateDataset(JSON.parse(text));
    state.dataset = imported;
    planningSpotCache.clear();
    state.enabledJobs = new Set(JOB_ORDER.filter((jobId) => imported.resources.some((resource) => resource.job === jobId)));
    state.selectedResourceIds = new Set(getDefaultSelection(imported.resources, state.levels, state.enabledJobs));
    state.focusedSpotId = null;
    state.mapFocus = null;
    state.mapZoom = 1;
    state.notice = `Import charge: ${imported.resources.length} ressources, ${imported.spots.length} spots.`;
  } catch (error) {
    state.notice = error.message || 'Import impossible.';
  }

  rerender();
}

function pruneUnavailableSelection() {
  const resourceMap = getResourceMap();
  for (const resourceId of [...state.selectedResourceIds]) {
    const resource = resourceMap.get(resourceId);
    if (!resource) {
      state.selectedResourceIds.delete(resourceId);
      continue;
    }
    if (resource.level > Number(state.levels[resource.job] || 1)) {
      state.selectedResourceIds.delete(resourceId);
    }
  }
}

function captureScrollSnapshot() {
  return {
    windowX: window.scrollX,
    windowY: window.scrollY,
    leftPanel: app.querySelector('.panel-left')?.scrollTop || 0,
    rightPanel: app.querySelector('.panel-right')?.scrollTop || 0,
    resourceList: app.querySelector('.resource-list')?.scrollTop || 0
  };
}

function restoreScrollSnapshot(snapshot) {
  if (!snapshot) return;
  const restore = () => {
    const leftPanel = app.querySelector('.panel-left');
    const rightPanel = app.querySelector('.panel-right');
    const resourceList = app.querySelector('.resource-list');

    if (leftPanel) leftPanel.scrollTop = snapshot.leftPanel;
    if (rightPanel) rightPanel.scrollTop = snapshot.rightPanel;
    if (resourceList) resourceList.scrollTop = snapshot.resourceList;
    window.scrollTo(snapshot.windowX, snapshot.windowY);
  };

  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
    window.setTimeout(restore, 80);
  });
}

function rerender(clearNotice = true, options = {}) {
  const scrollSnapshot = options.preserveScroll ? captureScrollSnapshot() : null;
  if (clearNotice) state.notice = '';
  render();
  restoreScrollSnapshot(scrollSnapshot);
}

async function copyRoute() {
  const text = exportRouteText(state.plan);
  const copied = await copyText(text, 'dofusjob-route.txt');
  showToast(copied ? 'Route copiee' : 'Route telechargee');
}

async function copyTravel(command) {
  if (!command) return;
  const copied = await copyText(command, 'dofusjob-travel.txt');
  showToast(copied ? `${command} copie` : 'Commande telechargee');
}

async function copyText(text, filename) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    downloadText(filename, text);
    return false;
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function showToast(message) {
  const host = app.querySelector('.toast-stack');
  if (!host) return;
  host.innerHTML = `
    <div class="toast">
      <i data-lucide="copy"></i>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  createIcons({ icons: ICONS });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    host.innerHTML = '';
  }, 1800);
}

render();
