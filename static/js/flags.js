
let COUNTRIES = [];
let quizMode = sessionStorage.getItem('geoquest_flag_mode') || 'mc'; // 'mc' or 'type'
let _rawTotal = sessionStorage.getItem("geoquest_flag_total") || "10";
let state = {
  difficulty: sessionStorage.getItem("geoquest_flag_difficulty") || "easy",
  // support 'unlimited' value
  total: (_rawTotal === 'unlimited') ? Infinity : parseInt(_rawTotal || "10", 10),
  qIndex: 0,
  score: 0,
  streak: 0,
  locked: false,
  current: null,
  options: [],
};

const EASY_COMMON = new Set([
  "USA","CAN","MEX","BRA","ARG","CHL","COL","PER",
  "GBR","IRL","FRA","DEU","ESP","PRT","ITA","NLD","BEL","CHE","AUT","SWE","NOR","DNK","FIN","POL","UKR","GRC","TUR",
  "MAR","DZA","EGY","ZAF","NGA","KEN","ETH","GHA",
  "SAU","ARE","ISR","IRN","IRQ","JOR","QAT",
  "IND","PAK","BGD","LKA","NPL","CHN","JPN","KOR","IDN","PHL","VNM","THA","MYS","SGP",
  "AUS","NZL"
]);

function byDifficulty(list){
  if (state.difficulty === "easy") {
    const filtered = list.filter(c => EASY_COMMON.has(c.cca3));
    return filtered.length >= 30 ? filtered : list;
  }
  if (state.difficulty === "medium") {
    // medium = most countries, exclude tiny territories if missing flag
    return list.filter(c => c.flag && c.name && c.cca3);
  }
  // hard = all countries but bias target selection toward less-populous (more unique) countries
  return list.filter(c => c.flag && c.name && c.cca3);
}

function pickWeightedTarget(pool){
  if (state.difficulty !== 'hard') return pool[Math.floor(Math.random()*pool.length)];
  // If population data exists, bias selection toward lower-population countries (more unique)
  const withPop = pool.filter(p => typeof p.population === 'number' && p.population > 0);
  if (withPop.length >= 8){
    // compute weight = 1 / sqrt(population) to favor smaller countries
    const weights = withPop.map(p => 1 / Math.sqrt(p.population));
    const totalW = weights.reduce((a,b)=>a+b,0);
    let r = Math.random() * totalW;
    for (let i=0;i<withPop.length;i++){
      r -= weights[i];
      if (r <= 0) return withPop[i];
    }
    return withPop[withPop.length-1];
  }
  // fallback: pick random
  return pool[Math.floor(Math.random()*pool.length)];
}

function setHUD(){
  document.getElementById("hud-score").textContent = state.score;
  document.getElementById("hud-total").textContent = (state.total === Infinity) ? '∞' : state.total;
  document.getElementById("hud-streak").textContent = state.streak;
}

function setBestPill(){
  const s = loadStats();
  document.getElementById("best-pill").textContent = `🏆 Best: ${s.bestFlags || 0}`;
}

function pickQuestion(){
  const pool = byDifficulty(COUNTRIES);
  const target = pickWeightedTarget(pool);
  let distractPool = pool.filter(c => c.cca3 !== target.cca3);

  if (state.difficulty === "hard" && target.region) {
    const sameRegion = distractPool.filter(c => c.region === target.region);
    if (sameRegion.length >= 8) distractPool = sameRegion;
  }

  const distractors = shuffle(distractPool).slice(0, 3);
  const options = shuffle([target, ...distractors]);
  state.current = target;
  state.options = options;
  state.locked = false;

  // render
  const img = document.getElementById("flag-img");
  img.src = target.flag;
  img.onload = () => {};
  img.onerror = () => { img.alt = "Flag (failed to load)"; };

  const opts = document.getElementById("options");
  opts.innerHTML = "";
  const typeArea = document.getElementById('flag-type-area');
  const inputEl = document.getElementById('flag-input');
  if (quizMode === 'type'){
    // hide MC options, show input
    if (opts) opts.style.display = 'none';
    if (typeArea) { typeArea.style.display = 'block'; if (inputEl) { inputEl.value = ''; inputEl.disabled = false; inputEl.focus(); } }
  } else {
    if (opts) opts.style.display = '';
    if (typeArea) typeArea.style.display = 'none';
    options.forEach((c) => {
      const b = document.createElement("button");
      b.className = "option";
      b.innerHTML = `<span>${c.name}</span><span class="mark"></span>`;
      b.addEventListener("click", () => onPick(c, b));
      opts.appendChild(b);
    });
  }

  // hide panels
  const fbEl = document.getElementById("feedback"); if (fbEl) fbEl.hidden = true;
  const nextBtnEl = document.getElementById("next-btn"); if (nextBtnEl) nextBtnEl.disabled = true;
  // ensure typed input enabled for type mode
  try { const input = document.getElementById('flag-input'); if (input) input.disabled = false; } catch(e){}
}

function markAll(correctCca3, chosenCca3){
  const opts = document.querySelectorAll(".option");
  opts.forEach((el) => {
    const name = el.querySelector("span").textContent;
    const c = state.options.find(x => x.name === name);
    if (!c) return;
    const mark = el.querySelector(".mark");
    if (c.cca3 === correctCca3) {
      el.classList.add("correct");
      mark.innerHTML = "✓";
    }
    if (c.cca3 === chosenCca3 && chosenCca3 !== correctCca3) {
      el.classList.add("wrong");
      mark.innerHTML = "✕";
    }
    el.disabled = true;
  });
}

// learn-more UI removed — no-op placeholder kept for safety (not used)
function showLearnMore(country){}

function onPick(chosen, btnEl){
  if (state.locked) return;
  state.locked = true;

  const correct = chosen.cca3 === state.current.cca3;

  const fbEl = document.getElementById("feedback");
  const nextBtnEl = document.getElementById("next-btn");

  // update streak + stats
  const s = loadStats();
  bumpStreak(s);
  if (correct) {
    state.score += 1;
    state.streak += 1;
    s.flagsCorrect = (s.flagsCorrect || 0) + 1;
  } else {
    state.streak = 0;
  }
  s.flagsTotal = (s.flagsTotal || 0) + 1;
  if (state.score > (s.bestFlags || 0)) s.bestFlags = state.score;
  saveStats(s);

  setHUD();
  setBestPill();

  markAll(state.current.cca3, chosen.cca3);

  const fb = document.getElementById("feedback");
  if (fbEl){
    fbEl.hidden = false;
    fbEl.className = "feedback " + (correct ? "good" : "bad");
    fbEl.textContent = correct ? `Correct: ${state.current.name}` : `Incorrect: it's ${state.current.name}`;
  }
  if (nextBtnEl) nextBtnEl.disabled = false;
}

function normalizeFlagAnswer(s){
  return (s||'').trim().toLowerCase();
}

function handleTypedFlag(val){
  if (state.locked) return;
  state.locked = true;

  const s = loadStats();
  bumpStreak(s);

  const user = normalizeFlagAnswer(val);
  const correctName = normalizeFlagAnswer(state.current.name);
  const correct = user === correctName;

  if (correct) {
    state.score += 1;
    state.streak += 1;
    s.flagsCorrect = (s.flagsCorrect || 0) + 1;
  } else {
    state.streak = 0;
  }
  s.flagsTotal = (s.flagsTotal || 0) + 1;
  if (state.score > (s.bestFlags || 0)) s.bestFlags = state.score;
  saveStats(s);

  setHUD();
  setBestPill();

  // show feedback
  const fbEl = document.getElementById('feedback'); if (fbEl){
    fbEl.hidden = false;
    fbEl.className = 'feedback ' + (correct ? 'good' : 'bad');
    fbEl.textContent = correct ? `Correct: ${state.current.name}` : `Incorrect: ${state.current.name}`;
  }

  // disable input and enable next
  try { const input = document.getElementById('flag-input'); if (input) input.disabled = true; } catch(e){}
  try { const nextBtnEl = document.getElementById('next-btn'); if (nextBtnEl) nextBtnEl.disabled = false; } catch(e){}
}

function next(){
  state.qIndex += 1;
  if (state.qIndex >= state.total) {
    // simple end state: go home
    window.location.href = "/";
    return;
  }
  pickQuestion();
}

function resetRun(){
  state.qIndex = 0;
  state.score = 0;
  state.streak = 0;
  setHUD();
  pickQuestion();
}

async function init(){
  setBestPill();

  // load countries
  const resp = await fetch("/api/countries");
  const data = await resp.json();
  COUNTRIES = (data.countries || []).filter(c => c.flag && c.name);

  setHUD();
  pickQuestion();

  document.getElementById("next-btn").addEventListener("click", next);
  document.getElementById("hud-reset").addEventListener("click", resetRun);

  // add a small mode selector to the topbar for discoverability (MC vs Type)
  try {
    const topbar = document.querySelector('.topbar');
    if (topbar && !document.getElementById('flag-mode-top')){
      const sel = document.createElement('select');
      sel.id = 'flag-mode-top';
      sel.style.marginLeft = '12px';
      sel.style.padding = '6px';
      sel.style.fontWeight = '700';
      const optMc = document.createElement('option'); optMc.value='mc'; optMc.textContent='MC';
      const optType = document.createElement('option'); optType.value='type'; optType.textContent='Type';
      sel.appendChild(optMc); sel.appendChild(optType);
      sel.value = quizMode;
      sel.addEventListener('change', (e)=>{
        quizMode = e.target.value;
        sessionStorage.setItem('geoquest_flag_mode', quizMode);
        // refresh current question UI
        pickQuestion();
      });
      const hud = document.querySelector('.topbar-right');
      if (hud && hud.parentNode) hud.parentNode.insertBefore(sel, hud);
    }
  } catch(e){}

  // wire typed input submit if present
  try {
    const submit = document.getElementById('flag-submit');
    const input = document.getElementById('flag-input');
    if (submit && input){
      submit.addEventListener('click', ()=>{
        const v = (input.value || '').trim();
        if (!v) return;
        handleTypedFlag(v);
      });
      input.addEventListener('keydown',(ev)=>{ if (ev.key === 'Enter') { ev.preventDefault(); submit.click(); } });
    }
  } catch(e){}

  // accordion / learn-more removed — no-op if elements missing
  const toggle = document.getElementById("learn-toggle");
  if (toggle){
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("data-open") === "1";
      toggle.setAttribute("data-open", open ? "0" : "1");
      const panel = document.getElementById("learn-panel");
      if (panel) panel.hidden = open;
      const chev = toggle.querySelector(".acc-chev"); if (chev) chev.textContent = open ? "⌃" : "⌄";
    });
  }
}

init().catch(err => {
  console.error(err);
  const fb = document.getElementById("feedback");
  fb.hidden = false;
  fb.className = "feedback bad";
  fb.textContent = "Failed to load country data. Check your internet connection and refresh.";
});
