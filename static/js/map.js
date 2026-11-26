const regionViews = {
  All: [[-59, -180], [70, 180]],
  Africa: [[-37, -28], [37, 58]],
  Europe: [[33, -27], [72, 46]],
  Asia: [[-12, 25], [75, 180]],
  Americas: [[-58, -171], [74, -28]],
  Oceania: [[-52, 111], [23, 225]],
};
const countryStyles = {
  default: { color: "#f8fafc", weight: 1.2, fillColor: "#263d55", fillOpacity: 1 },
  context: { color: "#a6c2cf", weight: 1, fillColor: "#58748a", fillOpacity: 1 },
  wrong: { color: "#fff", weight: 1.5, fillColor: "#e66b55", fillOpacity: 1 },
  correct: { color: "#fff", weight: 2, fillColor: "#10b981", fillOpacity: 1 },
};

const mapElement = id => document.getElementById(id);
const configuredRegion = sessionStorage.getItem("geoquest_map_region") || "All";
const isReview = new URLSearchParams(location.search).has("review");
const region = !isReview && Object.hasOwn(regionViews, configuredRegion) ? configuredRegion : "All";
const roundLength = Number(sessionStorage.getItem("geoquest_map_total")) || 10;
const maxAttempts = Math.min(5, Math.max(1, Number(sessionStorage.getItem("geoquest_map_attempts")) || 3));
const countries = new Map();
const outlines = new Map();
const dots = new Map();
let map, world, guessLayer, revealLayer;
let queue, target, entries, guesses, attempts, locked;
let smallCountries = [];

function referencePoint(country) {
  const [lat, lng] = country.location;
  const center = map.getCenter().lng;
  return L.latLng(lat, lng + 360 * Math.round((center - lng) / 360));
}

function resetView() {
  map.fitBounds(regionViews[region], { padding: [14, 14], animate: false });
}

function directionFrom(from, to) {
  const rad = Math.PI / 180;
  const a = from.lat * rad;
  const b = to.lat * rad;
  const delta = (to.lng - from.lng) * rad;
  const h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(delta / 2) ** 2;
  const distance = 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  const y = Math.sin(delta) * Math.cos(b);
  const x = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta);
  const bearing = (Math.atan2(y, x) / rad + 360) % 360;
  const directions = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  return { distance, direction: directions[Math.round(bearing / 45) % 8] };
}

function eligible(country) {
  return country && (region === "All" || country.region === region);
}

function styleFor(code) {
  if (locked && code === target?.cca3) return "correct";
  if (guesses?.has(code)) return "wrong";
  return eligible(countries.get(code)) ? "default" : "context";
}

function updateStyles() {
  for (const [code, layers] of outlines) {
    for (const layer of layers) layer.setStyle(countryStyles[styleFor(code)]);
  }
  for (const [code, marker] of dots) {
    marker.getElement()?.setAttribute("data-outcome", styleFor(code));
  }
}

function refreshDots() {
  smallCountries = [];
  const view = map.getBounds().pad(0.12);
  for (const country of countries.values()) {
    if (!eligible(country)) continue;
    const code = country.cca3;
    const point = referencePoint(country);
    const footprint = outlines.get(code)?.[0].feature.properties.footprint;
    const small = !footprint || footprint.every(bounds => {
      const a = map.project(bounds[0]);
      const b = map.project(bounds[1]);
      return Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < 17;
    });

    if (!small || !view.contains(point)) {
      dots.get(code)?.remove();
      continue;
    }
    smallCountries.push({ country, point });
    if (!dots.has(code)) {
      const icon = L.divIcon({
        className: "country-dot-hit",
        html: '<span></span>',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      const marker = L.marker(point, { icon, alt: "Small country or territory", bubblingMouseEvents: false });
      marker.on("click", event => selectDot(country, event));
      dots.set(code, marker);
    }
    const marker = dots.get(code).setLatLng(point).addTo(map);
    marker.getElement().setAttribute("aria-label", "Small country or territory");
  }
  updateStyles();
}

function selectDot(country, event) {
  if (locked || !target) return;
  if (event.originalEvent?.detail) {
    const point = map.mouseEventToLayerPoint(event.originalEvent);
    const nearby = smallCountries.map(dot => ({
      ...dot, distance: map.latLngToLayerPoint(dot.point).distanceTo(point),
    })).filter(dot => dot.distance <= 17).sort((a, b) => a.distance - b.distance);
    if (nearby.length > 1 && nearby[1].distance - nearby[0].distance < 5 && map.getZoom() < map.getMaxZoom()) {
      map.setView(event.latlng, map.getZoom() + 2);
      mapElement("hotcold").textContent = "Several small places are close together. The map zoomed in so you can choose.";
      return;
    }
    country = nearby[0]?.country || country;
  }
  selectCountry(country);
}

function updateHUD() {
  const score = entries.filter(entry => entry.outcome !== "missed").length;
  mapElement("map-progress").textContent = `Question ${entries.length + (locked ? 0 : 1)} of ${queue.length}`;
  mapElement("map-score").textContent = score;
  const left = maxAttempts - attempts;
  mapElement("attempts-left").textContent = locked ? "" : `${left} ${left === 1 ? "attempt" : "attempts"} left`;
}

function nextQuestion() {
  target = queue[entries.length];
  guesses = new Set();
  attempts = 0;
  locked = false;
  guessLayer?.remove();
  revealLayer?.remove();
  resetView();
  updateStyles();
  updateHUD();
  mapElement("map-instruction").hidden = false;
  mapElement("target-name").textContent = target.name;
  mapElement("hotcold").textContent = "Select a country on the map. Dots mark small countries and territories.";
  mapElement("see-btn").textContent = "Reveal answer";
  mapElement("see-btn").disabled = false;
  mapElement("next-btn").hidden = true;
}

function startRound(codes) {
  const pool = [...countries.values()].filter(eligible);
  const picked = codes?.map(code => countries.get(code)).filter(eligible);
  queue = picked?.length ? picked : shuffle(pool).slice(0, roundLength);
  if (!queue.length) throw new Error("No places available in this region");
  entries = [];
  map.invalidateSize({ pan: false });
  nextQuestion();
}

function showAnswer() {
  const point = referencePoint(target);
  const realm = target.location[2];
  revealLayer?.remove();
  revealLayer = L.circleMarker(point, {
    radius: 9, color: "white", fillColor: "#10b981", fillOpacity: 1, weight: 3, interactive: false,
  }).addTo(map);
  revealLayer.bindTooltip(target.name, { permanent: true, direction: "top" });
  return realm;
}

function finishQuestion(outcome, clue = "") {
  locked = true;
  entries.push({ id: target.cca3, label: target.name, outcome });
  const stats = loadStats();
  stats.mapTotal += 1;
  if (outcome !== "missed") stats.mapCorrect += 1;
  stats.bestMap = Math.max(stats.bestMap, entries.filter(entry => entry.outcome !== "missed").length);
  recordRecall(stats, "map", target, outcome === "correct" ? "recalled" : outcome);
  bumpStreak(stats);
  saveStats(stats);

  const realm = showAnswer();
  const message = outcome === "correct" ? "Correct on the first try."
    : outcome === "assisted" ? "Correct with a hint." : "Answer revealed.";
  mapElement("hotcold").textContent = [message, clue, realm ? `${target.name} is in ${realm}.` : ""].filter(Boolean).join(" ");
  mapElement("map-instruction").hidden = true;
  mapElement("see-btn").textContent = "Center answer";
  const next = mapElement("next-btn");
  next.textContent = entries.length === queue.length ? "See results" : "Next country";
  next.hidden = false;
  updateStyles();
  updateHUD();
}

function selectCountry(country) {
  if (!target || locked || !eligible(country)) return;
  if (country === target) {
    finishQuestion(attempts ? "assisted" : "correct");
    return;
  }
  if (guesses.has(country.cca3)) {
    mapElement("hotcold").textContent = `You already tried ${country.name}. Choose a different place.`;
    return;
  }

  attempts += 1;
  guesses.add(country.cca3);
  const from = referencePoint(country);
  const { distance, direction } = directionFrom(from, referencePoint(target));
  const km = Math.round(distance).toLocaleString();
  const clue = `Try ${direction} of ${country.name} · about ${km} km between reference points.`;
  guessLayer?.remove();
  guessLayer = L.circleMarker(from, {
    radius: 6, color: "white", fillColor: "#e66b55", fillOpacity: 1, weight: 2, interactive: false,
  }).addTo(map);
  if (attempts >= maxAttempts) {
    finishQuestion("missed", `${target.name} is ${direction} of ${country.name} · about ${km} km.`);
    return;
  }

  mapElement("hotcold").textContent = clue;
  updateStyles();
  updateHUD();
}

function addWorld(geo) {
  for (const feature of geo.features) {
    const code = countryFeatureCode(feature);
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const footprint = polygons.map(([ring]) => L.latLngBounds(ring.map(([lon, lat]) => [lat, lon])));
    const ringBounds = footprint.map(bounds => [bounds.getSouthWest(), bounds.getNorthEast()]);
    for (const offset of [-360, 0, 360]) {
      const layer = L.geoJSON(feature, {
        coordsToLatLng: ([lon, lat]) => L.latLng(lat, lon + offset),
        style: countryStyles.default,
        interactive: eligible(countries.get(code)),
      }).getLayers()[0];
      layer.feature = { ...feature, properties: { ...feature.properties, footprint: ringBounds } };
      layer.on("click", () => selectCountry(countries.get(code)));
      if (!outlines.has(code)) outlines.set(code, []);
      outlines.get(code).push(layer);
      world.addLayer(layer);
    }
  }
}

async function init() {
  const [geo, data, locations] = await Promise.all([
    fetch("/static/data/countries_geojson.json").then(response => response.json()),
    fetch("/api/countries").then(response => response.json()),
    fetch("/static/data/country_locations.json").then(response => response.json()),
  ]);
  for (const country of data.countries) {
    const location = locations.locations[country.cca3];
    if (location) countries.set(country.cca3, { ...country, location });
  }

  map = L.map("map", {
    zoomSnap: 0.25, zoomDelta: 0.75, minZoom: 0, maxZoom: 9,
    maxBounds: [[-85, -355], [85, 440]],
  }).setView([15, 10], 2);
  world = L.layerGroup().addTo(map);
  addWorld(geo);
  map.on("moveend", refreshDots);
  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(map.getContainer());
  resetView();
  refreshDots();
  mapElement("map-reset-view").disabled = false;
  mapElement("map-reset-view").onclick = () => {
    resetView();
    if (locked) showAnswer();
  };
  mapElement("see-btn").onclick = () => {
    if (!locked) finishQuestion("missed");
    else {
      map.setView(referencePoint(target), Math.max(2.75, Math.min(map.getZoom(), 4)), { animate: false });
      showAnswer();
    }
  };
  mapElement("next-btn").onclick = () => {
    if (entries.length < queue.length) nextQuestion();
    else showRoundResults(mapElement("map-round"), entries, startRound, startRound);
  };
  startRound(isReview ? dueCountries(loadStats(), "map").slice(0, roundLength) : undefined);
}

init().catch(error => {
  console.error(error);
  mapElement("hotcold").textContent = "The map could not load. Refresh the page to try again.";
});
