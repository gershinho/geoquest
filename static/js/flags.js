const EASY_COMMON = new Set([
  "USA","CAN","MEX","BRA","ARG","CHL","COL","PER",
  "GBR","IRL","FRA","DEU","ESP","PRT","ITA","NLD","BEL","CHE","AUT","SWE","NOR","DNK","FIN","POL","UKR","GRC","TUR",
  "MAR","DZA","EGY","ZAF","NGA","KEN","ETH","GHA",
  "SAU","ARE","ISR","IRN","IRQ","JOR","QAT",
  "IND","PAK","BGD","LKA","NPL","CHN","JPN","KOR","IDN","PHL","VNM","THA","MYS","SGP",
  "AUS","NZL"
]);

const commonNames = {
  CIV: ["Ivory Coast"], CZE: ["Czech Republic"], DOM: ["Dominican Rep"],
  GBR: ["UK", "Great Britain", "Britain"], KOR: ["Republic of Korea"],
  PRK: ["DPRK"], TLS: ["East Timor"], TUR: ["Turkey"],
  USA: ["US", "USA", "United States of America"], ARE: ["UAE"], SWZ: ["Swaziland"],
  CPV: ["Cabo Verde", "Cape Verde"], MMR: ["Burma"], VNM: ["Viet Nam"],
};
const flagElement = id => document.getElementById(id);
const isReview = new URLSearchParams(location.search).has("review");
const difficulty = sessionStorage.getItem("geoquest_flag_difficulty") || "easy";
const configuredTotal = sessionStorage.getItem("geoquest_flag_total");
const roundLength = configuredTotal === "unlimited" ? Infinity : Number(configuredTotal) || 10;
const typed = isReview || sessionStorage.getItem("geoquest_flag_mode") === "type";

let countries, pool, queue, entries, target, locked, unlimited;

function normalizeAnswer(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function setupPool() {
  const easy = countries.filter(country => EASY_COMMON.has(country.cca3));
  return difficulty === "easy" && easy.length >= 4 ? easy : countries;
}

function updateHUD() {
  const number = entries.length + (locked ? 0 : 1);
  flagElement("flag-progress").textContent = unlimited ? `Question ${number}` : `Question ${number} of ${queue.length}`;
  flagElement("hud-score").textContent = entries.filter(entry => entry.outcome === "correct").length;
}

function renderChoices() {
  flagElement("flag-type-area").hidden = !typed;
  const options = flagElement("options");
  options.hidden = typed;
  options.replaceChildren();
  if (typed) {
    flagElement("flag-input").value = "";
    flagElement("flag-input").disabled = false;
    return;
  }
  const distractors = pool.filter(country => country.cca3 !== target.cca3);
  const similar = distractors.filter(country => country.region === target.region);
  const use = difficulty === "hard" && similar.length >= 3 ? similar : distractors;
  for (const country of shuffle([target, ...shuffle(use).slice(0, 3)])) {
    const button = document.createElement("button");
    button.className = "option";
    button.type = "button";
    button.textContent = country.name;
    button.dataset.code = country.cca3;
    button.onclick = () => answer(country === target, country.cca3);
    options.append(button);
  }
}

function nextQuestion() {
  if (unlimited && entries.length === queue.length) {
    const previous = queue.at(-1);
    const deck = shuffle(pool);
    if (deck.length > 1 && deck[0] === previous) [deck[0], deck[1]] = [deck[1], deck[0]];
    queue.push(...deck);
  }
  target = queue[entries.length];
  locked = false;
  flagElement("flag-img").src = target.flag;
  flagElement("feedback").hidden = true;
  flagElement("next-btn").hidden = true;
  flagElement("flag-reveal").hidden = false;
  flagElement("finish-flags").disabled = entries.length === 0;
  renderChoices();
  updateHUD();
}

function startRound(codes) {
  const picked = codes?.map(code => countries.find(country => country.cca3 === code)).filter(Boolean);
  unlimited = !picked?.length && roundLength === Infinity;
  queue = picked?.length ? picked : shuffle(pool).slice(0, roundLength);
  if (!picked?.length && !unlimited) {
    while (queue.length < roundLength) queue.push(...shuffle(pool).slice(0, roundLength - queue.length));
  }
  entries = [];
  nextQuestion();
}

function answer(correct, chosen) {
  if (locked || !target) return;
  locked = true;
  entries.push({ id: target.cca3, label: target.name, outcome: correct ? "correct" : "missed" });

  const stats = loadStats();
  stats.flagsTotal += 1;
  if (correct) stats.flagsCorrect += 1;
  stats.bestFlags = Math.max(stats.bestFlags, entries.filter(entry => entry.outcome === "correct").length);
  recordRecall(stats, "flags", target, correct ? (typed ? "recalled" : "recognized") : "missed");
  bumpStreak(stats);
  saveStats(stats);

  for (const button of flagElement("options").children) {
    button.disabled = true;
    if (button.dataset.code === target.cca3) {
      button.classList.add("correct");
      button.textContent += " ✓";
    } else if (button.dataset.code === chosen) {
      button.classList.add("wrong");
      button.textContent += " ✕";
    }
  }
  const feedback = flagElement("feedback");
  feedback.className = `feedback ${correct ? "good" : "bad"}`;
  feedback.textContent = correct ? `Correct. This is ${target.name}.` : `This is ${target.name}.`;
  feedback.hidden = false;
  flagElement("flag-input").disabled = true;
  flagElement("flag-reveal").hidden = true;
  flagElement("finish-flags").disabled = false;
  const next = flagElement("next-btn");
  next.textContent = !unlimited && entries.length === queue.length ? "See results" : "Next flag";
  next.hidden = false;
  next.focus();
  updateHUD();
}

function finishRound() {
  showRoundResults(flagElement("flag-round"), entries, startRound, startRound);
}

async function init() {
  const response = await fetch("/api/countries");
  const data = await response.json();
  countries = data.countries.filter(country => country.flag && country.name && country.cca3);
  if (!countries.length) throw new Error("No flags available");
  pool = setupPool();
  flagElement("flag-type-area").onsubmit = event => {
    event.preventDefault();
    const value = normalizeAnswer(flagElement("flag-input").value);
    if (!value) return;
    const names = [target.name, ...(commonNames[target.cca3] || [])];
    answer(names.some(name => normalizeAnswer(name) === value));
  };
  flagElement("flag-reveal").onclick = () => answer(false);
  flagElement("finish-flags").onclick = finishRound;
  flagElement("next-btn").onclick = () => {
    if (!unlimited && entries.length === queue.length) finishRound();
    else {
      nextQuestion();
      if (typed) flagElement("flag-input").focus();
      else flagElement("options").querySelector("button")?.focus();
    }
  };
  startRound(isReview ? dueCountries(loadStats(), "flags").slice(0, 10) : undefined);
}

init().catch(error => {
  console.error(error);
  const feedback = flagElement("feedback");
  feedback.textContent = "The flags could not load. Refresh the page to try again.";
  feedback.hidden = false;
});
