import './styles.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import brandMark from './assets/dofusjob-mark.png';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  Crosshair,
  Fish,
  FlaskConical,
  Gauge,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Navigation,
  Pickaxe,
  Play,
  RefreshCcw,
  Route,
  Search,
  Sparkles,
  Target,
  Timer,
  TreePine,
  Wheat,
  Zap,
  ZoomIn,
  ZoomOut,
  createIcons
} from 'lucide';
import { JOB_ORDER, JOBS } from './data/jobs.js';
import { DOFUS_DATA } from './generated/dofusData.js';
import {
  buildRoute,
  coordLabel,
  exportRouteText,
  getDefaultSelection,
  getHarvestXp,
  travelCommand
} from './lib/routePlanner.js';
import { clearState, loadState, saveState } from './lib/storage.js';

const ICONS = {
  ArrowRight,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  Crosshair,
  Fish,
  FlaskConical,
  Gauge,
  LocateFixed,
  Map: MapIcon,
  MapPin,
  Navigation,
  Pickaxe,
  Play,
  RefreshCcw,
  Route,
  Search,
  Sparkles,
  Target,
  Timer,
  TreePine,
  Wheat,
  Zap,
  ZoomIn,
  ZoomOut
};

const WORLD = {
  id: 1,
  origineX: 6480,
  origineY: 4944,
  mapWidth: 69.5,
  mapHeight: 49.70000076293945,
  totalWidth: 10000,
  totalHeight: 8000,
  scales: [
    { name: '0.2', x: 0.2, y: 0.2 },
    { name: '0.4', x: 0.4, y: 0.4 },
    { name: '0.6', x: 0.6, y: 0.6 },
    { name: '0.8', x: 0.8, y: 0.8 },
    { name: '1', x: 1, y: 1 },
    { name: 'custom2', x: 2.02023381294964, y: 2.0189889169997874 },
    { name: 'custom3', x: 3.0404676258992804, y: 3.037977833999575 },
    { name: 'custom4', x: 4.060701438848921, y: 4.056966750999362 },
    { name: 'custom5', x: 5.080935251798561, y: 5.07595566799915 },
    { name: 'custom7', x: 7.121402877697841, y: 7.113933501998725 },
    { name: 'custom9', x: 9.161870503597122, y: 9.1519113359983 },
    { name: 'custom12', x: 12.222571942446042, y: 12.208878086997661 },
    { name: 'custom15', x: 15.283273381294963, y: 15.265844837997024 },
    { name: 'custom17', x: 17.323741007194243, y: 17.3038226719966 }
  ]
};
const TILE_SIZE = 250;
const DEFAULT_LEVELS = Object.fromEntries(JOB_ORDER.map((job) => [job, 1]));
const app = document.querySelector('#app');
const dataset = DOFUS_DATA;
const resourceMap = new Map(dataset.resources.map((resource) => [String(resource.id), resource]));
const resourceStats = buildResourceStats();

let map = null;
let mapOverlay = null;
let mapGrid = null;
let state = createState();
let refreshFrame = null;
let toastTimer = null;

function createState() {
  const saved = loadState();
  const primaryJob = JOB_ORDER.includes(saved?.primaryJob) ? saved.primaryJob : null;
  const levels = { ...DEFAULT_LEVELS, ...(saved?.levels || {}) };
  const enabledJobs = new Set(saved?.enabledJobs || []);
  if (primaryJob) enabledJobs.add(primaryJob);
  const selected = (saved?.selectedResourceIds || []).filter((id) => resourceMap.has(String(id)));
  const selectedResourceIds = new Set(
    selected.length ? selected.map(String) : getDefaultSelection(dataset.resources, levels, enabledJobs)
  );

  return {
    levels,
    profileReady: saved?.profileReady === true && Boolean(primaryJob),
    primaryJob,
    enabledJobs,
    objective: saved?.objective === 'resource' ? 'resource' : 'xp',
    selectedResourceIds,
    start: saved?.start || { x: 5, y: -18 },
    startMode: saved?.startMode === 'manual' ? 'manual' : 'auto',
    worldMap: 1,
    maxStops: clamp(Number(saved?.maxStops) || 24, 6, 80),
    preferZaaps: saved?.preferZaaps !== false,
    mapCenter: saved?.mapCenter || null,
    mapZoom: Number(saved?.mapZoom ?? 2),
    resourceSearch: '',
    activeStepIndex: 0,
    plan: null
  };
}

function buildResourceStats() {
  const stats = new Map(dataset.resources.map((resource) => [String(resource.id), { maps: 0, nodes: 0 }]));
  for (const spot of dataset.spots) {
    for (const [id, quantity] of Object.entries(spot.resources || {})) {
      const item = stats.get(String(id));
      if (!item) continue;
      item.maps += 1;
      item.nodes += Number(quantity) || 0;
    }
  }
  return stats;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[character]);
}

function currentSpots() {
  return dataset.spots.filter((spot) => Number(spot.worldMap) === 1);
}

function currentTravelNodes() {
  return [...dataset.zaaps, ...(dataset.transporters || [])].filter(
    (node) => Number(node.worldMap || 1) === 1
  );
}

function computePlan() {
  state.plan = buildRoute({
    resources: dataset.resources,
    spots: currentSpots(),
    zaaps: currentTravelNodes(),
    selectedResourceIds: state.profileReady ? [...state.selectedResourceIds] : [],
    enabledJobs: state.profileReady ? [...state.enabledJobs] : [],
    levels: state.levels,
    objective: state.objective,
    start: state.startMode === 'manual' ? state.start : null,
    maxStops: state.maxStops,
    preferZaaps: state.preferZaaps
  });
  state.activeStepIndex = Math.min(state.activeStepIndex, Math.max(0, state.plan.route.length - 1));
  saveState(state);
}

function renderShell() {
  computePlan();
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand"><img class="brand-icon" src="${brandMark}" alt="" /><span><strong>DofusJob</strong><small>Routes de récolte</small></span></div>
        <div class="truth-badge"><span></span> ${currentSpots().length.toLocaleString('fr-FR')} maps vérifiées</div>
        ${state.profileReady ? '<button class="button button-quiet" type="button" data-action="copy-route"><i data-lucide="clipboard"></i> Copier la boucle</button>' : '<span class="profile-status">Configure ton profil pour commencer</span>'}
      </header>
      <div class="workspace">
        <aside class="setup-panel" id="setup-panel"></aside>
        <main class="map-panel">
          <div class="map-head" id="map-head"></div>
          <div class="map-frame">
            <div id="dofus-map" class="dofus-map" aria-label="Carte du Monde des Douze"></div>
            <div class="map-controls">
              <button type="button" data-action="zoom-in" aria-label="Zoomer"><i data-lucide="zoom-in"></i></button>
              <button type="button" data-action="zoom-out" aria-label="Dézoomer"><i data-lucide="zoom-out"></i></button>
              <button type="button" data-action="fit-route" aria-label="Centrer la route"><i data-lucide="crosshair"></i></button>
            </div>
          </div>
        </main>
        <aside class="run-panel" id="run-panel"></aside>
      </div>
      <div class="toast" id="toast" aria-live="polite"></div>
    </div>
  `;
  renderSetup();
  renderMapHead();
  renderRun();
  createIcons({ icons: ICONS });
  mountMap();
}

function renderSetup(preserveScroll = false) {
  const panel = app.querySelector('#setup-panel');
  if (!panel) return;
  const oldScroll = preserveScroll ? panel.querySelector('.resource-list')?.scrollTop || 0 : 0;
  const primary = state.primaryJob ? JOBS[state.primaryJob] : null;
  const resources = getPickerResources();
  panel.innerHTML = `
    <div class="setup-intro">
      <span class="eyebrow">Prépare ta sortie</span>
      <strong>Qu’est-ce qu’on monte aujourd’hui ?</strong>
      <p>Renseigne tes niveaux, DofusJob s’occupe du point de départ et de l’ordre des maps.</p>
    </div>
    <section class="setup-block">
      <div class="step-label"><span>1</span><div><strong>Tes métiers</strong><small>Choisis le métier principal</small></div></div>
      <div class="job-tabs">
        ${JOB_ORDER.map((id) => {
          const job = JOBS[id];
          return `<button type="button" class="job-tab ${id === state.primaryJob ? 'is-active' : ''}" data-action="primary-job" data-job="${id}" aria-pressed="${id === state.primaryJob}"><span class="job-art"><img src="${escapeHtml(jobResourceIcon(id))}" alt="" /></span><span>${escapeHtml(job.label)}</span></button>`;
        }).join('')}
      </div>
      ${primary ? `<label class="level-field">
        <span><b>${escapeHtml(primary.label)}</b><small>Niveau actuel</small></span>
        <input id="primary-level" type="number" min="1" max="200" value="${state.levels[state.primaryJob]}" />
      </label>` : '<div class="choose-job-hint">Choisis le métier que tu veux monter.</div>'}
      <details class="mix-jobs" ${primary ? '' : 'hidden'}>
        <summary><span>Mixer d’autres métiers</span><small>Récolter ce qui est rentable sur le passage</small></summary>
        <div class="mix-list">
          ${JOB_ORDER.filter((id) => id !== state.primaryJob).map((id) => `
            <label><input type="checkbox" data-secondary-job="${id}" ${state.enabledJobs.has(id) ? 'checked' : ''} /><img src="${escapeHtml(jobResourceIcon(id))}" alt="" /><span>${escapeHtml(JOBS[id].label)}</span><input class="mini-level" type="number" min="1" max="200" data-job-level="${id}" value="${state.levels[id]}" aria-label="Niveau ${escapeHtml(JOBS[id].label)}" /></label>
          `).join('')}
        </div>
      </details>
    </section>
    <section class="setup-block objective-block">
      <div class="step-label"><span>2</span><div><strong>Ta priorité</strong><small>Ce que le calcul doit favoriser</small></div></div>
      <div class="objective-switch">
        <button type="button" data-action="objective" data-objective="xp" class="${state.objective === 'xp' ? 'is-active' : ''}"><i data-lucide="gauge"></i><span><strong>Monter vite</strong><small>Meilleure XP par minute</small></span></button>
        <button type="button" data-action="objective" data-objective="resource" class="${state.objective === 'resource' ? 'is-active' : ''}"><i data-lucide="target"></i><span><strong>Faire du stock</strong><small>Ressources précises</small></span></button>
      </div>
      ${state.objective === 'xp' ? renderXpExplanation() : renderResourcePicker(resources)}
    </section>
    <section class="setup-block route-options">
      <div class="step-label"><span>3</span><div><strong>Ta sortie</strong><small>Longueur et point de départ</small></div></div>
      <label class="length-control">
        <span><b>Nombre maximum de maps</b><output id="route-length-output">${state.maxStops} max</output></span>
        <input id="route-length" type="range" min="6" max="80" step="1" value="${state.maxStops}" />
        <small>Le calcul s'arrête plus tôt s'il n'y a plus de map rentable à ton niveau.</small>
      </label>
      <div class="start-choice">
        <span class="option-title">Point de départ</span>
        <div class="start-segments">
          <button type="button" data-action="start-mode" data-mode="auto" class="${state.startMode === 'auto' ? 'is-active' : ''}"><i data-lucide="sparkles"></i><span><strong>Le plus rentable</strong><small>Je peux partir de n’importe où</small></span></button>
          <button type="button" data-action="start-mode" data-mode="manual" class="${state.startMode === 'manual' ? 'is-active' : ''}"><i data-lucide="map-pin"></i><span><strong>Ma position</strong><small>Optimiser depuis une coordonnée</small></span></button>
        </div>
      </div>
      ${state.startMode === 'manual' ? `<div class="manual-start">
        <span>Coordonnées actuelles</span>
        <label>X <input id="start-x" type="number" value="${state.start.x}" /></label>
        <label>Y <input id="start-y" type="number" value="${state.start.y}" /></label>
      </div>` : '<div class="auto-start-note"><i data-lucide="locate-fixed"></i><span>Le premier <code>/travel</code> t’emmènera directement sur la meilleure map.</span></div>'}
      <label class="fast-travel"><input id="fast-travel" type="checkbox" ${state.preferZaaps ? 'checked' : ''} /> Utiliser zaaps et transporteurs</label>
      <button type="button" class="button button-primary button-block" data-action="calculate" ${primary ? '' : 'disabled'}><i data-lucide="play"></i> ${state.profileReady ? 'Mettre la boucle à jour' : 'Calculer ma meilleure boucle'}</button>
    </section>
    <footer class="data-credit">Données issues de DofusDB. Utilisation soumise à la LPNC-IA 1.0.<br />Cartes et illustrations © Ankama.</footer>
  `;
  createIcons({ icons: ICONS });
  const list = panel.querySelector('.resource-list');
  if (list) list.scrollTop = oldScroll;
}

function renderXpExplanation() {
  const jobs = [...state.enabledJobs].map((id) => JOBS[id].label).join(' + ');
  return `
    <div class="mode-explanation">
      <div class="synergy-art">${[...state.enabledJobs].slice(0, 3).map((id) => `<img src="${escapeHtml(jobResourceIcon(id))}" alt="" />`).join('')}</div>
      <div><strong>Chaque map est évaluée dans son ensemble.</strong><p>Trois ressources intéressantes au même endroit passent devant un node isolé plus haut niveau lorsque la map rapporte davantage.</p><small>${escapeHtml(jobs)} · ressources accessibles à tes niveaux</small></div>
    </div>
  `;
}

function jobResourceIcon(jobId) {
  const candidates = dataset.resources
    .filter((resource) => resource.job === jobId && resource.icon)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return candidates[0]?.icon || '';
}

function getPickerResources() {
  const query = normalize(state.resourceSearch);
  return dataset.resources
    .filter((resource) => state.enabledJobs.has(resource.job))
    .filter((resource) => resource.level <= Number(state.levels[resource.job] || 1))
    .filter((resource) => !query || normalize(resource.name).includes(query))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

function renderResourcePicker(resources) {
  return `
    <label class="resource-search"><i data-lucide="search"></i><input id="resource-search" type="search" placeholder="Chercher une ressource" value="${escapeHtml(state.resourceSearch)}" /></label>
    <div class="resource-list">
      ${resources.map((resource) => {
        const selected = state.selectedResourceIds.has(String(resource.id));
        const stats = resourceStats.get(String(resource.id));
        return `<label class="resource-item ${selected ? 'is-selected' : ''}">
          <input type="checkbox" data-resource="${resource.id}" ${selected ? 'checked' : ''} />
          <img src="${escapeHtml(resource.icon)}" alt="" loading="lazy" />
          <span><strong>${escapeHtml(resource.name)}</strong><small>${stats?.nodes || 0} nodes · ${stats?.maps || 0} maps</small></span>
          <b>${getHarvestXp(resource)} XP</b>
        </label>`;
      }).join('') || '<div class="empty-small">Aucune ressource à ce niveau.</div>'}
    </div>
  `;
}

function renderMapHead() {
  const head = app.querySelector('#map-head');
  if (!head) return;
  if (!state.profileReady) {
    head.innerHTML = `
      <div><span class="eyebrow">Monde des Douze</span><strong>Ta route apparaîtra ici</strong></div>
      <div class="setup-progress"><span class="${state.primaryJob ? 'is-done' : ''}">1. Métier</span><span class="${state.primaryJob ? 'is-done' : ''}">2. Niveau</span><span>3. Calcul</span></div>
    `;
    return;
  }
  const plan = state.plan;
  head.innerHTML = `
    <div><span class="eyebrow">${state.startMode === 'auto' ? 'Départ optimal inclus' : 'Depuis ' + coordLabel(state.start)}</span><strong>${plan.route.length} étape${plan.route.length > 1 ? 's' : ''}${plan.route.length < state.maxStops ? ' rentable' + (plan.route.length > 1 ? 's' : '') + ' disponible' + (plan.route.length > 1 ? 's' : '') : ''} · ${formatNumber(plan.totals.totalXp)} XP estimée</strong></div>
    <div class="map-metrics">
      <span><i data-lucide="gauge"></i><b>${formatNumber(plan.totals.xpPerHour)}</b> XP/h</span>
      <span><i data-lucide="timer"></i><b>${Math.max(1, Math.round(plan.totals.minutes))}</b> min</span>
      <span><i data-lucide="zap"></i><b>${plan.totals.zaapCount}</b> TP</span>
    </div>
  `;
  createIcons({ icons: ICONS });
}

function renderRun() {
  const panel = app.querySelector('#run-panel');
  if (!panel) return;
  if (!state.profileReady) {
    panel.innerHTML = `
      <div class="onboarding-panel">
        <img class="onboarding-mark" src="${brandMark}" alt="" />
        <span class="eyebrow">Ton compagnon de récolte</span>
        <strong>Une boucle faite pour ton personnage.</strong>
        <p>Pas de route générique avant de connaître ton métier. Une fois ton profil prêt, tu obtiens chaque coordonnée, chaque ressource et chaque commande à copier.</p>
        <div class="onboarding-checks">
          <div class="${state.primaryJob ? 'is-done' : ''}"><span>${state.primaryJob ? '<i data-lucide="check"></i>' : '1'}</span><div><b>${state.primaryJob ? JOBS[state.primaryJob].label : 'Choisis ton métier'}</b><small>${state.primaryJob ? `Niveau ${state.levels[state.primaryJob]}` : 'Le calcul respecte ton niveau'}</small></div></div>
          <div class="is-done"><span><i data-lucide="check"></i></span><div><b>${state.objective === 'resource' ? 'Faire du stock' : 'Monter vite'}</b><small>${state.objective === 'resource' ? 'Tu choisis les ressources' : 'Synergies entre ressources'}</small></div></div>
          <div><span>3</span><div><b>Reçois ta feuille de route</b><small>Une commande par map</small></div></div>
        </div>
      </div>
    `;
    createIcons({ icons: ICONS });
    return;
  }
  const plan = state.plan;
  if (!plan.route.length) {
    panel.innerHTML = `<div class="run-empty"><i data-lucide="locate-fixed"></i><strong>Aucune map rentable trouvée</strong><p>Vérifie le niveau, le métier et la ressource choisie.</p></div>`;
    createIcons({ icons: ICONS });
    return;
  }
  const current = plan.route[state.activeStepIndex] || plan.route[0];
  panel.innerHTML = `
    <section class="now-card">
      <div class="now-label"><span>À faire maintenant</span><b>${state.activeStepIndex + 1}/${plan.route.length}</b></div>
      ${current.mapImage ? `<img class="map-preview" src="${escapeHtml(current.mapImage)}" alt="Aperçu de la map ${coordLabel(current)}" />` : ''}
      <div class="now-place"><div><strong>${escapeHtml(current.name)}</strong><span>${escapeHtml(current.zone)} ${coordLabel(current)}</span></div><button type="button" data-action="focus-step" data-index="${state.activeStepIndex}" aria-label="Voir sur la carte"><i data-lucide="map-pin"></i></button></div>
      ${renderTravelLead(current)}
      <button type="button" class="travel-command" data-copy="${travelCommand(current)}"><code>${travelCommand(current)}</code><span><i data-lucide="copy"></i> Copier</span></button>
      <div class="harvest-box"><span>Sur cette map</span>${renderLoot(current)}</div>
      <button type="button" class="button button-primary button-block" data-action="next-step" ${state.activeStepIndex >= plan.route.length - 1 ? 'disabled' : ''}>Étape suivante <i data-lucide="arrow-right"></i></button>
    </section>
    <section class="route-list-section">
      <div class="route-title"><div><span class="eyebrow">Itinéraire complet</span><strong>Ta boucle map par map</strong></div><button type="button" data-action="copy-route" aria-label="Copier la route"><i data-lucide="clipboard"></i></button></div>
      <ol class="route-list">
        ${plan.route.map((step, index) => renderRouteStep(step, index)).join('')}
      </ol>
    </section>
  `;
  createIcons({ icons: ICONS });
}

function renderTravelLead(step) {
  if (step.travel.mode === 'start') return `<div class="travel-lead is-start"><i data-lucide="sparkles"></i><span><strong>Commence ici</strong> · meilleure entrée calculée</span></div>`;
  if (step.travel.mode !== 'zaap') return `<div class="travel-lead"><i data-lucide="navigation"></i><span>${step.travel.walkCost <= 1 ? 'Passe sur la map voisine' : `${Math.round(step.travel.walkCost)} maps de déplacement`}</span></div>`;
  return `<div class="travel-lead is-zaap"><i data-lucide="zap"></i><span>TP <strong>${escapeHtml(step.travel.targetZaap.name.replace(/^Zaap - /, ''))}</strong> ${coordLabel(step.travel.targetZaap)}</span></div>`;
}

function renderLoot(step) {
  return `<div class="loot-grid">${step.selected.map((item) => `<div class="loot-row"><img src="${escapeHtml(item.resource.icon)}" alt="" loading="lazy" /><span><strong>${item.quantity}× ${escapeHtml(item.resource.name)}</strong><small>${item.xpEach} XP chacun${item.cells.length ? ` · cellules ${item.cells.join(', ')}` : ''}</small></span><b>${item.xp} XP</b></div>`).join('')}</div><div class="map-total"><span>${step.nodeCount} nodes</span><strong>${step.totalXp} XP sur la map</strong></div>`;
}

function renderRouteStep(step, index) {
  const dominant = step.selected[0];
  return `<li class="route-step ${index === state.activeStepIndex ? 'is-active' : ''}" data-action="focus-step" data-index="${index}">
    <span class="route-number">${index + 1}</span>
    <div class="route-step-body"><div><strong>${coordLabel(step)} · ${escapeHtml(step.name)}</strong><small>${step.selected.map((item) => `${item.quantity}× ${item.resource.name}`).join(' · ')}</small></div><span>${step.totalXp} XP</span></div>
    <button type="button" data-copy="${travelCommand(step)}" aria-label="Copier ${travelCommand(step)}"><i data-lucide="copy"></i></button>
    ${dominant?.resource.icon ? `<img class="route-resource" src="${escapeHtml(dominant.resource.icon)}" alt="" loading="lazy" />` : ''}
  </li>`;
}

function mountMap() {
  const scales = [...WORLD.scales];
  const crs = buildCrs(scales);
  const bounds = L.latLngBounds([0, 0], [WORLD.totalHeight, WORLD.totalWidth]);
  map = L.map('dofus-map', {
    crs,
    minZoom: 0,
    maxZoom: scales.length - 1,
    zoomSnap: 0,
    zoomDelta: 1,
    wheelPxPerZoomLevel: 90,
    zoomControl: false,
    attributionControl: false,
    maxBounds: bounds,
    maxBoundsViscosity: 1,
    preferCanvas: true,
    zoomAnimation: false,
    markerZoomAnimation: false,
    fadeAnimation: false
  });
  createTileLayer(scales, bounds).addTo(map);
  mapGrid = createGridLayer().addTo(map);
  mapOverlay = L.layerGroup().addTo(map);
  const center = state.mapCenter ? dofusToLatLng(state.mapCenter) : dofusToLatLng(state.startMode === 'manual' ? state.start : { x: 5, y: -18 });
  map.setView(center, clamp(state.mapZoom, 0, scales.length - 1), { animate: false });
  map.on('moveend zoomend', () => {
    state.mapCenter = latLngToDofus(map.getCenter());
    state.mapZoom = map.getZoom();
    mapGrid?.setOpacity(map.getZoom() >= 2 ? 0.48 : 0);
    saveState(state);
  });
  mapGrid.setOpacity(map.getZoom() >= 2 ? 0.48 : 0);
  updateMapOverlays();
  requestAnimationFrame(() => {
    map.invalidateSize(false);
    fitRoute();
  });
}

function updateMapOverlays() {
  if (!map || !mapOverlay) return;
  mapOverlay.clearLayers();
  const renderer = L.canvas({ padding: 0.35 });
  const route = state.plan.route;
  const candidateIds = new Set(route.map((step) => step.id));

  state.plan.candidates.slice(0, 24).forEach((spot) => {
    if (candidateIds.has(spot.id)) return;
    L.rectangle(dofusCellBounds(spot), { renderer, interactive: false, color: '#ffe29a', weight: 1, opacity: 0.35, fillColor: '#f6cf68', fillOpacity: 0.12 }).addTo(mapOverlay);
  });

  let previous = null;
  route.forEach((step, index) => {
    const color = index === state.activeStepIndex ? '#fff2b8' : '#f2c75c';
    const lineStart = index === 0 ? (state.startMode === 'manual' ? state.start : null) : previous;
    if (step.travel.mode !== 'zaap' && lineStart) {
      L.polyline([dofusToLatLng(lineStart), dofusToLatLng(step)], { renderer, interactive: false, color: '#f2c75c', weight: 3, opacity: 0.82 }).addTo(mapOverlay);
    }
    L.rectangle(dofusCellBounds(step), { renderer, interactive: false, color, weight: index === state.activeStepIndex ? 3 : 2, opacity: 0.95, fillColor: index === state.activeStepIndex ? '#e66f51' : '#d9aa3e', fillOpacity: index === state.activeStepIndex ? 0.48 : 0.28 }).addTo(mapOverlay);
    const marker = L.marker(dofusToLatLng(step), { icon: routeIcon(step, index), title: `${index + 1}. ${step.name} ${coordLabel(step)}`, keyboard: false });
    marker.on('click', () => selectStep(index, false));
    marker.addTo(mapOverlay);
    previous = step;
  });

  if (state.startMode === 'manual' && route[0]?.travel.mode === 'walk') {
    L.marker(dofusToLatLng(state.start), { icon: startIcon(), title: `Départ ${coordLabel(state.start)}`, keyboard: false }).addTo(mapOverlay);
  }
}

function routeIcon(step, index) {
  const image = step.selected[0]?.resource.icon;
  const compact = state.plan.route.length > 36;
  return L.divIcon({
    className: '',
    html: `<div class="route-marker ${compact ? 'is-compact' : ''} ${index === state.activeStepIndex ? 'is-active' : ''}">${image ? `<img src="${escapeHtml(image)}" alt="" />` : ''}<span>${index + 1}</span></div>`,
    iconSize: compact ? [30, 30] : [38, 38],
    iconAnchor: compact ? [15, 15] : [19, 19]
  });
}

function startIcon() {
  return L.divIcon({ className: '', html: '<div class="start-marker"><span></span></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
}

function createTileLayer(scales, bounds) {
  const layer = L.tileLayer('', { tileSize: TILE_SIZE, noWrap: true, bounds, minZoom: 0, maxZoom: scales.length - 1, keepBuffer: 4, updateWhenZooming: false, updateWhenIdle: true });
  layer.getTileUrl = (coords) => {
    const scale = scales[clamp(Math.round(coords.z), 0, scales.length - 1)];
    const columns = Math.ceil((WORLD.totalWidth * scale.x) / TILE_SIZE);
    const rows = Math.ceil((WORLD.totalHeight * scale.y) / TILE_SIZE);
    if (coords.x < 0 || coords.x >= columns || coords.y < 0 || coords.y >= rows) return '';
    return `https://api.dofusdb.fr/img/worlds/1/${scale.name}/${coords.y * columns + coords.x + 1}.jpg`;
  };
  return layer;
}

function createGridLayer() {
  const canvasSize = 256;
  const GridLayer = L.GridLayer.extend({
    createTile(coords) {
      const tile = document.createElement('canvas');
      tile.width = canvasSize;
      tile.height = canvasSize;
      const context = tile.getContext('2d');
      const origin = coords.scaleBy(L.point(canvasSize, canvasSize));
      const end = origin.add([canvasSize, canvasSize]);
      const topLeft = this._map.unproject(origin, coords.z);
      const bottomRight = this._map.unproject(end, coords.z);
      const width = bottomRight.lng - topLeft.lng || 1;
      const height = bottomRight.lat - topLeft.lat || 1;
      const firstX = Math.floor((topLeft.lng - WORLD.origineX) / WORLD.mapWidth) * WORLD.mapWidth + WORLD.origineX;
      const firstY = Math.floor((topLeft.lat - WORLD.origineY) / WORLD.mapHeight) * WORLD.mapHeight + WORLD.origineY;

      context.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      context.lineWidth = 1;
      context.beginPath();
      for (let x = firstX; x <= bottomRight.lng + WORLD.mapWidth; x += WORLD.mapWidth) {
        const tileX = ((x - topLeft.lng) / width) * canvasSize;
        context.moveTo(tileX, 0);
        context.lineTo(tileX, canvasSize);
      }
      for (let y = firstY; y <= bottomRight.lat + WORLD.mapHeight; y += WORLD.mapHeight) {
        const tileY = ((y - topLeft.lat) / height) * canvasSize;
        context.moveTo(0, tileY);
        context.lineTo(canvasSize, tileY);
      }
      context.stroke();
      return tile;
    }
  });
  return new GridLayer({ tileSize: canvasSize, interactive: false, pane: 'overlayPane' });
}

function buildCrs(scales) {
  return L.extend({}, L.CRS.Simple, {
    latLngToPoint(latLng, zoom) {
      const scale = interpolatedScale(scales, zoom);
      return L.point(latLng.lng * scale.x, latLng.lat * scale.y);
    },
    pointToLatLng(point, zoom) {
      const scale = interpolatedScale(scales, zoom);
      return L.latLng(point.y / scale.y, point.x / scale.x);
    },
    scale(zoom) { return interpolatedScale(scales, zoom).x; },
    zoom(value) {
      if (value <= scales[0].x) return 0;
      if (value >= scales.at(-1).x) return scales.length - 1;
      for (let index = 0; index < scales.length - 1; index += 1) {
        if (value <= scales[index + 1].x) return index + (value - scales[index].x) / (scales[index + 1].x - scales[index].x);
      }
      return scales.length - 1;
    }
  });
}

function interpolatedScale(scales, zoom) {
  const value = clamp(Number(zoom) || 0, 0, scales.length - 1);
  const floor = Math.floor(value);
  const ratio = value - floor;
  const current = scales[floor];
  const next = scales[Math.min(scales.length - 1, floor + 1)];
  return { x: current.x + (next.x - current.x) * ratio, y: current.y + (next.y - current.y) * ratio };
}

function dofusToLatLng(point) {
  return L.latLng(WORLD.origineY + (Number(point.y) + 0.5) * WORLD.mapHeight, WORLD.origineX + (Number(point.x) + 0.5) * WORLD.mapWidth);
}

function dofusCellBounds(point) {
  const x = WORLD.origineX + Number(point.x) * WORLD.mapWidth;
  const y = WORLD.origineY + Number(point.y) * WORLD.mapHeight;
  return L.latLngBounds([y, x], [y + WORLD.mapHeight, x + WORLD.mapWidth]);
}

function latLngToDofus(latLng) {
  return { x: (latLng.lng - WORLD.origineX) / WORLD.mapWidth - 0.5, y: (latLng.lat - WORLD.origineY) / WORLD.mapHeight - 0.5 };
}

function fitRoute() {
  if (!map || !state.plan.route.length) return;
  const points = [...state.plan.route];
  if (state.startMode === 'manual' && state.plan.route[0]?.travel.mode === 'walk') points.unshift(state.start);
  const bounds = L.latLngBounds(points.map(dofusToLatLng));
  map.fitBounds(bounds, { padding: [70, 70], maxZoom: 8, animate: false });
}

function selectStep(index, pan = true) {
  state.activeStepIndex = clamp(Number(index), 0, state.plan.route.length - 1);
  renderRun();
  updateMapOverlays();
  if (pan && map) map.setView(dofusToLatLng(state.plan.route[state.activeStepIndex]), Math.max(6, map.getZoom()), { animate: false });
}

function scheduleRefresh({ setup = false, fit = false } = {}) {
  cancelAnimationFrame(refreshFrame);
  refreshFrame = requestAnimationFrame(() => {
    computePlan();
    if (setup) renderSetup(true);
    renderMapHead();
    renderRun();
    updateMapOverlays();
    if (fit) fitRoute();
  });
}

app.addEventListener('click', (event) => {
  const copy = event.target.closest('[data-copy]');
  if (copy) {
    event.stopPropagation();
    copyText(copy.dataset.copy);
    return;
  }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const type = action.dataset.action;

  if (type === 'primary-job') {
    state.primaryJob = action.dataset.job;
    state.enabledJobs = new Set([state.primaryJob]);
    state.selectedResourceIds = new Set(getDefaultSelection(dataset.resources, state.levels, state.enabledJobs));
    scheduleRefresh({ setup: true, fit: false });
  } else if (type === 'objective') {
    state.objective = action.dataset.objective;
    if (state.objective === 'resource' && !state.selectedResourceIds.size) state.selectedResourceIds = new Set(getDefaultSelection(dataset.resources, state.levels, state.enabledJobs));
    scheduleRefresh({ setup: true, fit: true });
  } else if (type === 'stops') {
    state.maxStops = Number(action.dataset.stops);
    scheduleRefresh({ setup: true, fit: true });
  } else if (type === 'start-mode') {
    state.startMode = action.dataset.mode === 'manual' ? 'manual' : 'auto';
    scheduleRefresh({ setup: true, fit: true });
  } else if (type === 'calculate') {
    if (!state.primaryJob) return;
    state.profileReady = true;
    scheduleRefresh({ setup: true, fit: true });
  } else if (type === 'fit-route') {
    scheduleRefresh({ fit: true });
  } else if (type === 'focus-step') {
    selectStep(Number(action.dataset.index));
  } else if (type === 'next-step') {
    selectStep(state.activeStepIndex + 1);
  } else if (type === 'copy-route') {
    copyText(exportRouteText(state.plan));
  } else if (type === 'zoom-in') {
    map?.zoomIn(0.5, { animate: false });
  } else if (type === 'zoom-out') {
    map?.zoomOut(0.5, { animate: false });
  } else if (type === 'reset') {
    clearState();
    location.reload();
  }
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-secondary-job]')) {
    target.checked ? state.enabledJobs.add(target.dataset.secondaryJob) : state.enabledJobs.delete(target.dataset.secondaryJob);
    scheduleRefresh({ setup: true, fit: true });
  } else if (target.matches('[data-resource]')) {
    const id = String(target.dataset.resource);
    target.checked ? state.selectedResourceIds.add(id) : state.selectedResourceIds.delete(id);
    target.closest('.resource-item')?.classList.toggle('is-selected', target.checked);
    scheduleRefresh({ fit: false });
  } else if (target.id === 'primary-level') {
    state.levels[state.primaryJob] = clamp(Number(target.value), 1, 200);
    state.selectedResourceIds = new Set(getDefaultSelection(dataset.resources, state.levels, state.enabledJobs));
    scheduleRefresh({ setup: true, fit: true });
  } else if (target.matches('[data-job-level]')) {
    state.levels[target.dataset.jobLevel] = clamp(Number(target.value), 1, 200);
    scheduleRefresh({ setup: true, fit: true });
  } else if (target.id === 'start-x' || target.id === 'start-y') {
    state.start = { x: Number(app.querySelector('#start-x').value) || 0, y: Number(app.querySelector('#start-y').value) || 0 };
    scheduleRefresh({ fit: true });
  } else if (target.id === 'fast-travel') {
    state.preferZaaps = target.checked;
    scheduleRefresh({ fit: true });
  } else if (target.id === 'route-length') {
    state.maxStops = clamp(Number(target.value), 6, 80);
    scheduleRefresh({ setup: true, fit: true });
  }
});

app.addEventListener('input', (event) => {
  if (event.target.id === 'route-length') {
    const output = app.querySelector('#route-length-output');
    if (output) output.textContent = `${event.target.value} max`;
    return;
  }
  if (event.target.id !== 'resource-search') return;
  state.resourceSearch = event.target.value;
  const list = app.querySelector('.resource-list');
  if (list) list.outerHTML = renderResourcePicker(getPickerResources()).match(/<div class="resource-list">[\s\S]*<\/div>\s*$/)?.[0] || list.outerHTML;
});

function copyText(text) {
  showToast('Copié. Tu peux coller dans le chat Dofus.');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  } else {
    legacyCopy(text);
  }
}

function legacyCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function showToast(message) {
  const toast = app.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function iconName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('fr-FR');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

renderShell();
