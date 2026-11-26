/**
 * Cloud save panel (DB3). Functional markup only: the UI Agent owns the visual styling (classes are `cloud-*`).
 * `cloudPanelHtml` is pure (state in, string out); `mountCloudPanel` wires it to the cloud service and is a no-op
 * when the cloud is off, so with the feature flag unset nothing on the page changes.
 */
import { esc } from "../core/html.js";
import { getCloudService } from "../cloud/index.js";

const MODE = { reborn: ["重生生涯", "Reborn career"], league: ["联盟生涯", "League career"], none: ["存档", "Save"] };

function summaryCard(title, s, t, locale) {
  if (!s) return `<div class="cloud-save"><b>${esc(title)}</b><p>${t("没有存档", "No save")}</p></div>`;
  const mode = MODE[s.mode] || MODE.none;
  const rows = [
    [t("类型", "Type"), t(...mode)],
    s.year != null && [t("生涯年份", "Season"), s.year],
    s.games != null && [t("已打场次", "Games played"), s.games],
    s.trust != null && [t("教练信任", "Coach trust"), s.trust],
    s.savedAt != null && s.savedAt > 0 && [t("保存于", "Saved"), new Date(s.savedAt).toLocaleString(locale)],
    s.revision != null && [t("云端版本", "Cloud revision"), s.revision],
  ].filter(Boolean);
  return `<div class="cloud-save"><b>${esc(title)}</b><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join("")}</dl></div>`;
}

export function cloudPanelHtml({ status, view = null, busy = false, lang = "zh", message = "" }) {
  const t = (zh, en) => (lang === "en" ? en : zh);
  const locale = lang === "en" ? "en-US" : "zh-CN";
  const dis = busy ? " disabled" : "";
  const last = status.last?.status;
  const head = `<h3>${t("云存档", "Cloud save")}</h3>`;
  if (!status.signedIn) {
    return `${head}<p>${t("登录后可以在不同设备上继续你的生涯。不登录也能正常游玩，进度保存在本机。", "Sign in to continue your career on other devices. You can play without it; progress stays on this device.")}</p>
<form data-cloud-form><input name="email" type="email" autocomplete="email" placeholder="email" required><input name="password" type="password" autocomplete="current-password" placeholder="${t("密码", "password")}" minlength="8" required>
<button class="btn" type="submit" data-cloud-action="sign-in"${dis}>${t("登录", "Sign in")}</button><button class="btn" type="button" data-cloud-action="sign-up"${dis}>${t("注册", "Sign up")}</button></form><p data-cloud-message>${esc(message)}</p>`;
  }
  const who = `<p>${t("已登录：", "Signed in: ")}${esc(status.email || "")} <button class="btn" type="button" data-cloud-action="sign-out"${dis}>${t("退出登录", "Sign out")}</button></p>`;
  if (status.blocked === "guest") return `${head}${who}<p>${t("游客存档只保存在本机。创建本机账号后才能使用云存档。", "Guest progress stays on this device. Create a local account to use cloud saves.")}</p>`;
  if (status.blocked === "linked-to-other-user") return `${head}${who}<p>${t("这个本机账号已经绑定了另一个云账号，不能在此同步。", "This local account is linked to a different cloud account and cannot sync here.")}</p>`;
  if (status.blocked === "not-linked") {
    return `${head}${who}<p>${t("把这个本机账号绑定到云账号后，它的生涯存档才会上传。绑定不会改变你的本机账号和存档。", "Link this local account to your cloud account to upload its career. Linking changes nothing on this device.")}</p><button class="btn" type="button" data-cloud-action="link"${dis}>${t("确认绑定", "Confirm link")}</button><p data-cloud-message>${esc(message)}</p>`;
  }
  const when = status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString(locale) : t("还没有同步过", "never");
  let body = `<p>${t("上次成功同步：", "Last successful sync: ")}${esc(when)}</p><button class="btn" type="button" data-cloud-action="sync"${dis}>${t("立即同步", "Sync now")}</button>`;
  if (last === "offline") body += `<p>${t("现在连不上云端。进度保存在本机，联网后会再试。", "Can't reach the cloud. Your progress is safe on this device; it will retry when you're online.")}</p>`;
  if (last === "auth-required") body += `<p>${t("登录已过期，请重新登录。", "Your sign-in expired. Please sign in again.")}</p>`;
  if (last === "conflict" || last === "cloud-newer") {
    body += `<h4>${last === "conflict" ? t("发现两个不同的生涯存档", "Two different career saves found") : t("云端有更新的存档", "The cloud has a newer save")}</h4>
<div class="cloud-compare">${summaryCard(t("本机存档", "This device"), view?.local, t, locale)}${summaryCard(t("云端存档", "Cloud"), view?.cloud, t, locale)}</div>
<p>${t("被替换的存档会先备份。", "The save that gets replaced is backed up first.")}</p>
<button class="btn" type="button" data-cloud-action="restore"${dis}>${t("使用云端进度", "Use the cloud save")}</button>${last === "conflict" ? `<button class="btn" type="button" data-cloud-action="keep-local"${dis}>${t("保留本机进度", "Keep this device's save")}</button>` : ""}`;
  }
  if (last === "restored") body += `<p>${t("已恢复云端进度，原存档已备份。刷新后生效。", "Cloud save restored; the old one was backed up. Reload to continue.")}</p>`;
  if (last === "uploaded" || last === "up-to-date") body += `<p>${t("已同步。", "In sync.")}</p>`;
  return `${head}${who}${body}<p data-cloud-message>${esc(message)}</p>`;
}

export function mountCloudPanel(host, lang = "zh", service = getCloudService()) {
  if (!service || !host) return null;
  const el = document.createElement("section");
  el.dataset.cloudPanel = "";
  host.appendChild(el);
  let view = null;
  let busy = false;
  let message = "";
  const paint = () => {
    el.innerHTML = cloudPanelHtml({ status: service.status(), view, busy, lang, message });
  };
  const run = async (fn) => {
    busy = true;
    message = "";
    paint();
    try {
      await fn();
    } finally {
      busy = false;
      const st = service.status().last?.status;
      view = st === "conflict" || st === "cloud-newer" ? await service.describeConflict() : null;
      paint();
    }
  };
  el.addEventListener("click", (ev) => {
    const action = ev.target.closest("[data-cloud-action]")?.dataset.cloudAction;
    if (!action || busy) return;
    const form = el.querySelector("[data-cloud-form]");
    const creds = form ? { email: form.email.value.trim(), password: form.password.value } : null;
    if (action === "sign-in" || action === "sign-up") {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      run(async () => {
        const r = await service[action === "sign-in" ? "signIn" : "signUp"](creds);
        message = r.error || (r.needsConfirmation ? (lang === "en" ? "Check your e-mail to confirm, then sign in." : "请先到邮箱确认，再登录。") : "");
      });
    } else if (action === "sign-out") run(() => service.signOut());
    else if (action === "link") run(async () => { message = service.linkAccount({ confirmed: true }).ok ? "" : (lang === "en" ? "Could not link." : "无法绑定。"); });
    else if (action === "sync") run(() => service.sync());
    else if (action === "restore") run(() => service.restore());
    else if (action === "keep-local") run(() => service.keepLocal());
  });
  el.addEventListener("submit", (ev) => ev.preventDefault());
  paint();
  return el;
}
