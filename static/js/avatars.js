const avatarKey = "geoquest_avatar";
const motionKey = "geoquest_avatar_motion";
const heroAvatar = document.getElementById("hero-avatar");
const sprite = document.getElementById("selected-avatar");
const avatarPicker = document.getElementById("avatar-picker");
const avatarButtons = [...avatarPicker.querySelectorAll(".avatar-option")];
const changeAvatar = document.getElementById("change-avatar");
const motionButton = document.getElementById("avatar-motion");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

function loadAvatarPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveAvatarPreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The controls also work during this page visit when browser storage is disabled.
  }
}

let motionEnabled = loadAvatarPreference(motionKey) !== "paused";

function updateMotion() {
  const playing = motionEnabled && !motionPreference.matches;
  heroAvatar.dataset.motion = playing ? "playing" : "paused";
  const label = playing ? "Pause avatar animation" : "Play avatar animation";
  motionButton.setAttribute("aria-label", label);
  motionButton.title = label;
}

function selectAvatar(button) {
  sprite.parentElement.dataset.avatar = button.dataset.avatar;
  for (const option of avatarButtons) option.setAttribute("aria-pressed", option === button);
  changeAvatar.setAttribute("aria-label", `Change avatar. Current avatar is ${button.querySelector("[data-avatar-name]").textContent}`);
}

selectAvatar(avatarButtons.find(button => button.dataset.avatar === loadAvatarPreference(avatarKey)) || avatarButtons[0]);
updateMotion();
motionPreference.addEventListener("change", updateMotion);
motionButton.addEventListener("click", () => {
  motionEnabled = !motionEnabled;
  saveAvatarPreference(motionKey, motionEnabled ? "playing" : "paused");
  updateMotion();
});
changeAvatar.addEventListener("click", () => {
  avatarPicker.showModal();
  avatarPicker.querySelector('[aria-pressed="true"]').focus();
});
for (const button of avatarButtons) {
  button.addEventListener("click", () => {
    selectAvatar(button);
    saveAvatarPreference(avatarKey, button.dataset.avatar);
    avatarPicker.close();
  });
}
