
/**
 * Local progress (no accounts required).
 * Stored keys:
 *  geoquest_stats = { flagsCorrect, flagsTotal, mapCorrect, mapTotal, bestFlags, bestMap, lastPlayDate }
 */
const STATS_KEY = "geoquest_stats";

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0,10);
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

  const prev = new Date(s.lastPlayDate + "T00:00:00");
  const cur = new Date(t + "T00:00:00");
  const diffDays = Math.round((cur - prev) / (1000*60*60*24));

  if (diffDays === 1) s.streak = (s.streak || 0) + 1;
  else s.streak = 1;

  s.lastPlayDate = t;
}

function accuracyPct(s) {
  const total = (s.flagsTotal || 0) + (s.mapTotal || 0);
  const correct = (s.flagsCorrect || 0) + (s.mapCorrect || 0);
  if (total <= 0) return 100;
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
