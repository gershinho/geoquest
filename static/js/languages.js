let COUNTRIES = [];
let VIEW = "by-language"; // explore | by-language
let quizOn = false;

let region = "All Regions";

let LANGUAGE_OVERRIDES = {};

// Quiz settings
let quizSettings = {
  questionTypes: ['flag-to-lang', 'lang-to-country', 'country-count', 'region-lang'],
  currentType: null
};

const explicitPills = {
  "English": "p-blue",
  "French": "p-purple",
  "Arabic": "p-green",
  "Spanish": "p-orange",
  "Portuguese": "p-green",
  "German": "p-gray",
  "Chinese": "p-red",
  "Russian": "p-blue",
  "Italian": "p-gray",
};

const colorClasses = ["p-blue","p-purple","p-green","p-orange","p-gray","p-red"];

function hash(str){
  let h = 0;
  for (let i=0;i<str.length;i++) h = ((h<<5)-h) + str.charCodeAt(i), h |= 0;
  return h;
}
function pillClassFor(lang){
  if (explicitPills[lang]) return explicitPills[lang];
  const idx = Math.abs(hash(lang)) % colorClasses.length;
  return colorClasses[idx];
}

function el(tag, attrs={}, children=[]){
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of children){
    if (c == null) continue;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return n;
}

function uniq(arr){
  return [...new Set(arr)];
}

function allRegions(){
  const rs = uniq(COUNTRIES.map(c => c.region).filter(Boolean)).sort();
  return ["All Regions", ...rs];
}

function normalizeCountry(raw){
  const name = raw.name?.common || raw.name || "Unknown";
  const region = raw.region || "—";
  const flag = raw.flags?.png || raw.flag || "";
  const langs = raw.languages ? Object.values(raw.languages) : (raw.languages || []);
  return { name, region, flag, languages: langs.filter(Boolean) };
}

async function loadCountries(){
  // For the Language Explorer, try to load richer data from the RapidAPI-backed
  // proxy endpoint `/api/languages_remote` (server must set RAPIDAPI_URL and RAPIDAPI_KEY).
  // Fall back to the default `/api/countries` if the remote proxy is unavailable.
  const [resp, overridesResp] = await Promise.all([
    fetch('/api/languages_remote').catch(()=>fetch('/api/countries')),
    fetch("/static/data/language_overrides.json").catch(()=>({ ok:false }))
  ]);
  const data = await resp.json();
  let overrides = {};
  try {
    if (overridesResp && overridesResp.ok) overrides = await overridesResp.json();
  } catch(e){ overrides = {}; }
  LANGUAGE_OVERRIDES = overrides || {};

  COUNTRIES = (data.countries || []).map(normalizeCountry);

  // apply overrides: merge addLanguages and primaryLanguage when provided
  for (const c of COUNTRIES){
    const o = LANGUAGE_OVERRIDES[c.name];
    if (!o) continue;
    // add missing languages
    if (o.addLanguages && Array.isArray(o.addLanguages)){
      for (const l of o.addLanguages){
        if (!c.languages.includes(l)) c.languages.push(l);
      }
      c.languages = uniq(c.languages);
    }
    // set explicit primaryLanguage if provided
    if (o.primaryLanguage) c.primaryLanguage = o.primaryLanguage;
  }
}

function toggleMenu(show){
  const menu = document.getElementById("region-menu");
  const btn = document.getElementById("region-btn");
  if (show){
    menu.hidden = false;
    btn.setAttribute("aria-expanded","true");
  } else {
    menu.hidden = true;
    btn.setAttribute("aria-expanded","false");
  }
}

function renderRegionMenu(){
  const menu = document.getElementById("region-menu");
  menu.innerHTML = "";
  allRegions().forEach(r => {
    const item = el("div", { class: "select-item" + (r===region ? " active" : ""), role:"option" }, [
      el("span", {}, [r]),
      r===region ? el("span", { class:"muted" }, ["✓"]) : null
    ]);
    item.addEventListener("click", () => {
      region = r;
      document.getElementById("region-label").textContent = r;
      renderRegionMenu();
      render();
      toggleMenu(false);
    });
    menu.appendChild(item);
  });
}

function passesFilters(c){
  const q = (document.getElementById("lang-search").value || "").trim().toLowerCase();
  const regionOk = (region === "All Regions") || (c.region === region);
  if (!regionOk) return false;
  if (!q) return true;
  const inName = c.name.toLowerCase().includes(q);
  const inLang = (c.languages || []).some(l => l.toLowerCase().includes(q));
  return inName || inLang;
}

/* ---------- Explore (countries) ---------- */
function renderExplore(){
  const grid = document.getElementById("countries-grid");
  grid.innerHTML = "";

  const list = COUNTRIES.filter(passesFilters)
    .sort((a,b)=>a.name.localeCompare(b.name));

  for (const c of list){
    const pills = (c.languages || []).slice(0,4).map(l =>
      el("span",{class:`pill2 ${pillClassFor(l)}`},[l])
    );

    grid.appendChild(
      el("div",{class:"card country-card"},[
        el("div",{class:"country-head"},[
          el("img",{class:"flag-mini", src:c.flag, alt:`${c.name} flag`}),
          el("div",{},[
            el("div",{class:"country-title"},[c.name]),
            el("div",{class:"country-region"},[c.region || "—"]),
          ]),
        ]),
        el("div",{class:"pills-row"}, pills.length ? pills : [el("span",{class:"pill2 p-gray"},["—"])]),
      ])
    );
  }
}

/* ---------- By Language ---------- */
function computeLanguages(){
  const map = new Map(); // lang -> {count, countries[]}
  for (const c of COUNTRIES){
    for (const l of (c.languages || [])){
      if (!map.has(l)) map.set(l, { count:0, countries:[] });
      map.get(l).count += 1;
      map.get(l).countries.push(c);
    }
  }
  const entries = [...map.entries()].map(([lang, obj]) => ({
    lang,
    count: obj.count,
    countries: obj.countries,
    cls: pillClassFor(lang),
  }));
  entries.sort((a,b)=> b.count - a.count || a.lang.localeCompare(b.lang));
  return entries;
}

function renderByLanguage(){
  const langs = computeLanguages();

  document.getElementById("all-langs-title").textContent = `All Languages (${langs.length})`;

  // Most spoken
  const topWrap = document.getElementById("top-languages");
  topWrap.innerHTML = "";
  const top = langs.slice(0, 9);
  for (const item of top){
    const flags = item.countries.slice(0, 6).map(c =>
      el("img",{src:c.flag, alt:c.name})
    );
    const rest = Math.max(0, item.countries.length - 6);

    const card = el("div",{class:"lang-card"},[
      el("span",{class:`pill2 ${item.cls}`},[item.lang]),
      el("span",{class:"chev", html:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>`}),
      el("div",{class:"lang-metric"},[String(item.count)]),
      el("div",{class:"lang-sub"},["countries"]),
      el("div",{class:"flag-row"},[
        ...flags,
        rest>0 ? el("div",{class:"flag-more"},[`+${rest}`]) : null
      ])
    ]);
    // mimic highlight on click — jump to the countries view filtered by this language
    card.addEventListener("click", ()=>{
      document.querySelectorAll(".lang-card").forEach(n=>n.classList.remove("active"));
      card.classList.add("active");
      // set search to this language
      document.getElementById("lang-search").value = item.lang;
      // ensure quiz is exited so the lang-app is visible
      if (quizOn) setQuiz(false);
      // switch to the countries (Explore) view and render filtered results
      switchView("explore");
      render();
      window.scrollTo({top:0, behavior:"smooth"});
    });

    topWrap.appendChild(card);
  }

  // All languages pills
  const allWrap = document.getElementById("all-languages");
  allWrap.innerHTML = "";
  for (const item of langs){
    const pill = el("div", { class: `langpill ${item.cls}` }, [`${item.lang} (${item.count})`]);
    // apply colors by adding pill2 classes via CSS vars
    // we mimic screenshot by tinting background based on class
    pill.classList.remove("pill2");
    pill.style.background = "";
    pill.style.borderColor = "";
    pill.style.color = "";
    // We reuse pill2 palette by swapping class names
    pill.classList.add("pill2");
    pill.addEventListener("click", ()=>{
      // ensure quiz is exited (so the lang-app is visible), set the search
      // then switch to the countries (explore) view and render the filtered list
      document.getElementById("lang-search").value = item.lang;
      if (quizOn) setQuiz(false);
      switchView("explore");
      render();
      window.scrollTo({top:0, behavior:"smooth"});
    });
    allWrap.appendChild(pill);
  }
}

/* ---------- Quiz ---------- */
let quiz = { correct:0, total:0, answer:null, options:[], locked:false };
let _quizEl = null; // reference to dynamically created quiz element

function createQuizElement(){
  if (_quizEl) return _quizEl;
  const page = document.querySelector('.page') || document.body;
  const wrapper = document.createElement('div');
  wrapper.id = 'quiz';
  wrapper.className = 'quiz-screen';
  wrapper.hidden = true;
  wrapper.innerHTML = `
    <div class="quiz-head">
      <h1>Language Quiz</h1>
      <div class="score-pill" id="score-pill">
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 21h8"></path>
            <path d="M12 17v4"></path>
            <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z"></path>
            <path d="M5 6H4a2 2 0 0 0 0 4h2"></path>
            <path d="M19 6h1a2 2 0 0 1 0 4h-2"></path>
          </svg>
        </span>
        <span id="score-text">0 / 0</span>
      </div>
    </div>

    <div class="quiz-card">
      <div class="quiz-flag" id="quiz-visual"><img id="quiz-flag" alt="flag" /></div>
      <div class="quiz-q" id="quiz-q">What language is spoken in …?</div>
      <div class="quiz-options" id="quiz-options"></div>
      <button class="btn btn-primary btn-wide" id="quiz-next" hidden>
        Next Question
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14"></path>
            <path d="M13 5l7 7-7 7"></path>
          </svg>
        </span>
      </button>
    </div>
  `;
  // append after lang-app if possible
  const langApp = document.getElementById('lang-app');
  if (langApp && langApp.parentNode) langApp.parentNode.appendChild(wrapper);
  else page.appendChild(wrapper);
  // wire quiz-next here
  const nextBtn = document.getElementById('quiz-next');
  if (nextBtn) nextBtn.addEventListener('click', ()=> buildQuizQuestion());
  _quizEl = wrapper;
  return _quizEl;
}

function destroyQuizElement(){
  if (!_quizEl) return;
  try { _quizEl.remove(); } catch(e){}
  _quizEl = null;
}

function pickRandomCountryWithLanguage(){
  const eligible = COUNTRIES.filter(c => (c.languages||[]).length);
  return eligible[Math.floor(Math.random()*eligible.length)];
}

function getRandomQuestionType(){
  const types = quizSettings.questionTypes;
  return types[Math.floor(Math.random() * types.length)];
}

/* ---------- Quiz Question Types ---------- */

// Type 1: Flag to Primary Language
function buildFlagToLangQuestion(){
  const c = pickRandomCountryWithLanguage();
  const correctLang = c.primaryLanguage || c.languages[0];
  const langs = computeLanguages().map(x=>x.lang).filter(l=>l!==correctLang);
  
  const opts = [correctLang];
  while (opts.length < 4 && langs.length){
    const pick = langs.splice(Math.floor(Math.random()*langs.length),1)[0];
    if (!opts.includes(pick)) opts.push(pick);
  }
  
  // shuffle
  for (let i=opts.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [opts[i],opts[j]]=[opts[j],opts[i]];
  }
  
  quiz.answer = correctLang;
  quiz.options = opts.map(o => ({ text: o, value: o }));
  
  document.getElementById("quiz-visual").innerHTML = `<img id="quiz-flag" src="${c.flag}" alt="flag" />`;
  document.getElementById("quiz-q").textContent = `What is the primary language spoken in ${c.name}?`;
}

// Type 2: Language to Countries
function buildLangToCountryQuestion(){
  const langs = computeLanguages().filter(l => l.count >= 2);
  if (langs.length === 0) return buildFlagToLangQuestion(); // fallback
  
  const langItem = langs[Math.floor(Math.random() * langs.length)];
  const correctCountries = langItem.countries.map(c => c.name);
  const correctAnswer = correctCountries[Math.floor(Math.random() * correctCountries.length)];
  
  // Get wrong options from countries that don't speak this language
  const wrongCountries = COUNTRIES
    .filter(c => !correctCountries.includes(c.name))
    .map(c => c.name);
  
  const opts = [correctAnswer];
  while (opts.length < 4 && wrongCountries.length){
    const pick = wrongCountries.splice(Math.floor(Math.random()*wrongCountries.length),1)[0];
    if (!opts.includes(pick)) opts.push(pick);
  }
  
  // shuffle
  for (let i=opts.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [opts[i],opts[j]]=[opts[j],opts[i]];
  }
  
  quiz.answer = correctAnswer;
  quiz.options = opts.map(o => ({ text: o, value: o }));
  
  // Don't show the language name as a large label — keep the visual area empty for this question type
  document.getElementById("quiz-visual").innerHTML = ``;
  document.getElementById("quiz-q").textContent = `Which country speaks ${langItem.lang}?`;
}

// Type 3: How many countries speak this language?
function buildCountryCountQuestion(){
  const langs = computeLanguages().filter(l => l.count >= 2 && l.count <= 30);
  if (langs.length === 0) return buildFlagToLangQuestion(); // fallback
  
  const langItem = langs[Math.floor(Math.random() * langs.length)];
  const correctCount = langItem.count;
  
  // Generate plausible wrong answers
  const wrongCounts = new Set();
  wrongCounts.add(correctCount + 1);
  wrongCounts.add(correctCount - 1);
  wrongCounts.add(Math.floor(correctCount * 1.5));
  wrongCounts.add(Math.floor(correctCount * 0.5));
  wrongCounts.delete(correctCount);
  
  const opts = [correctCount, ...Array.from(wrongCounts)].filter(n => n > 0).slice(0, 4);
  
  // shuffle
  for (let i=opts.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [opts[i],opts[j]]=[opts[j],opts[i]];
  }
  
  quiz.answer = correctCount;
  quiz.options = opts.map(o => ({ text: o.toString(), value: o }));
  
  // Visual area not used for count questions
  document.getElementById("quiz-visual").innerHTML = ``;
  document.getElementById("quiz-q").textContent = `How many countries have ${langItem.lang} as an official language?`;
}

// Type 4: Region-Language matching
function buildRegionLangQuestion(){
  const regions = allRegions().filter(r => r !== "All Regions");
  if (regions.length === 0) return buildFlagToLangQuestion(); // fallback
  
  const region = regions[Math.floor(Math.random() * regions.length)];
  const regionCountries = COUNTRIES.filter(c => c.region === region);
  
  // Get all languages from this region
  const regionLangs = new Set();
  regionCountries.forEach(c => {
    (c.languages || []).forEach(l => regionLangs.add(l));
  });
  
  if (regionLangs.size === 0) return buildFlagToLangQuestion(); // fallback
  
  const correctLang = Array.from(regionLangs)[Math.floor(Math.random() * regionLangs.size)];
  
  // Get languages from other regions
  const otherLangs = computeLanguages()
    .map(l => l.lang)
    .filter(l => !regionLangs.has(l));
  
  const opts = [correctLang];
  while (opts.length < 4 && otherLangs.length){
    const pick = otherLangs.splice(Math.floor(Math.random()*otherLangs.length),1)[0];
    if (!opts.includes(pick)) opts.push(pick);
  }
  
  // shuffle
  for (let i=opts.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [opts[i],opts[j]]=[opts[j],opts[i]];
  }
  
  quiz.answer = correctLang;
  quiz.options = opts.map(o => ({ text: o, value: o }));
  
  // Visual area not used for region-language questions
  document.getElementById("quiz-visual").innerHTML = ``;
  document.getElementById("quiz-q").textContent = `Which language is commonly spoken in ${region}?`;
}

function buildQuizQuestion(){
  const questionType = getRandomQuestionType();
  quizSettings.currentType = questionType;
  
  switch(questionType){
    case 'flag-to-lang':
      buildFlagToLangQuestion();
      break;
    case 'lang-to-country':
      buildLangToCountryQuestion();
      break;
    case 'country-count':
      buildCountryCountQuestion();
      break;
    case 'region-lang':
      buildRegionLangQuestion();
      break;
    default:
      buildFlagToLangQuestion();
  }
  
  quiz.locked = false;
  document.getElementById("quiz-next").hidden = true;

  const wrap = document.getElementById("quiz-options");
  wrap.innerHTML = "";
  for (const opt of quiz.options){
    const btn = el("button", { class:"qopt", type:"button" }, [
      el("span",{},[opt.text]),
      el("span",{class:"qicon", html:""})
    ]);
    btn.addEventListener("click", ()=> chooseOption(btn, opt.value));
    wrap.appendChild(btn);
  }
  updateScore();
}

function svgCheck(){
  return `<svg class="qicon good" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>`;
}
function svgX(){
  return `<svg class="qicon bad" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>`;
}

function chooseOption(btn, chosen){
  if (quiz.locked) return;
  quiz.locked = true;
  quiz.total += 1;

  const correct = chosen === quiz.answer || chosen.toString() === quiz.answer.toString();
  if (correct) quiz.correct += 1;

  const wrap = document.getElementById("quiz-options");
  const buttons = [...wrap.querySelectorAll("button.qopt")];
  for (const b of buttons){
    const text = b.querySelector("span").textContent;
    b.disabled = true;
    const icon = b.querySelector(".qicon");
    if (text === quiz.answer.toString()){
      b.classList.add("good");
      icon.innerHTML = svgCheck();
    } else if (text === chosen.toString() && !correct){
      b.classList.add("bad");
      icon.innerHTML = svgX();
    } else {
      b.disabled = true;
    }
  }

  document.getElementById("quiz-next").hidden = false;
  updateScore();
}

function updateScore(){
  document.getElementById("score-text").textContent = `${quiz.correct} / ${quiz.total}`;
}

/* ---------- View state ---------- */
function switchView(v){
  VIEW = v;
  const tabBy = document.getElementById("tab-by-language");
  if (tabBy) tabBy.classList.toggle("active", v==="by-language");
  document.getElementById("view-explore").hidden = (v!=="explore");
  document.getElementById("view-by-language").hidden = (v!=="by-language");
  render();
}

function setQuiz(on){
  quizOn = on;
  document.getElementById("lang-app").hidden = on;
  if (on){
    createQuizElement();
    document.getElementById("quiz").hidden = false;
  } else {
    // hide and remove element to keep DOM clean
    const q = document.getElementById('quiz');
    if (q) q.hidden = true;
    destroyQuizElement();
  }

  const toggle = document.getElementById("quiz-toggle");
  const tabQuiz = document.getElementById("tab-quiz");
  if (on){
    toggle.classList.add("active-purple");
    toggle.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18"></path><path d="M6 6l12 12"></path>
        </svg>
      </span>
      Exit Quiz
    `;
    buildQuizQuestion();
    if (tabQuiz) tabQuiz.classList.add("active");
  } else {
    toggle.classList.remove("active-purple");
    toggle.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19a2 2 0 0 0 2 2h12"></path>
          <path d="M6 2h12a2 2 0 0 1 2 2v16"></path>
          <path d="M6 2a2 2 0 0 0-2 2v16"></path>
          <path d="M8 6h8"></path>
          <path d="M8 10h8"></path>
          <path d="M8 14h5"></path>
        </svg>
      </span>
      Quiz Mode
    `;
    if (tabQuiz) tabQuiz.classList.remove("active");
  }
}

function render(){
  // region menu maybe hidden when switching
  if (!quizOn){
    if (VIEW === "explore") renderExplore();
    else renderByLanguage();
  }
}

async function init(){
  await loadCountries();

  // tabs (if present) — prefer topbar Quiz toggle for entering quiz mode
  const tabQuizEl = document.getElementById("tab-quiz");
  if (tabQuizEl) tabQuizEl.addEventListener("click", ()=> setQuiz(!quizOn));
  const tabByEl = document.getElementById("tab-by-language");
  if (tabByEl) tabByEl.addEventListener("click", ()=>switchView("by-language"));

  // search
  document.getElementById("lang-search").addEventListener("input", ()=>render());

  // region dropdown
  renderRegionMenu();
  document.getElementById("region-btn").addEventListener("click", (e)=>{
    e.preventDefault();
    const menu = document.getElementById("region-menu");
    toggleMenu(menu.hidden);
  });
  document.addEventListener("click", (e)=>{
    const wrap = document.querySelector(".select-wrap");
    if (!wrap.contains(e.target)) toggleMenu(false);
  });

  // quiz
  document.getElementById("quiz-toggle").addEventListener("click", ()=> setQuiz(!quizOn));

  // default view
  switchView("by-language");
  render();
}

document.addEventListener("DOMContentLoaded", init);