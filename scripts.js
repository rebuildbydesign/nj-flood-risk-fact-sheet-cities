/* ================================================================
   NJ FLOOD RISK — COUNTY FACT SHEET
   scripts.js  ·  CSV-driven Data + Rendering + PDF Export
   People-centered: displacement & risk metrics use population
   ================================================================ */

// ── GLOBAL STATE ──────────────────────────────────────────────────
let COUNTIES = {};   // populated from CSV
let CITIES = {};   // populated from CSV
let FEMA = {};       // populated from CSV
let CSV_DATA = {};   // raw CSV rows keyed by composite city key
let NONRENEWALS = {}; // populated from non-renewals CSV
let POPULATION_2024 = {}; // populated from 2024 population CSV

// 12 township names repeat across counties (5 Washington Twps, etc.). We key every
// municipality by NAME + COUNTY so same-named towns don't collapse onto one row.
let CITY_COUNT = {};   // CITY name -> how many counties it appears in
let CITY_ENTRIES = []; // [{ key, label }] for the search dropdown

function isSameNamedCity(city) { return (CITY_COUNT[city] || 0) > 1; }
function factKey(city, county) {
  return (county && isSameNamedCity(city))
    ? `${city}|${String(county).toUpperCase()}`
    : city;
}


// ── ASSET LABELS ────────────────────────────────────────────────
const ASSET_META = {
  airports: { label: "Airport Facilities", source: "USDOT" },
  hospitals: { label: "Hospital Facilities", source: "NJ Office of GIS" },
  contaminated: { label: "Contaminated Sites", source: "NJDEP" },
  libraries: { label: "Libraries", source: "NJDCA GIS" },
  parks: { label: "Parks", source: "Trust for Public Land" },
  powerplants: { label: "Power Plants", source: "US EIA" },
  schools: { label: "Schools", source: "NJ Office of GIS" },
  hazwaste: { label: "Hazardous Waste Sites", source: "NJDEP" },
  landfills: { label: "Solid Waste Landfills", source: "NJDEP" },
  superfund: { label: "Superfund Sites", source: "EPA" },
  wastewater: { label: "Wastewater Treatments", source: "EPA" },
  police: { label: "Police Stations", source: "NJ Office of GIS" },
  fire: { label: "Fire Departments", source: "NJ Office of GIS" }
};

// ── CSV LOADER ────────────────────────────────────────────────────
function loadCSV(url) {
  return fetch(url)
    .then(r => r.text())
    .then(text => {
      const rows = [];
      const lines = text.split('\n');
      const headers = parseCSVLine(lines[0]);
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = parseCSVLine(line);
        const row = {};
        headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim(); });
        rows.push(row);
      }
      return rows;
    });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function normalizeMunicipalityName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/\b(CITY|TWP|TOWNSHIP|TOWN|BORO|BOROUGH|VILLAGE|VLG)\b/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function buildPopulationLookup(rows) {
  POPULATION_2024 = {};
  rows.forEach(r => {
    const normalized = normalizeMunicipalityName(r['MUNCIPALITY']);
    if (!normalized) return;
    POPULATION_2024[normalized] = num(String(r['2024_POP'] || '').replace(/,/g, ''));
  });
}

function buildDataFromCSV(rows) {
  // First pass: how many counties each CITY name appears in (to detect same-named).
  CITY_COUNT = {};
  rows.forEach(r => {
    const c = String(r['CITY'] || '').trim();
    if (c) CITY_COUNT[c] = (CITY_COUNT[c] || 0) + 1;
  });
  CITY_ENTRIES = [];

  rows.forEach(r => {
    const name = String(r['CITY'] || '').trim();
    if (!name) return;
    const county = String(r['COUNTY'] || '').trim();
    const key = factKey(name, county);
    const label = isSameNamedCity(name) && county ? `${name} (${county})` : name;

    CSV_DATA[key] = r;
    CITY_ENTRIES.push({ key, label });

    const totalPop = num(r['POPULATION']);

    CITIES[key] = {
      city: name,
      county: county,
      label: label,
      geoid: r['GEOID'],
      assets: {
        airports: [num(r['Infra_Airports_Total']), num(r['Infra_Airports_In_Floodplain_2025']), num(r['Infra_Airports_In_Floodplain_2050'])],
        hospitals: [num(r['Infra_Hospitals_Total']), num(r['Infra_Hospitals_In_Floodplain_2025']), num(r['Infra_Hospitals_In_Floodplain_2050'])],
        contaminated: [num(r['Infra_Contaminated_Sites_Total']), num(r['Infra_Contaminated_Sites_In_Floodplain_2025']), num(r['Infra_Contaminated_Sites_In_Floodplain_2050'])],
        libraries: [num(r['Infra_Libraries_Total']), num(r['Infra_Libraries_In_Floodplain_2025']), num(r['Infra_Libraries_In_Floodplain_2050'])],
        parks: [num(r['Infra_Parks_Total']), num(r['Infra_Parks_In_Floodplain_2025']), num(r['Infra_Parks_In_Floodplain_2050'])],
        powerplants: [num(r['Infra_Power_Plants_Total']), num(r['Infra_Power_Plants_In_Floodplain_2025']), num(r['Infra_Power_Plants_In_Floodplain_2050'])],
        schools: [num(r['Infra_Schools_Total']), num(r['Infra_Schools_In_Floodplain_2025']), num(r['Infra_Schools_In_Floodplain_2050'])],
        hazwaste: [num(r['Infra_Hazardous_Waste_Total']), num(r['Infra_Hazardous_Waste_In_Floodplain_2025']), num(r['Infra_Hazardous_Waste_In_Floodplain_2050'])],
        landfills: [num(r['Infra_Landfills_Total']), num(r['Infra_Landfills_In_Floodplain_2025']), num(r['Infra_Landfills_In_Floodplain_2050'])],
        superfund: [num(r['Infra_Superfund_Sites_Total']), num(r['Infra_Superfund_Sites_In_Floodplain_2025']), num(r['Infra_Superfund_Sites_In_Floodplain_2050'])],
        wastewater: [num(r['Infra_Wastewater_Treatment_Total']), num(r['Infra_Wastewater_Treatment_In_Floodplain_2025']), num(r['Infra_Wastewater_Treatment_In_Floodplain_2050'])],
        police: [num(r['Infra_Police_Stations_Total']), num(r['Infra_Police_Stations_In_Floodplain_2025']), num(r['Infra_Police_Stations_In_Floodplain_2050'])],
        fire: [num(r['Infra_Fire_Departments_Total']), num(r['Infra_Fire_Departments_In_Floodplain_2025']), num(r['Infra_Fire_Departments_In_Floodplain_2050'])]
      }
    };

  // FEMA data
    FEMA[key] = {
      disasters: num(r['Atlas_Total_Disaster_Declarations']),
    };

    // ── LOAD FACT COLUMNS (ensure all strings, trim, remove empty) ──
    CITIES[key].facts = ['Fact1', 'Fact2', 'Fact3']
      .map(col => String(r[col] || '').trim())
      .filter(Boolean); // remove empty strings
  });

  // Sort search entries by their display label.
  CITY_ENTRIES.sort((a, b) => a.label.localeCompare(b.label));
}


// ── HELPERS ─────────────────────────────────────────────────────
function fmt(n) { return n.toLocaleString('en-US'); }
function fmtDecimal(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }); }
function fmtDollar(n) {
  if (n >= 1e9) return '$' + fmtDecimal(n / 1e9) + 'B';
  if (n >= 1e6) return '$' + fmtDecimal(n / 1e6) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + fmt(n);
}
function fmtPctValue(v) { return fmtDecimal(v) + '%'; }
function pct(v) { return fmtPctValue(v * 100); }
function growthClass(g) {
  if (g >= 100) return 'high';
  if (g >= 40) return 'med';
  return 'low';
}
function sviLabel(v) {
  if (v >= 0.75) return 'Very High';
  if (v >= 0.5) return 'High';
  if (v >= 0.25) return 'Moderate';
  return 'Low';
}

function slugifyCityName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\bcity\b/g, '')
    .replace(/\bvillage\b/g, '')
    .replace(/\bnew jersey\b/g, '')
    // Normalize municipal suffix abbreviations so the Mapbox tool's
    // "Aberdeen Twp" matches the CSV's "Aberdeen Township", etc.
    .replace(/\b(twp|tp|township)\b/g, 'township')
    .replace(/\b(boro|borough)\b/g, 'borough')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Resolve a raw city value (+ optional county) to a composite CITIES key.
// Same-named towns need the county to land on the right row; unique names ignore it.
function findCityMatch(rawCity, rawCounty) {
  if (!rawCity) return '';
  const slug = slugifyCityName(decodeURIComponent(rawCity));
  const wantCounty = rawCounty ? String(rawCounty).toUpperCase().trim() : '';
  const candidates = Object.values(CITIES).filter(c => slugifyCityName(c.city) === slug);
  if (!candidates.length) return '';
  let chosen = candidates[0];
  if (wantCounty) {
    const m = candidates.find(c => String(c.county).toUpperCase() === wantCounty);
    if (m) chosen = m;
  }
  return factKey(chosen.city, chosen.county);
}

function getCityFromURL() {
  const params = new URLSearchParams(window.location.search);
  const city = params.get('city') || window.location.hash.replace(/^#/, '');
  const county = params.get('county') || '';
  return findCityMatch(city, county);
}

function syncCityURL(key) {
  const url = new URL(window.location.href);
  const c = CITIES[key];
  if (c) {
    url.searchParams.set('city', c.city);
    if (isSameNamedCity(c.city) && c.county) url.searchParams.set('county', c.county);
    else url.searchParams.delete('county');
  } else {
    url.searchParams.delete('city');
    url.searchParams.delete('county');
  }
  url.hash = '';
  window.history.replaceState({}, '', url);
}

// ── SVG MAP RENDERING ───────────────────────────────────────────
let CITY_PATHS = null;
let NJ_MAP_BBOX = null;

function loadCityBoundaries() {
  return fetch('data/NJ_City.geojson')
    .then(r => r.json())
    .then(data => {
      CITY_PATHS = {};
      NJ_MAP_BBOX = null;
      data.features.forEach(feat => {
        const name = (feat.properties.CITY_NAM || feat.properties.NAMELSAD || '').replace(' City', '');
        CITY_PATHS[name] = feat.geometry;
      });
      return CITY_PATHS;
    })
    .catch(() => null);
}

function geoToSVG(lon, lat, bbox, w, h, pad, cosLat) {
  const lonRange = (bbox[2] - bbox[0]) * cosLat;
  const latRange = bbox[3] - bbox[1];
  const mapAspect = lonRange / latRange;
  const boxAspect = (w - 2 * pad) / (h - 2 * pad);
  let drawW = w - 2 * pad, drawH = h - 2 * pad;
  let offX = pad, offY = pad;
  if (mapAspect < boxAspect) {
    drawW = drawH * mapAspect;
    offX = pad + ((w - 2 * pad) - drawW) / 2;
  } else {
    drawH = drawW / mapAspect;
    offY = pad + ((h - 2 * pad) - drawH) / 2;
  }
  const x = offX + ((lon - bbox[0]) * cosLat / lonRange) * drawW;
  const y = offY + ((bbox[3] - lat) / latRange) * drawH;
  return [x, y];
}

function ringToPath(ring, bbox, w, h, pad, cosLat) {
  return ring.map((pt, i) => {
    const [x, y] = geoToSVG(pt[0], pt[1], bbox, w, h, pad, cosLat);
    return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ') + ' Z';
}

function geomToPath(geometry, bbox, w, h, pad, cosLat) {
  let d = '';
  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach(ring => { d += ringToPath(ring, bbox, w, h, pad, cosLat) + ' '; });
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach(poly => {
      poly.forEach(ring => { d += ringToPath(ring, bbox, w, h, pad, cosLat) + ' '; });
    });
  }
  return d;
}

function updateBBoxFromRing(ring, bbox) {
  ring.forEach(([lon, lat]) => {
    if (lon < bbox[0]) bbox[0] = lon;
    if (lat < bbox[1]) bbox[1] = lat;
    if (lon > bbox[2]) bbox[2] = lon;
    if (lat > bbox[3]) bbox[3] = lat;
  });
}

function getGeometryBBox(geometry) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach(ring => updateBBoxFromRing(ring, bbox));
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach(poly => {
      poly.forEach(ring => updateBBoxFromRing(ring, bbox));
    });
  }
  return bbox;
}

function getNJMapBBox() {
  if (NJ_MAP_BBOX) return NJ_MAP_BBOX;

  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  Object.values(CITY_PATHS || {}).forEach(geometry => {
    const geomBBox = getGeometryBBox(geometry);
    if (geomBBox[0] < bbox[0]) bbox[0] = geomBBox[0];
    if (geomBBox[1] < bbox[1]) bbox[1] = geomBBox[1];
    if (geomBBox[2] > bbox[2]) bbox[2] = geomBBox[2];
    if (geomBBox[3] > bbox[3]) bbox[3] = geomBBox[3];
  });

  const lonPad = (bbox[2] - bbox[0]) * 0.015;
  const latPad = (bbox[3] - bbox[1]) * 0.015;
  NJ_MAP_BBOX = [bbox[0] - lonPad, bbox[1] - latPad, bbox[2] + lonPad, bbox[3] + latPad];
  return NJ_MAP_BBOX;
}

function buildNJMapSVG(activeCity) {
  if (!CITY_PATHS) return '<div style="width:180px;height:190px;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:0.7rem">Loading map…</div>';
  const w = 180, h = 190, pad = 3;
  const bbox = getNJMapBBox();
  const midLat = (bbox[1] + bbox[3]) / 2;
  const cosLat = Math.cos(midLat * Math.PI / 180);
  let paths = '';
  Object.entries(CITY_PATHS).forEach(([name, geom]) => {
    const cls = name === activeCity ? 'nj-city active' : 'nj-city';
    const d = geomToPath(geom, bbox, w, h, pad, cosLat);
    paths += `<path class="${cls}" d="${d}"/>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}



// ── TYPEAHEAD MUNICIPALITY SEARCH ───────────────────────────────
// Replaces the dropdown with a Mapbox-geocoder-style suggestion search.
// Prefix matches rank above substring matches (typing "new" -> Newark first).
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function highlightMatch(label, q) {
  const safe = escapeHtml(label);
  if (!q) return safe;
  const i = label.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return safe;
  return escapeHtml(label.slice(0, i)) + '<mark>' +
    escapeHtml(label.slice(i, i + q.length)) + '</mark>' +
    escapeHtml(label.slice(i + q.length));
}
function initMuniSearch(input, list, entries) {
  // entries: [{ key, label }]. We filter/display by label, commit by key.
  let matches = [], active = -1;
  function filter(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return entries.slice(0, 60);
    const pre = [], sub = [];
    for (const e of entries) {
      const l = e.label.toLowerCase();
      if (l.startsWith(q)) pre.push(e);
      else if (l.includes(q)) sub.push(e);
    }
    return [...pre, ...sub].slice(0, 60);
  }
  function render(q) {
    matches = filter(q);
    active = matches.length ? 0 : -1;
    list.innerHTML = matches.length
      ? matches.map((e, i) =>
          `<li class="muni-search-option${i === active ? ' is-active' : ''}" role="option" data-i="${i}">${highlightMatch(e.label, q)}</li>`).join('')
      : '<li class="muni-search-empty">No municipality matches</li>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function hide() { list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); }
  function commit(entry) { if (entry) { input.value = entry.label; hide(); renderCity(entry.key); } }
  input.addEventListener('focus', () => render(input.value));
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (ev) => {
    if (list.hidden && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) { render(input.value); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); active = Math.min(active + 1, matches.length - 1); paint(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); active = Math.max(active - 1, 0); paint(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (matches[active]) commit(matches[active]); }
    else if (ev.key === 'Escape') { hide(); }
  });
  function paint() {
    [...list.children].forEach((li, i) => li.classList.toggle('is-active', i === active));
    const el = list.children[active]; if (el) el.scrollIntoView({ block: 'nearest' });
  }
  list.addEventListener('mousedown', (ev) => {
    const li = ev.target.closest('.muni-search-option'); if (!li) return;
    ev.preventDefault(); commit(matches[+li.dataset.i]);
  });
  document.addEventListener('click', (ev) => { if (!ev.target.closest('#muni-search')) hide(); });
}

// ── LOAD DATA & WIRE SEARCH ─────────────────────────────────────
(function init() {
  const sel = document.getElementById('city-select');
  const list = document.getElementById('city-search-list');

  Promise.all([
    loadCSV('nj-city-findings.csv'),
    loadCSV('data/nj_pop_2024.csv')
  ]).then(([csvRows, popRows]) => {

    buildDataFromCSV(csvRows);
    buildPopulationLookup(popRows);

    initMuniSearch(sel, list, CITY_ENTRIES);

    // getCityFromURL already resolves ?city=&county= to a composite key.
    const initialKey = getCityFromURL() || (CITY_ENTRIES[0] && CITY_ENTRIES[0].key);
    renderCity(initialKey);

  });
})();

// ── BUILD TWO-COLUMN ASSET TABLE ─────────────────────────────────
function buildAssetTwoCol(assetArr, totals) {
  const mid = Math.ceil(assetArr.length / 2);
  const left = assetArr.slice(0, mid);
  const right = assetArr.slice(mid);

  function buildHalf(items, appendTotals) {
    let rows = '';
    items.forEach(a => {
      const m = ASSET_META[a.key];
      const gc = growthClass(a.growth);
      const growthLabel = a.growth >= 999 ? 'New' : (a.growth > 0 ? '+' + Math.round(a.growth) + '%' : (a.growth === 0 ? '—' : Math.round(a.growth) + '%'));
      rows += `<tr>
        <td>${m.label}</td>
        <td class="asset-num">${fmt(a.total)}</td>
        <td class="asset-num"><span class="tbl-pct y2025">${fmtPctValue(a.p25)}</span> <span class="tbl-count">(${fmt(a.r25)})</span></td>
        <td class="asset-num"><span class="tbl-pct y2050">${fmtPctValue(a.p50)}</span> <span class="tbl-count">(${fmt(a.r50)})</span></td>
        <td class="asset-num"><span class="growth-badge ${gc}">${growthLabel}</span></td>
      </tr>`;
    });
    if (appendTotals && totals) {
      const tGrowth = totals.r25 > 0 ? ((totals.r50 - totals.r25) / totals.r25 * 100) : 0;
      const tGrowthLabel = tGrowth > 0 ? '+' + Math.round(tGrowth) + '%' : (tGrowth === 0 ? '—' : Math.round(tGrowth) + '%');
      const tGc = growthClass(tGrowth);
      rows += `<tr class="asset-total-row">
        <td><strong>All Infrastructure</strong></td>
        <td class="asset-num"><strong>${fmt(totals.total)}</strong></td>
        <td class="asset-num"><span class="tbl-pct y2025">${fmtPctValue(totals.total ? totals.r25 / totals.total * 100 : 0)}</span> <span class="tbl-count">(${fmt(totals.r25)})</span></td>
        <td class="asset-num"><span class="tbl-pct y2050">${fmtPctValue(totals.total ? totals.r50 / totals.total * 100 : 0)}</span> <span class="tbl-count">(${fmt(totals.r50)})</span></td>
        <td class="asset-num"><span class="growth-badge ${tGc}">${tGrowthLabel}</span></td>
      </tr>`;
    }
    return `<table class="asset-tbl">
      <thead><tr>
        <th>Infrastructure Type</th><th>Total</th><th>2025</th><th>2050</th><th>Growth</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  return `<div class="asset-col">${buildHalf(left, false)}</div><div class="asset-col">${buildHalf(right, true)}</div>`;
}

// ── RENDER CITY FACT SHEET ────────────────────────────────────
function renderCity(keyOrName) {
  // Accept a resolved composite key, or a raw name/label to resolve.
  const matchedKey = CITIES[keyOrName] ? keyOrName : findCityMatch(keyOrName);

  const container = document.getElementById('fact-sheet-container');
  const btn = document.getElementById('btn-export');
  const sel = document.getElementById('city-select');

  if (!matchedKey || !CITIES[matchedKey]) {
    syncCityURL('');
    container.innerHTML = `<div class="empty-state">
      <h2>City-Level Flood Risk, Ready to Explore</h2>
      <p>Select a city above to view flood exposure, population impacts, public asset risk, and disaster recovery trends.</p>
    </div>`;
    btn.disabled = true;
    return;
  }

  syncCityURL(matchedKey);
  btn.disabled = false;
  const c = CITIES[matchedKey];
  const f = FEMA[matchedKey];
  const row = CSV_DATA[matchedKey] || {};
  // Display name (plain city name) is separate from the lookup key.
  const cityName = c.city;
  if (sel && sel.value !== c.label) sel.value = c.label;
  const population2024 = num(row.POPULATION) || POPULATION_2024[normalizeMunicipalityName(cityName)];
  const countyName = String(row.COUNTY || '').trim();
  const blueAcresParcels = num(row.blueacres);
  const countyIntro = countyName
    ? `is part of <strong>${countyName} County</strong> and has experienced`
    : 'has experienced';
  const placeTitle = countyName
    ? `${cityName}, ${countyName} County, New Jersey`
    : `${cityName}, New Jersey`;
  const fundingPlaceName = cityName;
  const blueAcresSummary = blueAcresParcels > 0
    ? `Displacement is already underway. <strong>${cityName}</strong> accounts for <strong>${fmt(blueAcresParcels)} Blue Acres buyout ${blueAcresParcels === 1 ? 'property' : 'properties'}</strong>, part of <strong>1,677 statewide buyouts since 1987</strong>.`
    : `No Blue Acres buyouts are recorded for <strong>${cityName}</strong> in this dataset, though displacement pressure is already visible in nearby communities across ${countyName ? `<strong>${countyName} County</strong>` : 'New Jersey'} and statewide.`;
  const blueAcresDetail = blueAcresParcels > 0
    ? `These flood-damaged properties were acquired through New Jersey's voluntary home buyout program, Blue Acres.`
    : `The absence of recorded buyouts here does not mean the city is free from flood-related housing risk.`;
  if (!c || !f) {
  container.innerHTML = `<div class="empty-state">
    <p>No data available for ${cityName}.</p>
  </div>`;
  return;
}


  // Compute asset totals
  let totalAssets = 0, risk2025 = 0, risk2050 = 0;
   Object.values(c.assets || {}).forEach(([t, r25, r50]) => {
    totalAssets += t; risk2025 += r25; risk2050 += r50;
  });

  // Build asset data array
  const assetKeys = Object.keys(ASSET_META);
  const assetArr = assetKeys.map(k => {
    const [total, r25, r50] = c.assets[k];
    const p25 = total ? (r25 / total * 100) : 0;
    const p50 = total ? (r50 / total * 100) : 0;
    const growth = r25 > 0 ? ((r50 - r25) / r25 * 100) : (r50 > 0 ? 999 : 0);
    return { key: k, total, r25, r50, p25, p50, growth };
  }).sort((a, b) => b.p50 - a.p50);



  // Build map SVG
  const mapSVG = buildNJMapSVG(cityName);

  container.innerHTML = `
  <div class="fact-sheet" id="fact-sheet">
    <!-- HEADER -->
    <div class="fs-header">
      <div class="fs-header-top">
        <img class="fs-logo" src="RBD-logo.png" alt="Rebuild by Design">
        <img class="fs-header-banner" src="nj-banner.png" alt="New Jersey Cannot Afford to Wait">
      </div>
      <div class="fs-county-name">${placeTitle}</div>
      <div class="fs-subtitle">Flood Risk to People, Local Infrastructure, and the Economy</div>
    </div>

    <!-- MAP + RESILIENT INFRASTRUCTURE -->
      <div class="bond-act-callout">
        <div class="bond-act-header">
          <span class="bond-act-title">The Case for Dedicated Funding in ${fundingPlaceName}</span>

        </div>
        <div class="bond-message">
          <ul class="bond-message-list">
            <li><strong>${cityName}</strong> ${countyIntro} <strong>${f.disasters} federal disaster declarations</strong> since 2011.</li>
            <li>Across the state, 93% of NJ voters want investments to reduce weather damage and <strong>77%</strong> are worried about extreme weather across party lines <a class="citation-link" href="https://www.fdu.edu/news/fdu-poll-finds-3-in-4-nj-voters-worried-about-damage-from-extreme-weather/" target="_blank" rel="noopener noreferrer">(Fairleigh Dickinson University, 2024)</a>.</li>
            ${c.facts && c.facts.length 
            ? c.facts.map(f => `<li>${f}</li>`).join('')
            : '<li style="color:red;">NO FACTS FOUND</li>'}
            <li>NJ needs a dedicated resilient infrastructure funding source.</li>
          </ul>
        </div>
      </div>


<!-- KEY METRICS -->
<div class="section-title">Community Overview</div>
<div class="metrics-strip">

  <!-- FEMA Disasters -->
  <div class="metric-cell">
    <div class="risk-card-title">FEMA Disasters</div>
    <div class="metric-value crisis">${f.disasters}</div>
    <div class="metric-sub">2011 – 2024</div>
  </div>
<div class="metric-cell">
  <div class="risk-card-title">Population</div>
  <div class="metric-value">${fmt(population2024)}</div>
  <div class="metric-sub">2024 Estimate</div>
    </div>
 
  <div class="metric-cell">
  <div class="risk-card-title">County FEMA Funding</div>
  <div class="metric-value purple">${fmtDollar(num(row.County_FEMA_Per_Capita))}</div>
  <div class="metric-sub">Per Capita, 2011 – 2024</div>
</div>
 <div class="metric-cell">
  <div class="risk-card-title">Blue Acres State Buyout Program</div>
  <div class="metric-value teal">${fmt(num(row.blueacres))}</div>
  <div class="metric-sub">Municipal Buyout Parcels</div>
</div>


</div>

<!-- ASSET TABLE HEADER -->
<div class="section-title">Public Infrastructure In the Flood Zones</div>

<div class="insights-split">
  <div class="displacement-panel">
    <div class="insight-kicker">Public Infrastructure at Risk</div>
    <div class="infrastructure-callout">Today, <strong class="infra-num y2024">${fmt(risk2025)}</strong> public infrastructure assets are already in flood zones, rising to <strong class="infra-num y2050">${fmt(risk2050)}</strong> by 2050.</div>
    <div class="risk-card risk-card-embedded">
      <div class="risk-row">
        <span class="risk-year-label y2024">2025</span>
        <div class="risk-bar-track">
          <div class="risk-bar-fill y2024" style="width:${totalAssets ? risk2025 / totalAssets * 100 : 0}%"></div>
        </div>
        <span class="risk-value y2024">
          ${fmt(risk2025)} 
          <span style="font-size:0.72rem;font-weight:400">
            (${fmtPctValue(totalAssets ? risk2025 / totalAssets * 100 : 0)})
          </span>
        </span>
      </div>

      <div class="risk-row">
        <span class="risk-year-label y2050">2050</span>
        <div class="risk-bar-track">
          <div class="risk-bar-fill y2050" style="width:${totalAssets ? risk2050 / totalAssets * 100 : 0}%"></div>
        </div>
        <span class="risk-value y2050">
          ${fmt(risk2050)} 
          <span style="font-size:0.72rem;font-weight:400">
            (${fmtPctValue(totalAssets ? risk2050 / totalAssets * 100 : 0)})
          </span>
        </span>
      </div>
    </div>
  </div>
  <div class="blue-acres-panel">
    <div class="blue-acres-kicker">Displacement Findings</div>
    <div class="blue-acres-stats">
      <div class="blue-acres-stat">
        <div class="blue-acres-value">${fmt(blueAcresParcels)}</div>
        <div class="blue-acres-label">Municipal Blue Acres Buyout Parcels</div>
      </div>
      <div class="blue-acres-stat">
        <div class="blue-acres-value">1,677</div>
        <div class="blue-acres-label">Statewide Buyouts Since 1987</div>
      </div>
    </div>
    <div class="blue-acres-note">${blueAcresSummary}</div>
    <div class="blue-acres-detail">${blueAcresDetail}</div>
  </div>
</div>

<!-- ASSET TABLE -->
<div class="asset-two-col">
  ${buildAssetTwoCol(assetArr, { total: totalAssets, r25: risk2025, r50: risk2050 })}
</div>

   <!-- FOOTER -->
    <div class="fs-footer">
      <div>
        <div class="fs-footer-title">Methodology &amp; Notes</div>
        <ul class="fs-footer-list">
          <li>This fact sheet draws from three Rebuild by Design research products: the <strong>Atlas of Disaster</strong> (county-level disaster declarations and FEMA obligations, 2011–2024), <strong>NJ Flood Risk = Financial Risk</strong> (parcel-level displacement and financial analysis of all 3.4 million NJ properties), and <strong>NJ Underwater: Public Infrastructure at Risk</strong> (exposure analysis of 18,959 public assets under 2025 and 2050 flood conditions).</li>
<li><strong>Data Sources:</strong> CDC/ATSDR 2022, EPA, FEMA, NJ Office of GIS, NJDEP, Rutgers University, Senate Budget Office, Trust for Public Land, US EIA, USDOT.</li>
        </ul>
      </div>
      <div>
        <ul class="fs-footer-list">
          <li>Visit <a href="https://rebuildbydesign.org/new-jersey" target="_blank">rebuildbydesign.org/new-jersey</a> for reports, tools, and upcoming events.</li>
          <li>For more information, contact <a href="mailto:info@rebuildbydesign.org">info@rebuildbydesign.org</a></li>
        </ul>
      </div>
    </div>

  </div><!-- end .fact-sheet -->
`;
}

// ── PDF EXPORT ──────────────────────────────────────────────────
const PDF_EXPORT = {
  marginInches: 0.3,
  widthInches: 8.5,
  heightInches: 11,
  pxPerInch: 96
};

function preparePDFExport(container) {
  document.body.classList.add('exporting-pdf');

  return () => {
    document.body.classList.remove('exporting-pdf');
  };
}

function rasterizeSVGs(container) {
  const svgs = container.querySelectorAll('.county-map-wrap svg, .city-map-wrap svg');
  const promises = [];
  svgs.forEach(svg => {
    const origSVGMarkup = svg.outerHTML;
    const paths = svg.querySelectorAll('path');
    paths.forEach(path => {
      const computed = window.getComputedStyle(path);
      path.setAttribute(
        'style',
        `fill:${computed.fill};stroke:${computed.stroke};stroke-width:${computed.strokeWidth};opacity:${computed.opacity}`
      );
    });

    const wrap = svg.closest('.county-map-wrap, .city-map-wrap');
    if (!wrap) {
      paths.forEach(path => path.removeAttribute('style'));
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const drawW = wrapRect.width;
    const drawH = wrapRect.height;
    const vb = svg.viewBox.baseVal;
    const zoomX = drawW / svgRect.width;
    const zoomY = drawH / svgRect.height;
    const cropW = vb.width * zoomX;
    const cropH = vb.height * zoomY;
    const cropX = vb.x + (vb.width - cropW) / 2;
    const cropY = vb.y + (vb.height - cropH) / 2;

    const origViewBox = svg.getAttribute('viewBox');
    svg.setAttribute('viewBox', `${cropX.toFixed(2)} ${cropY.toFixed(2)} ${cropW.toFixed(2)} ${cropH.toFixed(2)}`);
    svg.setAttribute('width', drawW);
    svg.setAttribute('height', drawH);

    const svgData = new XMLSerializer().serializeToString(svg);

    svg.setAttribute('viewBox', origViewBox);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    paths.forEach(path => path.removeAttribute('style'));

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    const p = new Promise((resolve) => {
      img.onload = () => {
        const scale = 3;
        const canvas = document.createElement('canvas');
        canvas.width = drawW * scale;
        canvas.height = drawH * scale;
        canvas.style.width = drawW + 'px';
        canvas.style.height = drawH + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, drawW, drawH);

        URL.revokeObjectURL(url);
        svg.parentNode.replaceChild(canvas, svg);
        canvas._origSVG = origSVGMarkup;
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
    });
    img.src = url;
    promises.push(p);
  });
  return Promise.all(promises);
}

function restoreSVGs(container, canvases) {
  canvases.forEach(canvas => {
    if (canvas && canvas._origSVG && canvas.parentNode) {
      const tmp = document.createElement('div');
      tmp.innerHTML = canvas._origSVG;
      const svg = tmp.firstElementChild;
      canvas.parentNode.replaceChild(svg, canvas);
    }
  });
}

function waitForNextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function fixObjectFitImages(container) {
  const images = container.querySelectorAll('img[class*="banner"], .fs-header-banner');
  const originals = [];
  images.forEach(img => {
    if (!img.complete || !img.naturalWidth) return;
    const style = window.getComputedStyle(img);
    const objFit = style.objectFit;
    if (objFit === 'contain' || objFit === 'cover') {
      const containerW = img.clientWidth;
      const containerH = img.clientHeight;
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      const ratio = Math.min(containerW / natW, containerH / natH);
      const drawW = natW * ratio;
      const drawH = natH * ratio;

      originals.push({
        el: img,
        width: img.style.width,
        height: img.style.height,
        maxWidth: img.style.maxWidth,
        objectFit: img.style.objectFit
      });

      img.style.width = Math.round(drawW) + 'px';
      img.style.height = Math.round(drawH) + 'px';
      img.style.maxWidth = 'none';
      img.style.objectFit = 'fill';
    }
  });
  return originals;
}

function restoreObjectFitImages(originals) {
  originals.forEach(o => {
    o.el.style.width = o.width;
    o.el.style.height = o.height;
    o.el.style.maxWidth = o.maxWidth;
    o.el.style.objectFit = o.objectFit;
  });
}

async function exportPDF() {
  const el = document.getElementById('fact-sheet');
  if (!el) return;

  const cityName = document.getElementById('city-select').value;
  const btn = document.getElementById('btn-export');
  btn.disabled = true;
  btn.textContent = 'Generating…';

  window.scrollTo(0, 0);

  let canvases = [];
  let imgOriginals = [];
  let cleanupExport = null;

  try {
    cleanupExport = preparePDFExport(el);

    await waitForNextFrame();
    await waitForNextFrame();

    canvases = await rasterizeSVGs(el);
    imgOriginals = fixObjectFitImages(el);

    await waitForNextFrame();

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      backgroundColor: '#ffffff',
      width: el.scrollWidth,
      height: el.scrollHeight
    });

    // Export the ENTIRE sheet onto ONE page. Keep the standard 8.5" page
    // width and make the page exactly as tall as the content needs, so the
    // sheet is never sliced across pages and never shrunk into whitespace.
    // Resolve jsPDF from whichever global the loaded bundle exposes
    // (jsPDF 2.x = window.jspdf.jsPDF).
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF ||
      (window.html2pdf && window.html2pdf.jsPDF) || null;
    const m = PDF_EXPORT.marginInches;
    const filename = `NJUnderwater_${cityName}.pdf`;
    const aspect = canvas.width / canvas.height;

    // Content fills the page width minus margins; height follows the aspect
    // ratio; the page itself grows to fit (single page, full resolution).
    const imgW = PDF_EXPORT.widthInches - 2 * m;
    const imgH = imgW / aspect;
    const pageW = PDF_EXPORT.widthInches;
    const pageH = imgH + 2 * m;

    if (jsPDFCtor) {
      const pdf = new jsPDFCtor({ unit: 'in', format: [pageW, pageH], orientation: 'portrait' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', m, m, imgW, imgH);
      pdf.save(filename);
    } else {
      // Fallback: html2pdf onto the same custom single-page size.
      await window.html2pdf().set({
        margin: [m, m, m, m],
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        jsPDF: { unit: 'in', format: [pageW, pageH], orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'] }
      }).from(canvas, 'canvas').toPdf().save();
    }
  } catch (err) {
    console.error('PDF export failed', err);
    alert(err.message);
  } finally {
    restoreObjectFitImages(imgOriginals);
    restoreSVGs(el, canvases);
    if (cleanupExport) cleanupExport();
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export PDF`;
  }
}
// ── PNG EXPORT ──────────────────────────────────────────────────
async function exportPNG() {
  const el = document.getElementById('fact-sheet');
  if (!el) return;

  const cityName = document.getElementById('city-select').value;
  const btn = document.getElementById('btn-export-png');
  btn.disabled = true;
  btn.textContent = 'Generating…';

  window.scrollTo(0, 0);

  let canvases = [];
  let imgOriginals = [];

  try {
    await waitForNextFrame();
    await waitForNextFrame();

    canvases = await rasterizeSVGs(el);
    imgOriginals = fixObjectFitImages(el);

    await waitForNextFrame();

    const canvas = await html2canvas(el, {
      scale: 3,
      useCORS: true,
      letterRendering: true,
      backgroundColor: '#ffffff'
    });

    // Convert to blob and download
    canvas.toBlob(function(blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cityName}_City_Flood_Risk_Fact_Sheet.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  } catch (err) {
    console.error('PNG export failed', err);
  } finally {
    restoreObjectFitImages(imgOriginals);
    restoreSVGs(el, canvases);
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> Export PNG`;
  }
}
