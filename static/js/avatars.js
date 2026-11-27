const avatarKey = "geoquest_avatar";
const avatarStage = document.querySelector("#hero-avatar .avatar-stage");
const avatarPicker = document.getElementById("avatar-picker");
const avatarButtons = [...avatarPicker.querySelectorAll(".avatar-option")];
const changeAvatar = document.getElementById("change-avatar");

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

function selectAvatar(button) {
  avatarStage.dataset.avatar = button.dataset.avatar;
  for (const option of avatarButtons) option.setAttribute("aria-pressed", option === button);
  changeAvatar.setAttribute("aria-label", `Change avatar. Current avatar is ${button.querySelector("[data-avatar-name]").textContent}`);
}

selectAvatar(avatarButtons.find(button => button.dataset.avatar === loadAvatarPreference(avatarKey)) || avatarButtons[0]);
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
