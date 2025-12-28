
(function(){
  const btn = document.getElementById("start-flags");
  const sel = document.getElementById("difficulty");
  const tot = document.getElementById("total");
  btn.addEventListener("click", () => {
    sessionStorage.setItem("geoquest_flag_difficulty", sel.value);
    // allow selecting total or unlimited
    sessionStorage.setItem("geoquest_flag_total", tot.value);
    window.location.href = "/flags/play";
  });
})();
