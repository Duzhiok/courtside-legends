let activeRequest = null;

export function confirmAction(message, { title = "请确认", acceptLabel = "确定", cancelLabel = "取消" } = {}) {
  const dialog = document.querySelector("#app-confirm-dialog");
  const titleEl = document.querySelector("#app-confirm-title");
  const messageEl = document.querySelector("#app-confirm-message");
  const accept = document.querySelector("#app-confirm-accept");
  const cancel = document.querySelector("#app-confirm-cancel");
  if (!dialog || !titleEl || !messageEl || !accept || !cancel) {
    return Promise.resolve(window.confirm(message));
  }

  if (activeRequest) activeRequest.resolve(false);
  titleEl.textContent = title;
  messageEl.textContent = message;
  accept.textContent = acceptLabel;
  cancel.textContent = cancelLabel;
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
    const onCancel = () => finish(false);
    accept.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    dialog.addEventListener("cancel", onCancel, { once: true });
    dialog.showModal();
  });
}
