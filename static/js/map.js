let MAP;
let GEO;
let COUNTRIES = [];
let FEATURES_BY_NAME = new Map();

let state = {
  region: sessionStorage.getItem("geoquest_map_region") || "All",
  total: parseInt(sessionStorage.getItem("geoquest_map_total") || "10", 10),
  score: 0,
  streak: 0,
  idx: 0,
  target: null,
  locked: false,
  layerByIsoA3: new Map(),
  centroidByIsoA3: new Map(),
  attempts: 0,
  // attemptsMax is configurable via the Map Setup UI (stored in sessionStorage)
  attemptsMax: parseInt(sessionStorage.getItem("geoquest_map_attempts") || "3", 10),
  isoRegion: new Map(),
  regionBounds: new Map(),
  removedLayers: new Map(),
  _prevMaxBounds: null,
  _prevMinZoom: null,
  regionMask: null,
};

function iso2ToFlagEmoji(iso2){
  if (!iso2 || iso2.length !== 2) return "🏳️";
  const A = 0x1F1E6;
  const code = iso2.toUpperCase();
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}

function haversine(a, b){
  const R = 6371;
  const toRad = (x)=> x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function setHUD(){
  document.getElementById("map-score").textContent = state.score;
  document.getElementById("map-total").textContent = state.total;
  document.getElementById("map-streak").textContent = state.streak;
}

function showNextButton(){
  const hotcoldEl = document.getElementById("hotcold");
  // show the out-of-attempts message in the small banner area (use white text on black banner)
  hotcoldEl.innerHTML = `<div style="color: #fff; font-weight: 800;"></div>`;

  // remove any existing next button in the banner
  try { const existing = document.getElementById('next-btn'); if (existing) existing.remove(); } catch(e){}
  try { const existingSee = document.getElementById('see-btn'); if (existingSee) existingSee.remove(); } catch(e){}

  // create a compact Next button and insert it next to the banner text so it's visually close to the "Click on" target
  try {
    const banner = document.getElementById('map-banner');
    const bannerRight = banner ? banner.querySelector('.banner-right') : null;
    const bannerText = banner ? banner.querySelector('.banner-text') : null;
    const btn = document.createElement('button');
    btn.id = 'next-btn';
    btn.className = 'btn btn-primary';
    btn.style.padding = '8px 12px';
    btn.style.marginLeft = '10px';
    btn.style.fontWeight = '700';
    btn.textContent = 'Next';

    // insert into the right-side banner container (before attempts-left)
    const attemptsEl = bannerRight ? bannerRight.querySelector('#attempts-left') : null;
    if (bannerRight && attemptsEl) bannerRight.insertBefore(btn, attemptsEl);
    else {
      // fallback: insert after banner-text
      const bannerText = banner.querySelector('.banner-text');
      if (bannerText && bannerText.parentNode) bannerText.parentNode.insertBefore(btn, bannerText.nextSibling);
    }

    btn.addEventListener('click', () => {
      state.idx += 1;
      if (state.idx >= state.total) {
        window.location.href = "/";
        return;
      }
      hotcoldEl.textContent = "";
      try { btn.remove(); } catch(e){}
      try { const s = document.getElementById('see-btn'); if (s) s.remove(); } catch(e){}
      nextTarget();
      state.locked = false;
    });
    // Also add a "See country" button so the user can zoom to the revealed country
    try {
      const see = document.createElement('button');
      see.id = 'see-btn';
      see.className = 'btn btn-outline';
      see.style.padding = '8px 12px';
      see.style.marginLeft = '8px';
      see.style.fontWeight = '700';
      see.textContent = 'See country';

  // insert into right group (left of attempts counter) when possible
    const attemptsEl2 = bannerRight ? bannerRight.querySelector('#attempts-left') : null;
    if (bannerRight && attemptsEl2) bannerRight.insertBefore(see, attemptsEl2);
    else if (bannerText && bannerText.parentNode) bannerText.parentNode.insertBefore(see, bannerText.nextSibling);

      see.addEventListener('click', () => {
        try {
          const correctLayer = findLayerForCountry(state.target);
          if (correctLayer) {
            try {
              const b = correctLayer.getBounds();
              if (b && b.isValid()) {
                MAP.fitBounds(b.pad(0.15));
                // bring revealed layer above others
                try { if (correctLayer.bringToFront) correctLayer.bringToFront(); } catch(e){}
              } else {
                // fallback to centroid
                const tc = state.centroidByIsoA3.get(((state.target && state.target.cca3) || '').toUpperCase());
                if (tc) MAP.setView([tc.lat, tc.lng], Math.max(MAP.getZoom(), 5));
              }
            } catch(e){ console.warn('see-btn: failed to fitBounds on layer', e); }
          } else {
            const tc = state.centroidByIsoA3.get(((state.target && state.target.cca3) || '').toUpperCase());
            if (tc) {
              try { MAP.setView([tc.lat, tc.lng], Math.max(MAP.getZoom(), 5)); } catch(e){}
            }
          }
        } catch(e){ console.warn('see-btn: error', e); }

        // disable the see button after use
        try { see.disabled = true; see.style.opacity = 0.6; } catch(e){}
      });
    } catch(e) { console.warn('showNextButton: failed to insert see-btn', e); }
  } catch(e) { console.warn('showNextButton: failed to insert banner next-btn', e); }
}

function resetRun(){
  state.score = 0;
  state.streak = 0;
  state.idx = 0;
  state.attempts = 0;
  document.getElementById("hotcold").textContent = "";
  state.layerByIsoA3.forEach((layer) => layer.setStyle(defaultStyle()));
  nextTarget();
  setHUD();
}

function defaultStyle(){
  return {
    color: '#ffffff',
    weight: 2.5,
    fillColor: '#0f172a',
    fillOpacity: 1
  };
}

function hoverStyle(){
  return {
    color: '#ffffff',
    weight: 3.5,
    fillColor: '#1e293b',
    fillOpacity: 1
  };
}

function correctStyle(){
  return {
    color: '#ffffff',
    weight: 4,
    fillColor: '#10b981',
    fillOpacity: 1
  };
}

function wrongStyle(){
  return {
    color: '#ffffff',
  weight: 3,
    fillColor: '#ef4444',
    fillOpacity: 0.85
  };
}

function pickPool(){
  const list = COUNTRIES.filter(c => c.name && c.cca3);
  if (state.region === "All") return list;
  return list.filter(c => c.region === state.region);
}

function nextTarget(){
  // remove banner next button if present (we're moving to next question)
  try { const nb = document.getElementById('next-btn'); if (nb) nb.remove(); } catch(e){}
  try { const sb = document.getElementById('see-btn'); if (sb) sb.remove(); } catch(e){}

  const pool = pickPool();
  const pool2 = pool.filter(c => {
    const isoKey = (c.cca3 || '').toUpperCase();
    const layer = state.layerByIsoA3.get(isoKey);
    return layer && MAP.hasLayer(layer);
  });
  const use = pool2.length ? pool2 : pool.filter(c => state.layerByIsoA3.has((c.cca3||'').toUpperCase()));

  state.target = use[Math.floor(Math.random() * use.length)];
  // refresh configured attempts in case user changed it in the setup modal
  state.attemptsMax = parseInt(sessionStorage.getItem("geoquest_map_attempts") || state.attemptsMax || "3", 10);
  state.attempts = 0;
  document.getElementById("target-name").textContent = state.target.name;
  document.getElementById("target-flag").textContent = iso2ToFlagEmoji(state.target.cca2);
  
  // Reset all layers to default style
  state.layerByIsoA3.forEach((layer) => {
    try { layer.setStyle(defaultStyle()); } catch {}
  });
  
  state.locked = false;

  // update attempts-left display
  try { const leftEl = document.getElementById('attempts-left'); if (leftEl) leftEl.textContent = (state.attemptsMax || 3); } catch(e){}
}

function setRegionMask(bounds){
  if (state.regionMask) {
    try { MAP.removeLayer(state.regionMask); } catch {}
    state.regionMask = null;
  }

  if (!bounds || !bounds.isValid()) return;

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const outer = [
    [90, -180],
    [90, 180],
    [-90, 180],
    [-90, -180]
  ];

  const inner = [
    [sw.lat, sw.lng],
    [sw.lat, ne.lng],
    [ne.lat, ne.lng],
    [ne.lat, sw.lng]
  ];

  state.regionMask = L.polygon([outer, inner], {
    stroke: false,
    fillColor: '#06b6d4',
    fillOpacity: 1,
    interactive: false,
    pane: 'overlayPane'
  });

  state.regionMask.addTo(MAP);
  state.regionMask.bringToFront();
}

function applyRegionFilter(region){
  if (!region || region === "All"){
    setRegionMask(null);

    state.removedLayers.forEach((layer, iso) => {
      try { MAP.addLayer(layer); } catch {}
    });
    state.removedLayers.clear();

    state.layerByIsoA3.forEach((layer) => {
      try { layer.setStyle(defaultStyle()); } catch{}
      try { layer.options.interactive = true; if (layer._path) layer._path.style.pointerEvents = ''; } catch{}
    });

    try {
      // Very generous bounds for "All" - allow panning far beyond the world in all directions
      MAP.setMaxBounds([[-270, -540], [270, 540]]);
      // Allow zooming out all the way
      MAP.setMinZoom(0);
      state._prevMaxBounds = null;
      state._prevMinZoom = null;
    } catch(e){}

    MAP.setView([15,10], 2);
    return;
  }

  state.layerByIsoA3.forEach((layer, iso) => {
    const r = state.isoRegion.get(iso);
    const centroid = state.centroidByIsoA3.get(iso);
    const belongs = r ? (r === region) : (centroid ? isCentroidInRegion(region, centroid) : false);

    if (belongs) {
      if (!MAP.hasLayer(layer)) {
        try { MAP.addLayer(layer); } catch {}
        try { state.removedLayers.delete(iso); } catch {}
      }
      try { layer.setStyle(defaultStyle()); } catch{}
      try { layer.options.interactive = true; if (layer._path) layer._path.style.pointerEvents = ''; } catch{}
    } else {
      if (MAP.hasLayer(layer)){
        try { MAP.removeLayer(layer); state.removedLayers.set(iso, layer); } catch {}
      }
    }
  });
  
  // try to get precomputed bounds for the region; if missing, compute from visible layers
  let bounds = state.regionBounds.get(region);
  if ((!bounds || !bounds.isValid())){
    try {
      const computed = L.latLngBounds();
      state.layerByIsoA3.forEach((layer, iso) => {
        const r = state.isoRegion.get(iso);
        const centroid = state.centroidByIsoA3.get(iso);
        const belongs = r ? (r === region) : (centroid ? isCentroidInRegion(region, centroid) : false);
        if (belongs) {
          try { const b = layer.getBounds(); if (b && b.isValid()) computed.extend(b); } catch(e){}
        }
      });
      if (computed.isValid()) bounds = computed;
    } catch(e){}
  }

  if (bounds && bounds.isValid()){
    const padded = bounds.pad(0.20);

    setRegionMask(padded);

    try { MAP.fitBounds(padded, { animate: false }); } catch(e) { MAP.fitBounds(padded); }

    try {
      // Store previous constraints
      if (!state._prevMaxBounds) state._prevMaxBounds = MAP.options.maxBounds || null;
      if (state._prevMinZoom === null || state._prevMinZoom === undefined) {
        state._prevMinZoom = MAP.getMinZoom ? MAP.getMinZoom() : MAP.options.minZoom;
      }

      // Much more relaxed constraints for regional maps
      // Allow zooming out significantly (to zoom level 0 = world view)
      MAP.setMinZoom(0);
      
      // Calculate very generous bounds with extended latitude range
      const sw = padded.getSouthWest();
      const ne = padded.getNorthEast();
      
      // Extend bounds significantly in all directions (5x horizontally, 3x vertically)
      const latSpan = ne.lat - sw.lat;
      const lngSpan = ne.lng - sw.lng;
      
      const extendedBounds = L.latLngBounds(
        [Math.max(-85, sw.lat - latSpan * 3), sw.lng - lngSpan * 5],  // Southwest with extensions
        [Math.min(85, ne.lat + latSpan * 3), ne.lng + lngSpan * 5]    // Northeast with extensions
      );
      
      try { 
        MAP.setMaxBounds(extendedBounds); 
      } catch(e) { 
        // Fallback to even more generous world bounds
        MAP.setMaxBounds([[-270, -540], [270, 540]]);
      }
    } catch (e){}
  } else {
    // if we couldn't compute bounds, fall back to world view
    setRegionMask(null);
    MAP.setView([15,10], 2);
  }
}

function hotCold(clickedIsoA3){
  const t = state.target;
  const c1 = state.centroidByIsoA3.get(clickedIsoA3);
  const c2 = state.centroidByIsoA3.get((t.cca3||'').toUpperCase());
  if (!c1 || !c2) return "";
  const d = haversine(c1, c2);
  // Return numeric distance (km) and whether it's considered "close"
  const close = (d < 1500);
  return { distance: d, close };
}

function isCentroidInRegion(region, c){
  if (!c) return false;
  const lat = c.lat, lng = c.lng;
  switch(region){
    case 'Africa':
      return (lng >= -20 && lng <= 55 && lat >= -35 && lat <= 38);
    case 'Europe':
      return (lng >= -25 && lng <= 45 && lat >= 34 && lat <= 72);
    case 'Asia':
      return ((lng >= 26 && lng <= 180) && (lat >= -11 && lat <= 81)) || (lng > 45 && lat >= -11);
    case 'Americas':
    case 'America':
      return (lng >= -170 && lng <= -30 && lat >= -60 && lat <= 72);
    case 'Oceania':
      return (lng >= 110 && lng <= 180 && lat >= -50 && lat <= 10);
    default:
      return false;
  }
}

function findLayerForCountry(country){
  if (!country) return null;
  const cca3 = (country.cca3 || '').toUpperCase();
  const cca2 = (country.cca2 || '').toUpperCase();
  // direct lookup by cca3
  if (cca3 && state.layerByIsoA3.has(cca3)) return state.layerByIsoA3.get(cca3);

  // try matching by feature properties: iso_a3, iso_a2, or name
  for (const [iso, layer] of state.layerByIsoA3.entries()){
    try {
      const props = layer.feature && layer.feature.properties ? layer.feature.properties : {};
      if (props.iso_a3 && (props.iso_a3 || '').toUpperCase() === cca3) return layer;
      if (props.iso_a2 && (props.iso_a2 || '').toUpperCase() === cca2) return layer;
      if (props.name && country.name && (props.name || '').toLowerCase() === (country.name || '').toLowerCase()) return layer;
      // sometimes name fields differ; check common inclusion
      if (props.name && country.name && (props.name || '').toLowerCase().includes((country.name || '').toLowerCase())) return layer;
    } catch(e){}
  }

  // as a last resort, try centroid proximity: find layer whose centroid matches target centroid
  const targetCent = state.centroidByIsoA3.get(cca3);
  if (targetCent) {
    for (const [iso, layer] of state.layerByIsoA3.entries()){
      const c = state.centroidByIsoA3.get(iso);
      if (!c) continue;
      const d = haversine(c, targetCent);
      if (d < 1) return layer; // same centroid
    }
  }
  console.warn('findLayerForCountry: failed to find layer for', country.name, cca3, cca2);
  return null;
}

function onCountryClick(feature, layer){
  if (state.locked) return;

  const isoRaw = feature.properties.iso_a3;
  const iso = isoRaw ? isoRaw.toUpperCase() : isoRaw;
  const targetCca3 = (state.target && state.target.cca3) ? state.target.cca3.toUpperCase() : null;
  const isCorrect = iso && targetCca3 ? (iso === targetCca3) : false;

  const s = loadStats();

  if (isCorrect) {
    state.locked = true;
    state.score += 1;
    state.streak += 1;
    s.mapCorrect = (s.mapCorrect || 0) + 1;
    s.mapTotal = (s.mapTotal || 0) + 1;
    bumpStreak(s);

    layer.setStyle(correctStyle());
    document.getElementById("hotcold").textContent = "✅ Correct";

    if (state.score > (s.bestMap || 0)) s.bestMap = state.score;
    saveStats(s);
    setHUD();

    setTimeout(() => {
      state.idx += 1;
      if (state.idx >= state.total) {
        window.location.href = "/";
        return;
      }
      document.getElementById("hotcold").textContent = "";
      nextTarget();
      state.locked = false;
    }, 900);

    return;
  }

  state.attempts = (state.attempts || 0) + 1;

  const hc = hotCold(iso);
  try {
    let hotcoldText = "";
    if (hc && typeof hc.distance === 'number') {
  const km = Math.round(hc.distance).toLocaleString();
  const isMobile = window.innerWidth < 480;

  hotcoldText = isMobile
    ? `${km} km`
    : `${km} km away — ${hc.close ? "Close" : "Not close"}`;
}

    document.getElementById("hotcold").textContent = hotcoldText;
  } catch(e){ console.warn('hotCold display error', e); }

  // update attempts-left display if present
  try {
    const leftEl = document.getElementById('attempts-left');
    if (leftEl) leftEl.textContent = Math.max((state.attemptsMax || 3) - state.attempts, 0);
  } catch(e){}

  layer.setStyle(wrongStyle());
  setTimeout(() => { if (!state.locked) layer.setStyle(defaultStyle()); }, 800);

  if (state.attempts >= (state.attemptsMax || 3)) {
    state.locked = true;
    state.streak = 0;
    s.mapTotal = (s.mapTotal || 0) + 1;
    if (state.score > (s.bestMap || 0)) s.bestMap = state.score;
    saveStats(s);
    setHUD();

    // Reveal the correct answer by highlighting it green
    const correctLayer = findLayerForCountry(state.target);
    if (correctLayer) {
      try {
        const reveal = correctStyle();
        reveal.weight = 6;
        reveal.fillOpacity = 1;
        correctLayer.setStyle(reveal);
        if (correctLayer._path && correctLayer.bringToFront) correctLayer.bringToFront();
        // do not auto-zoom to revealed country (user preference)
        try { correctLayer.options.interactive = false; } catch(e){}
      } catch(e){ console.warn('error styling correct layer', e); }
    } else {
      // fallback: center on target centroid if we have one
      try {
        const tc = state.centroidByIsoA3.get(((state.target && state.target.cca3) || '').toUpperCase());
        if (tc) {
          try { MAP.setView([tc.lat, tc.lng], Math.max(MAP.getZoom(), 4)); } catch(e){}
        }
      } catch(e){}
    }

    // ensure attempts-left shows zero
    try { const leftEl = document.getElementById('attempts-left'); if (leftEl) leftEl.textContent = 0; } catch(e){}

    // Show the "Next" button
    showNextButton();
  }
}

async function init(){
  setHUD();

  const [geoResp, countriesResp] = await Promise.all([
    fetch("/static/data/countries_geojson.json"),
    fetch("/api/countries")
  ]);

  GEO = await geoResp.json();
  const data = await countriesResp.json();
  COUNTRIES = (data.countries || []).filter(c => c.name && c.cca3);

  MAP = L.map("map", { 
    zoomControl: true, 
    worldCopyJump: false,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    minZoom: 0,  // Allow full zoom out
    maxBoundsViscosity: 0.5  // Makes bounds "soft" rather than hard walls
  }).setView([15, 10], 2);

  MAP.getContainer().style.backgroundColor = '#0891b2';

  // Start with very generous bounds in all directions (3x world height, 3x world width)
  MAP.setMaxBounds([[-270, -540], [270, 540]]);

  const geoLayer = L.geoJSON(GEO, {
    style: defaultStyle,
    onEachFeature: (feature, layer) => {
      const iso = feature.properties.iso_a3;
      const isoKey = iso ? iso.toUpperCase() : null;
      if (isoKey) state.layerByIsoA3.set(isoKey, layer);

      try {
        const b = layer.getBounds();
        const c = b.getCenter();
        if (isoKey) state.centroidByIsoA3.set(isoKey, {lat: c.lat, lng: c.lng});
        const country = COUNTRIES.find(x => (x.cca3 || '').toUpperCase() === isoKey);
        const region = country ? country.region : null;
        if (region && isoKey) {
          state.isoRegion.set(isoKey, region);
          const prev = state.regionBounds.get(region);
          if (prev) prev.extend(b);
          else state.regionBounds.set(region, L.latLngBounds(b));
        }
      } catch {}

      layer.on({
        mouseover: () => { if (!state.locked) layer.setStyle(hoverStyle()); },
        mouseout: () => { if (!state.locked) layer.setStyle(defaultStyle()); },
        click: () => onCountryClick(feature, layer)
      });
    }
  }).addTo(MAP);

  applyRegionFilter(state.region);

  nextTarget();

  document.getElementById("map-reset").addEventListener("click", resetRun);
}

init().catch(err => {
  console.error(err);
  document.getElementById("hotcold").textContent = "Failed to load map data.";
});