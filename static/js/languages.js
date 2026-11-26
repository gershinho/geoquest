const langElement = id => document.getElementById(id);
let countries = [];
let geography;
let languageIndex = [];
let officialFacts = [];
let selectedLanguage = "";
let view = "language";
let quizOpen = false;
let quizQueue, quizEntries, question;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.json();
}

function languageNames(raw) {
  const values = raw.languages || [];
  return Object.values(values).filter(value => typeof value === "string" && value.trim()).map(value => value.trim());
}

function drawAtlas(canvas, places, focus) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const [latitude, longitude] = focus?.location || [12.5, 0];
  const span = focus ? 76 : 360;
  const centerLat = focus ? Math.max(-58, Math.min(58, latitude)) : latitude;
  const project = (lon, lat) => [width / 2 + (lon - longitude) * width / span, height / 2 - (lat - centerLat) * width / span];
  const matchCodes = new Set(places.map(place => place.cca3));
  ctx.fillStyle = "#d4e2d9";
  ctx.fillRect(0, 0, width, height);
  for (const feature of geography.features) {
    const selected = matchCodes.has(countryFeatureCode(feature));
    const { type, coordinates } = feature.geometry;
    const polygons = type === "Polygon" ? [coordinates] : coordinates;
    ctx.fillStyle = selected ? "#28795e" : "#b8c7b1";
    ctx.strokeStyle = "#fff5dd";
    ctx.lineWidth = 0.8;
    for (const rings of polygons) {
      const firstLongitude = rings[0][0][0];
      const offset = focus ? 360 * Math.round((longitude - firstLongitude) / 360) : 0;
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach(([lon, lat], index) => {
          const [x, y] = project(lon + offset, lat);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fill("evenodd");
      ctx.stroke();
    }
  }
  for (const place of places) {
    if (!place.location) continue;
    const [lat, rawLon] = place.location;
    const lon = rawLon + 360 * Math.round((longitude - rawLon) / 360);
    const [x, y] = project(lon, lat);
    ctx.beginPath();
    ctx.arc(x, y, focus ? 7 : 3.3, 0, 2 * Math.PI);
    ctx.fillStyle = "#365849";
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = focus ? 2.4 : 1;
    ctx.stroke();
    if (focus) {
      ctx.font = "bold 24px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.strokeText(place.name, x, y - 15);
      ctx.fillText(place.name, x, y - 15);
    }
  }
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", focus
    ? `Map showing ${focus.name} in ${focus.location[2]}`
    : "World map with matching places highlighted");
}

function findLanguage(language) {
  selectedLanguage = language;
  langElement("place-search").value = "";
  langElement("region-select").value = "";
  switchView("place");
  langElement("place-search").focus();
}

function renderLanguages() {
  const term = langElement("language-search").value.trim().toLowerCase();
  const matching = languageIndex.filter(([language]) => language.toLowerCase().includes(term));
  const list = langElement("language-list");
  list.replaceChildren();
  for (const [language, places] of matching.slice(0, term ? matching.length : 18)) {
    const card = node("button", "lang-card atlas-language-card");
    card.type = "button";
    card.append(node("strong", "", language), node("span", "muted", `${places.length} ${places.length === 1 ? "place" : "places"} →`));
    card.onclick = () => findLanguage(language);
    list.append(card);
  }
  if (!matching.length) list.append(node("p", "muted", "No languages matched your search."));
  langElement("language-list-title").textContent = term ? `${matching.length} matching languages` : "Languages listed in the most places";
}

function createPlaceCard(place) {
  const card = node("article", "card country-card");
  const head = node("div", "country-head");
  if (place.flag) {
    const flag = node("img", "flag-mini");
    flag.alt = "";
    flag.src = place.flag;
    flag.loading = "lazy";
    flag.onerror = () => flag.remove();
    head.append(flag);
  }
  const location = node("div");
  location.append(
    node("h3", "country-title", place.name),
    node("p", "country-region", place.location?.[2] || place.region)
  );
  head.append(location);
  const languages = node("div", "pills-row");
  for (const language of place.languages) {
    const pill = node("button", "pill2 p-gray", language);
    pill.type = "button";
    pill.onclick = () => findLanguage(language);
    languages.append(pill);
  }
  if (!place.languages.length) languages.append(node("span", "muted", "No languages listed"));
  card.append(head, languages);
  const fact = officialFacts.find(item => item.code === place.cca3);
  if (fact) {
    const detail = node("details", "language-fact");
    const link = node("a", "text-link", "Read the source");
    link.href = fact.source;
    detail.append(node("summary", "", "Language status"), node("p", "", fact.explanation), link);
    card.append(detail);
  }
  return card;
}

function renderPlaces() {
  const term = langElement("place-search").value.trim().toLowerCase();
  const region = langElement("region-select").value;
  const matching = countries.filter(place =>
    (!region || place.region === region) && (!selectedLanguage || place.languages.includes(selectedLanguage)) &&
    (!term || place.name.toLowerCase().includes(term) || place.languages.some(language => language.toLowerCase().includes(term)))
  );
  const grid = langElement("countries-grid");
  grid.replaceChildren();
  langElement("language-selection").hidden = !selectedLanguage;
  langElement("selected-language").textContent = selectedLanguage;
  langElement("place-count").textContent = `${matching.length} ${matching.length === 1 ? "place" : "places"}`;
  const canvas = langElement("language-map");
  canvas.hidden = !geography || matching.length === 0 || (!term && !region && !selectedLanguage);
  if (!canvas.hidden) drawAtlas(canvas, matching);
  const regions = [...new Set(matching.map(place => place.region))].sort();
  for (const label of regions) {
    const section = node("section", "language-region");
    const cards = node("div", "cards-grid");
    for (const place of matching.filter(place => place.region === label)) cards.append(createPlaceCard(place));
    section.append(node("h2", "", label), cards);
    grid.append(section);
  }
}

function switchView(nextView) {
  view = nextView;
  const showLanguage = view === "language";
  langElement("view-by-language").hidden = !showLanguage;
  langElement("view-by-place").hidden = showLanguage;
  langElement("by-language").setAttribute("aria-pressed", showLanguage);
  langElement("by-place").setAttribute("aria-pressed", !showLanguage);
  if (showLanguage) renderLanguages();
  else renderPlaces();
}

function updateQuizScore() {
  langElement("quiz-progress").textContent = `Question ${Math.min(quizEntries.length + 1, quizQueue.length)} of ${quizQueue.length}`;
  langElement("quiz-score").textContent = quizEntries.filter(entry => entry.outcome === "correct").length;
}

function buildQuestions() {
  const facts = officialFacts.flatMap(fact => {
    const place = countries.find(country => country.cca3 === fact.code && country.location);
    if (!place) return [];
    const language = { ...fact, place, id: `${fact.code}-language`, label: `${place.name} · Language status` };
    const zone = place.location[2];
    const distractors = shuffle([...new Set(countries.map(country => country.location?.[2])
      .filter(region => region && region !== zone))]).slice(0, 3);
    const region = {
      ...fact, place, id: `${fact.code}-location`, label: `${place.name} · Map location`,
      prompt: `In which part of the world is ${place.name}?`, answers: [zone, ...distractors],
    };
    return [language, region];
  });
  return facts;
}

let questions;

function showQuestion() {
  question = quizQueue[quizEntries.length];
  langElement("quiz-answer").hidden = true;
  langElement("quiz-next").hidden = true;
  langElement("finish-language").disabled = !quizEntries.length;
  const title = langElement("quiz-question");
  title.textContent = question.prompt;
  const options = langElement("quiz-options");
  options.replaceChildren();
  for (const answer of shuffle(question.answers)) {
    const button = node("button", "option", answer);
    button.type = "button";
    button.onclick = () => chooseAnswer(button, answer);
    options.append(button);
  }
  updateQuizScore();
  title.focus();
}

function chooseAnswer(chosen, answer) {
  const correctAnswer = question.answers[0];
  const correct = answer === correctAnswer;
  quizEntries.push({ id: question.id, label: question.label, outcome: correct ? "correct" : "missed" });
  for (const button of langElement("quiz-options").children) {
    button.disabled = true;
    if (button.textContent === correctAnswer) {
      button.classList.add("correct");
      button.textContent += " ✓";
    } else if (button === chosen) {
      button.classList.add("wrong");
      button.textContent += " ✕";
    }
  }
  const country = question.place;
  langElement("quiz-feedback").textContent = `${correct ? "Correct." : `Answer · ${correctAnswer}.`} ${country.name} is in ${country.location[2]}. ${question.explanation}`;
  langElement("quiz-source").href = question.source;
  langElement("quiz-map").hidden = !geography;
  if (geography) drawAtlas(langElement("quiz-map"), [country], country);
  langElement("quiz-answer").hidden = false;
  const next = langElement("quiz-next");
  next.textContent = quizEntries.length === quizQueue.length ? "See results" : "Next question";
  next.hidden = false;
  langElement("finish-language").disabled = false;
  langElement("quiz-score").textContent = quizEntries.filter(entry => entry.outcome === "correct").length;
  next.focus();
}

function startQuiz(ids) {
  quizQueue = ids ? ids.map(id => questions.find(item => item.id === id)) : shuffle(questions).slice(0, 10);
  quizEntries = [];
  showQuestion();
}

function setQuiz(open) {
  quizOpen = open;
  langElement("lang-app").hidden = open;
  langElement("language-round").hidden = !open;
  langElement("round-results").hidden = true;
  langElement("quiz-toggle").textContent = open ? "Back to explorer" : "Start language quiz";
  if (open) startQuiz();
}

function finishQuiz() {
  showRoundResults(langElement("language-round"), quizEntries, startQuiz, startQuiz);
}

async function init() {
  const atlasData = getJSON("/api/languages_remote").catch(() => getJSON("/api/countries"));
  const [data, locations, geo, facts, overrides] = await Promise.all([
    atlasData, getJSON("/static/data/country_locations.json"),
    getJSON("/static/data/countries_geojson.json").catch(() => null),
    getJSON("/static/data/language_facts.json").catch(() => []),
    getJSON("/static/data/language_overrides.json").catch(() => ({})),
  ]);
  geography = geo;
  officialFacts = facts;
  countries = data.countries.map(raw => ({
    ...raw,
    name: typeof raw.name === "string" ? raw.name : raw.name.common,
    region: raw.region || "Region unavailable",
    location: locations.locations[raw.cca3],
    languages: [...new Set([...languageNames(raw), ...(overrides[raw.name]?.addLanguages || [])])].sort(),
  })).sort((a, b) => a.name.localeCompare(b.name));

  const index = new Map();
  for (const place of countries) {
    for (const language of place.languages) {
      if (!index.has(language)) index.set(language, []);
      index.get(language).push(place);
    }
  }
  languageIndex = [...index].sort(([a, aPlaces], [b, bPlaces]) => bPlaces.length - aPlaces.length || a.localeCompare(b));
  questions = buildQuestions();

  const select = langElement("region-select");
  select.add(new Option("All regions", ""));
  for (const region of [...new Set(countries.map(place => place.region))].sort()) select.add(new Option(region, region));
  langElement("by-language").onclick = () => switchView("language");
  langElement("by-place").onclick = () => switchView("place");
  langElement("language-search").oninput = renderLanguages;
  langElement("place-search").oninput = renderPlaces;
  select.onchange = renderPlaces;
  langElement("clear-language").onclick = () => {
    selectedLanguage = "";
    renderPlaces();
    langElement("place-search").focus();
  };
  langElement("quiz-toggle").disabled = questions.length === 0;
  langElement("quiz-toggle").onclick = () => setQuiz(!quizOpen);
  langElement("finish-language").onclick = finishQuiz;
  langElement("quiz-next").onclick = () => quizEntries.length === quizQueue.length ? finishQuiz() : showQuestion();
  langElement("language-loading").hidden = true;
  switchView(view);
}

init().catch(error => {
  console.error(error);
  langElement("language-loading").textContent = "Language data could not load. Refresh the page to try again.";
});
