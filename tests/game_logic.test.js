const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

function gameContext(day) {
  const data = new Map();
  const ctx = vm.createContext({
    localStorage: {
      getItem: key => data.get(key),
      setItem: (key, value) => data.set(key, value),
    },
    sessionStorage: { getItem: () => null },
    location: { search: "" },
    URLSearchParams,
    fetch: () => new Promise(() => {}),
  });
  vm.runInContext(readFileSync("static/js/common.js", "utf8"), ctx);
  ctx.todayISO = () => day.value;
  return ctx;
}

test("legacy scores stay intact and typed recall is independent of location recall", () => {
  const day = { value: "2026-11-26" };
  const ctx = gameContext(day);
  ctx.localStorage.setItem("geoquest_stats", JSON.stringify({ flagsCorrect: 14, flagsTotal: 20 }));
  const stats = ctx.loadStats();
  const country = { cca3: "BRA" };
  assert.equal(ctx.accuracyPct(stats), 70);

  ctx.recordRecall(stats, "flags", country, "recognized");
  assert.deepEqual(Array.from(ctx.dueCountries(stats, "flags")), ["BRA"]);
  ctx.recordRecall(stats, "flags", country, "recalled");
  ctx.recordRecall(stats, "flags", country, "recalled");
  assert.equal(stats.recall.flags.BRA.days, 1);
  assert.equal(stats.recall.flags.BRA.due, "2026-11-27");
  assert.equal(stats.recall.map.BRA, undefined);

  day.value = "2026-11-27";
  ctx.recordRecall(stats, "flags", country, "recalled");
  ctx.recordRecall(stats, "map", country, "assisted");
  assert.equal(stats.recall.flags.BRA.days, 2);
  assert.equal(stats.recall.flags.BRA.due, "2026-11-30");
  assert.equal(stats.recall.map.BRA.days, 0);
});

test("map bearings follow the short route across the date line", () => {
  const ctx = gameContext({ value: "2026-11-26" });
  vm.runInContext(readFileSync("static/js/map.js", "utf8"), ctx);
  const from = { lat: 0, lng: 179 };
  const to = { lat: 0, lng: -179 };
  const east = ctx.directionFrom(from, to);
  assert.equal(east.direction, "east");
  assert.equal(Math.round(east.distance), 222);
  assert.equal(ctx.directionFrom(to, from).direction, "west");
});

test("map reference points cover small islands and match legacy outline codes", () => {
  const ctx = gameContext({ value: "2026-11-26" });
  const { locations } = JSON.parse(readFileSync("static/data/country_locations.json"));
  const { features } = JSON.parse(readFileSync("static/data/countries_geojson.json"));
  const codes = features.map(ctx.countryFeatureCode);
  for (const code of ["MLT", "VAT", "TUV", "KIR", "VUT"]) {
    const [lat, lng, region] = locations[code];
    assert.ok(Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && region);
  }
  for (const code of ["FRA", "NOR", "UNK"]) assert.ok(codes.includes(code));
});
