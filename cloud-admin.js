(() => {
  "use strict";
  if (window.top !== window.self) {
    document.documentElement.textContent = "";
    return;
  }
  window.location.replace("/ai-admin.html?view=cloud");
})();