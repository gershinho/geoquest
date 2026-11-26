const stats = loadStats();
for (const [skill, id] of [["flags", "stat-flags"], ["map", "stat-located"]]) {
  const history = Object.values(stats.recall?.[skill] || {});
  document.getElementById(id).textContent = history.filter(entry => entry.days >= 2).length;
  const due = dueCountries(stats, skill).length;
  const review = document.getElementById(`review-${skill}`);
  review.textContent = skill === "flags" ? `Review flags (${due})` : `Review locations (${due})`;
  review.hidden = due === 0;
}
const yesterday = datePlusDays(todayISO(), -1);
document.getElementById("stat-streak").textContent = stats.lastPlayDate >= yesterday ? stats.streak : 0;
const accuracy = accuracyPct(stats);
document.getElementById("stat-acc").textContent = accuracy === null ? "—" : `${accuracy}%`;
