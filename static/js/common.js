
/**
 * Local progress (no accounts required).
 * Stored keys:
 *  geoquest_stats = { flagsCorrect, flagsTotal, mapCorrect, mapTotal, bestFlags, bestMap, lastPlayDate }
 */
const STATS_KEY = "geoquest_stats";

function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return {flagsCorrect:0, flagsTotal:0, mapCorrect:0, mapTotal:0, bestFlags:0, bestMap:0, lastPlayDate:null, streak:0};
    const s = JSON.parse(raw);
    return Object.assign({flagsCorrect:0, flagsTotal:0, mapCorrect:0, mapTotal:0, bestFlags:0, bestMap:0, lastPlayDate:null, streak:0}, s);
  } catch {
    return {flagsCorrect:0, flagsTotal:0, mapCorrect:0, mapTotal:0, bestFlags:0, bestMap:0, lastPlayDate:null, streak:0};
  }
}

function saveStats(s) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

function bumpStreak(s) {
  const t = todayISO();
  if (!s.lastPlayDate) {
    s.lastPlayDate = t;
    s.streak = 1;
    return;
  }
  if (s.lastPlayDate === t) return;

  if (datePlusDays(s.lastPlayDate, 1) === t) s.streak = (s.streak || 0) + 1;
  else s.streak = 1;

  s.lastPlayDate = t;
}

function accuracyPct(s) {
  const total = (s.flagsTotal || 0) + (s.mapTotal || 0);
  const correct = (s.flagsCorrect || 0) + (s.mapCorrect || 0);
  if (total <= 0) return null;
  return Math.round((correct/total) * 100);
}

// tiny helper
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const RECALL_INTERVALS = [1, 3, 7, 14, 30];

function recordRecall(stats, skill, country, outcome) {
  const history = (stats.recall ||= { flags: {}, map: {} })[skill];
  const entry = history[country.cca3] ||= { days: 0 };
  const today = todayISO();
  if (outcome === "recognized") {
    entry.due ||= today;
    return;
  }
  if (outcome === "recalled") {
    if (entry.lastRecall === today) return;
    entry.days = Math.min(entry.days + 1, RECALL_INTERVALS.length);
    entry.lastRecall = today;
  } else {
    entry.days = 0;
  }
  entry.due = datePlusDays(today, RECALL_INTERVALS[Math.max(0, entry.days - 1)]);
}

function datePlusDays(iso, days) {
  const date = new Date(iso + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dueCountries(stats, skill) {
  const today = todayISO();
  return Object.entries(stats.recall?.[skill] || {})
    .filter(([, entry]) => entry.due <= today)
    .sort(([, a], [, b]) => a.due.localeCompare(b.due) || a.days - b.days)
    .map(([code]) => code);
}

function showRoundResults(play, entries, restart, retry) {
  const results = document.getElementById("round-results");
  const firstTry = entries.filter(entry => entry.outcome === "correct").length;
  const assisted = entries.filter(entry => entry.outcome === "assisted").length;
  const missed = entries.filter(entry => entry.outcome === "missed").length;
  const review = [...new Map(entries.filter(entry => entry.outcome !== "correct")
    .map(entry => [entry.id, entry])).values()];

  document.getElementById("results-score").textContent = entries.length
    ? `${firstTry + assisted} of ${entries.length} correct`
    : "No completed questions this round";
  const metrics = document.getElementById("results-metrics");
  metrics.replaceChildren();
  for (const [count, label] of [[firstTry, "First try"], [assisted, "With help"], [missed, "Missed"]]) {
    const tile = document.createElement("div");
    const value = document.createElement("strong");
    value.textContent = count;
    tile.append(value, label);
    metrics.append(tile);
  }

  const list = document.getElementById("results-review");
  list.replaceChildren();
  for (const entry of review) {
    const item = document.createElement("li");
    item.textContent = `${entry.label} · ${entry.outcome === "assisted" ? "With help" : "Missed"}`;
    list.append(item);
  }
  list.hidden = document.getElementById("results-review-title").hidden = review.length === 0;
  const retryButton = document.getElementById("results-retry");
  retryButton.hidden = review.length === 0;
  retryButton.textContent = assisted ? "Retry practice questions" : "Retry missed questions";

  const resume = (start) => {
    results.hidden = true;
    play.hidden = false;
    start();
  };
  retryButton.onclick = () => resume(() => retry(review.map(entry => entry.id)));
  document.getElementById("results-restart").onclick = () => resume(restart);
  play.hidden = true;
  results.hidden = false;
  document.getElementById("results-title").focus();
}

function countryFeatureCode(feature) {
  const { iso_a3: code, name } = feature.properties;
  if (code !== "-99") return code;
  return { France: "FRA", Norway: "NOR", Kosovo: "UNK" }[name];
}
