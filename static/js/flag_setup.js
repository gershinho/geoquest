
(function(){
  const btn = document.getElementById("start-flags");
  const sel = document.getElementById("difficulty");
  const tot = document.getElementById("total");
  const style = document.getElementById("flag-style");
  style.value = sessionStorage.getItem("geoquest_flag_mode") === "type" ? "type" : "mc";
  btn.addEventListener("click", () => {
    sessionStorage.setItem("geoquest_flag_difficulty", sel.value);
    sessionStorage.setItem("geoquest_flag_mode", style.value);
    sessionStorage.setItem("geoquest_flag_total", tot.value);
    window.location.href = "/flags/play";
  });
})();
