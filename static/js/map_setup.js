
(function(){
  const btn = document.getElementById("start-map");
  const sel = document.getElementById("region");
  const attemptsSel = document.getElementById("attempts");
  btn.addEventListener("click", () => {
    sessionStorage.setItem("geoquest_map_region", sel.value);
    sessionStorage.setItem("geoquest_map_total", "10");
    sessionStorage.setItem("geoquest_map_attempts", attemptsSel ? attemptsSel.value : "3");
    window.location.href = "/map/play";
  });
})();
