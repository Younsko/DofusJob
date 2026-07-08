import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, '.cache', 'dofusdata');
const OUTPUT_FILE = path.join(ROOT, 'src', 'generated', 'dofusData.js');
const RELEASE_TAG = '3.6.6.6';
const RELEASE_BASE = `https://github.com/dofusdude/dofus3-main/releases/download/${RELEASE_TAG}`;
const API_BASE = 'https://api.dofusdu.de/dofus3/v1/fr';

const FILES = [
  'maps_information.json',
  'skills.json',
  'areas.json',
  'subareas.json',
  'superareas.json',
  'fr.json'
];

const JOB_ID_TO_KEY = {
  2: 'lumberjack',
  24: 'miner',
  26: 'alchemist',
  28: 'farmer',
  36: 'fisherman'
};

const JOB_LABELS = {
  lumberjack: 'Bucheron',
  miner: 'Mineur',
  alchemist: 'Alchimiste',
  farmer: 'Paysan',
  fisherman: 'Pecheur'
};

const RESOURCE_FAMILY_BY_JOB = {
  lumberjack: 'Bois',
  miner: 'Minerais',
  alchemist: 'Plantes',
  farmer: 'Cereales',
  fisherman: 'Poissons'
};

const WORLD_MAP_NAMES = {
  1: 'Monde des Douze',
  2: 'Incarnam',
  3: 'Enutrosor',
  4: 'Srambad',
  5: 'Xelorium',
  6: 'Ecaflipus',
  12: 'Saharach',
  17: 'Sufokia abyssale',
  19: 'Dimensions',
  34: 'Ile de Valonia',
  36: 'Songes'
};

await fs.mkdir(CACHE_DIR, { recursive: true });

for (const file of FILES) {
  await downloadIfMissing(`${RELEASE_BASE}/${file}`, path.join(CACHE_DIR, file));
}

const resourcesPayload = await getJsonCached(
  `${API_BASE}/items/resources/all`,
  path.join(CACHE_DIR, 'resources_all.json')
);

const translations = await readJson('fr.json');
const maps = readRefs(await readJson('maps_information.json'));
const skills = readRefs(await readJson('skills.json'));
const areas = readRefs(await readJson('areas.json'));
const subareas = readRefs(await readJson('subareas.json'));
const superareas = readRefs(await readJson('superareas.json'));

const text = normalizeTranslations(translations);
const mapById = new Map(maps.map((map) => [map.id, map]));
const areasById = new Map(areas.map((area) => [area.id, area]));
const superareasById = new Map(superareas.map((item) => [item.id, item]));
const resourceApiById = new Map(
  extractApiItems(resourcesPayload).map((item) => [item.ankama_id, item])
);

const gatherSkillsRaw = skills
  .filter((skill) => skill.gatheredRessourceItem > 0)
  .filter((skill) => JOB_ID_TO_KEY[skill.parentJobId])
  .map((skill) => {
    const apiItem = resourceApiById.get(skill.gatheredRessourceItem);
    const job = JOB_ID_TO_KEY[skill.parentJobId];

    return {
      id: String(skill.gatheredRessourceItem),
      ankamaId: skill.gatheredRessourceItem,
      name: apiItem?.name || t(text, skill.nameId, `Ressource ${skill.gatheredRessourceItem}`),
      job,
      level: skill.levelMin,
      family: apiItem?.type?.name || RESOURCE_FAMILY_BY_JOB[job],
      icon: apiItem?.image_urls?.icon || null,
      image: apiItem?.image_urls?.sd || apiItem?.image_urls?.icon || null,
      skillId: skill.id
    };
  })
  .sort((a, b) => a.job.localeCompare(b.job) || a.level - b.level || a.name.localeCompare(b.name));

const gatherSkills = [
  ...gatherSkillsRaw
    .reduce((acc, resource) => {
      const existing = acc.get(resource.ankamaId);
      if (!existing || resource.level < existing.level) {
        acc.set(resource.ankamaId, resource);
      }
      return acc;
    }, new Map())
    .values()
].sort((a, b) => a.job.localeCompare(b.job) || a.level - b.level || a.name.localeCompare(b.name));

const resourceById = new Map(gatherSkills.map((resource) => [resource.ankamaId, resource]));
const subareasWithMaps = subareas
  .map((subarea) => {
    const mapIds = asArray(subarea.mapIds);
    const mapEntries = mapIds.map((id) => mapById.get(id)).filter(Boolean);
    const worldMapCounts = countBy(mapEntries.map((map) => map.worldMap).filter((id) => id > 0));
    const worldMap = Number(Object.entries(worldMapCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || subarea.customWorldMapId || 1);
    const bounds = getMapBounds(mapEntries);
    const center = getCenter(mapEntries);
    const area = areasById.get(subarea.areaId);
    const superarea = area ? superareasById.get(area.superAreaId) : null;
    const harvestables = asArray(subarea.harvestables).filter((id) => resourceById.has(id));

    return {
      id: subarea.id,
      name: t(text, subarea.nameId, `Sous-zone ${subarea.id}`),
      areaId: subarea.areaId,
      areaName: area ? t(text, area.nameId, `Zone ${area.id}`) : 'Zone inconnue',
      superareaName: superarea ? t(text, superarea.nameId, `Monde ${superarea.id}`) : 'Monde',
      level: subarea.level,
      worldMap,
      worldMapName: WORLD_MAP_NAMES[worldMap] || `Worldmap ${worldMap}`,
      associatedZaapMapId: subarea.associatedZaapMapId || 0,
      mapIds,
      mapCount: mapEntries.length,
      harvestables,
      bounds,
      center,
      displayOnWorldMap: Boolean(subarea.displayOnWorldMap),
      mountAutoTripAllowed: Boolean(subarea.mountAutoTripAllowed),
      psiAllowed: Boolean(subarea.psiAllowed)
    };
  })
  .filter((subarea) => subarea.mapCount > 0);

const resources = gatherSkills.filter((resource) =>
  subareasWithMaps.some((subarea) => subarea.harvestables.includes(resource.ankamaId))
);
const resourcesByJob = countBy(resources.map((resource) => resource.job));

const spots = subareasWithMaps
  .filter((subarea) => subarea.harvestables.length > 0)
  .filter((subarea) => subarea.center)
  .map((subarea) => {
    const quantities = {};
    const densityBase = Math.max(1, Math.round(Math.sqrt(subarea.mapCount)));

    for (const resourceId of subarea.harvestables) {
      const resource = resourceById.get(resourceId);
      if (!resource) continue;
      const levelPenalty = Math.max(1, Math.round(resource.level / 55));
      quantities[String(resourceId)] = Math.max(1, Math.round(densityBase / levelPenalty));
    }

    return {
      id: `subarea-${subarea.id}`,
      source: 'dofusdude-subarea',
      subareaId: subarea.id,
      name: subarea.name,
      zone: subarea.areaName,
      worldMap: subarea.worldMap,
      worldMapName: subarea.worldMapName,
      kind: 'subarea',
      x: subarea.center.x,
      y: subarea.center.y,
      quality: qualityFor(subarea),
      mapCount: subarea.mapCount,
      mapIds: subarea.mapIds.slice(0, 160),
      bounds: subarea.bounds,
      resources: quantities
    };
  });

const mapCells = maps
  .filter((map) => map.worldMap > 0)
  .map((map) => ({
    id: map.id,
    x: map.posX,
    y: map.posY,
    subareaId: map.subAreaId,
    worldMap: map.worldMap
  }));

const zaapMap = new Map();
for (const subarea of subareasWithMaps) {
  if (!subarea.associatedZaapMapId) continue;
  const map = mapById.get(subarea.associatedZaapMapId);
  if (!map || map.worldMap <= 0) continue;
  const id = `zaap-${subarea.associatedZaapMapId}`;
  if (!zaapMap.has(id)) {
    zaapMap.set(id, {
      id,
      mapId: subarea.associatedZaapMapId,
      name: `Zaap - ${subarea.name}`,
      x: map.posX,
      y: map.posY,
      zone: subarea.areaName,
      worldMap: map.worldMap,
      type: 'zaap'
    });
  }
}

const transporters = buildTransporters(mapCells);
const dataset = {
  meta: {
    id: `dofusdude-${RELEASE_TAG}`,
    label: `Dofus 3 ${RELEASE_TAG} - donnees officielles communautaires`,
    generatedAt: new Date().toISOString(),
    source: 'Dofusdude dofus3-main release + Dofusdude API resources',
    sourceUrl: `https://github.com/dofusdude/dofus3-main/releases/tag/${RELEASE_TAG}`,
    accuracy:
      'Coordonnees maps, sous-zones, ressources recoltables et zaaps issus des donnees jeu. Les quantites de nodes par map sont estimees par densite de sous-zone.'
  },
  jobs: Object.fromEntries(
    Object.entries(JOB_LABELS).map(([id, label]) => [
      id,
      {
        id,
        label,
        resourceCount: resourcesByJob[id] || 0
      }
    ])
  ),
  resources,
  spots,
  zaaps: [...zaapMap.values()],
  transporters,
  maps: mapCells,
  subareas: subareasWithMaps.map((subarea) => ({
    id: subarea.id,
    name: subarea.name,
    areaName: subarea.areaName,
    worldMap: subarea.worldMap,
    worldMapName: subarea.worldMapName,
    mapCount: subarea.mapCount,
    harvestables: subarea.harvestables.map(String),
    bounds: subarea.bounds,
    center: subarea.center,
    associatedZaapMapId: subarea.associatedZaapMapId
  })),
  worldMaps: Object.entries(
    countBy(mapCells.map((map) => map.worldMap))
  )
    .map(([id, mapCount]) => ({
      id: Number(id),
      name: WORLD_MAP_NAMES[id] || `Worldmap ${id}`,
      mapCount
    }))
    .sort((a, b) => a.id - b.id)
};

await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
await fs.writeFile(
  OUTPUT_FILE,
  `// Generated by scripts/generate_dofus_data.mjs. Do not edit by hand.\nexport const DOFUS_DATA = ${JSON.stringify(dataset)};\n`,
  'utf8'
);

console.log(
  `Generated ${path.relative(ROOT, OUTPUT_FILE)}: ${resources.length} resources, ${spots.length} spots, ${mapCells.length} map cells, ${dataset.zaaps.length} zaaps.`
);

async function downloadIfMissing(url, outputPath) {
  try {
    const stat = await fs.stat(outputPath);
    if (stat.size > 0) return;
  } catch {
    // Missing file.
  }

  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

async function getJsonCached(url, outputPath) {
  await downloadIfMissing(url, outputPath);
  return JSON.parse(await fs.readFile(outputPath, 'utf8'));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.join(CACHE_DIR, file), 'utf8'));
}

function readRefs(payload) {
  return payload.references.RefIds.map((entry) => entry.data);
}

function normalizeTranslations(payload) {
  const entries = payload.entries || payload.Texts || payload.texts || payload;
  return new Map(
    Object.entries(entries).map(([key, value]) => [Number(key), value])
  );
}

function t(text, id, fallback) {
  return text.get(Number(id)) || fallback;
}

function asArray(value) {
  return value?.Array || [];
}

function extractApiItems(payload) {
  return Array.isArray(payload) ? payload : payload.items || [];
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function getMapBounds(mapEntries) {
  if (!mapEntries.length) return null;
  const xs = mapEntries.map((map) => map.posX);
  const ys = mapEntries.map((map) => map.posY);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function getCenter(mapEntries) {
  if (!mapEntries.length) return null;
  const sum = mapEntries.reduce(
    (acc, map) => ({
      x: acc.x + map.posX,
      y: acc.y + map.posY
    }),
    { x: 0, y: 0 }
  );
  return {
    x: Math.round(sum.x / mapEntries.length),
    y: Math.round(sum.y / mapEntries.length)
  };
}

function qualityFor(subarea) {
  const base = 0.58 + Math.min(0.32, Math.log10(Math.max(2, subarea.mapCount)) / 4);
  const travel = subarea.mountAutoTripAllowed ? 0.04 : -0.02;
  const display = subarea.displayOnWorldMap ? 0.02 : 0;
  return Number(Math.max(0.45, Math.min(0.96, base + travel + display)).toFixed(2));
}

function nearestCell(mapCells, point) {
  return mapCells
    .filter((map) => map.worldMap === 1)
    .map((map) => ({
      ...map,
      distance: Math.abs(map.x - point.x) + Math.abs(map.y - point.y)
    }))
    .sort((a, b) => a.distance - b.distance)[0];
}

function buildTransporters(mapCells) {
  const raw = [
    { id: 'frigost-carrier-bourgade', name: 'Transporteur frigostien - Bourgade', x: -78, y: -41 },
    { id: 'frigost-carrier-champs', name: 'Transporteur frigostien - Champs de glace', x: -67, y: -40 },
    { id: 'frigost-carrier-larmes', name: 'Transporteur frigostien - Larmes d Ouronigride', x: -71, y: -83 },
    { id: 'frigost-carrier-crevasse', name: 'Transporteur frigostien - Crevasse Perge', x: -77, y: -72 },
    { id: 'frigost-carrier-foret', name: 'Transporteur frigostien - Foret des pins perdus', x: -58, y: -52 }
  ];

  return raw
    .map((item) => {
      const cell = nearestCell(mapCells, item);
      return {
        ...item,
        x: cell?.x ?? item.x,
        y: cell?.y ?? item.y,
        mapId: cell?.id ?? null,
        zone: 'Frigost',
        worldMap: 1,
        type: 'transporter'
      };
    })
    .filter((item) => item.mapId);
}
