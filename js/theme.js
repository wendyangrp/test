// Light/dark theme toggle. Light is the default; the choice is remembered
// in localStorage. The saved theme is applied early by a small inline
// script in each page's <head>, so this file only wires up the button.
(function () {
  var STORAGE_KEY = "theme";
  var root = document.documentElement;

  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function updateButton(button) {
    var dark = currentTheme() === "dark";
    // The moon/sun icons are swapped by CSS; only the label changes here.
    button.querySelector(".theme-label").textContent = dark ? "Light theme" : "Dark theme";
    button.setAttribute("aria-pressed", String(dark));
  }

  function setTheme(theme) {
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // Storage can be blocked (e.g. private mode); the toggle still works.
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.getElementById("theme-toggle");
    if (!button) return;
    updateButton(button);
    button.addEventListener("click", function () {
      setTheme(currentTheme() === "dark" ? "light" : "dark");
      updateButton(button);
    });
  });
})();
