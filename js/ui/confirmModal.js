import { getLang } from "../i18n.js";

let activeRequest = null;

/** `notice: true` = information only: one button, resolves true when dismissed. */
export function confirmAction(message, { title, acceptLabel, cancelLabel, notice = false } = {}) {
  // Defaults follow the current language so callers that only pass a message
  // (or only title/accept) still get a fully translated dialog.
  const en = getLang() === "en";
  title ??= en ? "Please confirm" : "请确认";
  acceptLabel ??= en ? "Confirm" : "确定";
  cancelLabel ??= en ? "Cancel" : "取消";
  const dialog = document.querySelector("#app-confirm-dialog");
  const titleEl = document.querySelector("#app-confirm-title");
  const messageEl = document.querySelector("#app-confirm-message");
  const accept = document.querySelector("#app-confirm-accept");
  const cancel = document.querySelector("#app-confirm-cancel");
  if (!dialog || !titleEl || !messageEl || !accept || !cancel) {
    if (notice) {
      window.alert(message);
      return Promise.resolve(true);
    }
    return Promise.resolve(window.confirm(message));
  }

  if (activeRequest) activeRequest.resolve(false);
  titleEl.textContent = title;
  messageEl.textContent = message;
  accept.textContent = acceptLabel;
  cancel.textContent = cancelLabel;
  cancel.hidden = notice;
  accept.focus();

  return new Promise((resolve) => {
    activeRequest = { resolve };
    const finish = (value) => {
      if (!activeRequest) return;
      activeRequest = null;
      dialog.close();
      resolve(value);
      dialog.removeEventListener("cancel", onCancel);
    };
    const onCancel = () => finish(notice);
    accept.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    dialog.addEventListener("cancel", onCancel, { once: true });
    dialog.showModal();
  });
}
