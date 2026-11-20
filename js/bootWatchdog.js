/**
 * Boot watchdog (S-P2-5 step 1: moved out of index.html so the page has no inline
 * <script> left). Classic script, loaded before the app.js module: catches module
 * failures / frozen boots and offers a force-reload. No imports, no exports.
 */
(function () {
  var status = document.getElementById("load-status");
  var bar = document.getElementById("load-bar");
  var tip = document.getElementById("load-watchdog");
  var started = Date.now();
  window.__rosterBootOk = false;
  window.addEventListener("error", function (e) {
    if (window.__rosterBootOk) return;
    if (status) status.textContent = "脚本错误：" + (e.message || "unknown");
    if (tip) {
      tip.hidden = false;
      tip.innerHTML = "请强制刷新（Cmd+Shift+R）。若仍失败，打开控制台查看报错。";
    }
  });
  window.addEventListener("unhandledrejection", function (e) {
    if (window.__rosterBootOk) return;
    var msg = (e.reason && (e.reason.message || e.reason)) || "promise rejected";
    if (status) status.textContent = "加载失败：" + msg;
  });
  setTimeout(function () {
    if (window.__rosterBootOk) return;
    if (tip) {
      tip.hidden = false;
      tip.innerHTML =
        "已等待 " +
        Math.round((Date.now() - started) / 1000) +
        " 秒仍未进入主界面。" +
        '<br/><button type="button" class="btn small" id="btn-force-reload">强制刷新并清缓存标记</button>';
      var btn = document.getElementById("btn-force-reload");
      if (btn)
        btn.onclick = function () {
          try {
            localStorage.removeItem("courtside-roster-cache-key");
          } catch {}
          location.reload(true);
        };
    }
    if (status && /启动脚本|1950|本地缓存/.test(status.textContent || "")) {
      status.textContent = "加载仍在进行或已卡住——可点下方强制刷新";
    }
    if (bar && parseFloat(bar.style.width) < 10) bar.style.width = "12%";
  }, 15000);
})();
