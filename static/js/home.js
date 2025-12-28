
(function(){
  const s = loadStats();
  const flagsMastered = s.flagsCorrect || 0;
  const located = s.mapCorrect || 0;
  const streak = s.streak || 0;
  const acc = accuracyPct(s);

  const $ = (id)=>document.getElementById(id);
  if ($("stat-flags")) $("stat-flags").textContent = flagsMastered;
  if ($("stat-located")) $("stat-located").textContent = located;
  if ($("stat-streak")) $("stat-streak").textContent = streak;
  if ($("stat-acc")) $("stat-acc").textContent = acc + "%";
})();
