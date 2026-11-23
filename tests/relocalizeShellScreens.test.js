// 2026-11-13 全局 review §5 测试补齐建议：relocalizeShellScreens 与
// mountScreen opener 焦点恢复一直没有直接测试（只有 screenShellBatch*
// 测挂在壳上的视图、staticScreenActivation 测 focus/scroll 两个 helper）。
// 本文件用同一套 fake-DOM 模式（无 jsdom，见 tests/staticScreenActivation.test.js）
// 直接驱动这两个入口：语言切换时逐屏重渲染 + 关闭后焦点回到 opener。
import test from "node:test";
import assert from "node:assert/strict";
import { mountScreen, relocalizeShellScreens } from "../js/ui/screenShell.js";

globalThis.CSS = { escape: (s) => String(s) };

// Fake MutationObserver: classList 变化同步通知 observer（真实的走微任务；
// shell 只读 class list，同步即可）。
const observers = new Map();
function notifyObservers(el) {
  for (const cb of observers.get(el) || []) cb();
}
globalThis.MutationObserver = class {
  constructor(cb) {
    this.cb = cb;
  }
  observe(el) {
    if (!observers.has(el)) observers.set(el, []);
    observers.get(el).push(this.cb);
  }
  disconnect() {
    for (const list of observers.values()) {
      const i = list.indexOf(this.cb);
      if (i >= 0) list.splice(i, 1);
    }
  }
};

function matchesSelector(node, selector) {
  if (!selector) return false;
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
  return node.tagName?.toLowerCase() === selector.toLowerCase();
}

function makeClassList(el) {
  const set = new Set();
  return {
    add: (c) => {
      if (!set.has(c)) {
        set.add(c);
        notifyObservers(el);
      }
    },
    remove: (c) => {
      if (set.delete(c)) notifyObservers(el);
    },
    contains: (c) => set.has(c),
  };
}

function makeEl(tag = "div") {
  const listeners = new Map();
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    id: "",
    className: "",
    textContent: "",
    _html: "",
    parent: null,
    isConnected: false,
    focusCalls: [],
    scrollCalls: [],
    focus(options) {
      el.focusCalls.push(options || {});
      if (globalThis.document) globalThis.document.activeElement = el;
    },
    scrollTo(x, y) {
      el.scrollCalls.push([x, y]);
    },
    setAttribute(k, v) {
      el[k] = v;
    },
    getAttribute(k) {
      return el[k] ?? null;
    },
    addEventListener(type, fn, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      options?.signal?.addEventListener?.("abort", () => {
        const list = listeners.get(type) || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      });
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    appendChild(child) {
      el.children.push(child);
      child.parent = el;
      child.isConnected = true;
      return child;
    },
    remove() {
      if (el.parent) {
        const i = el.parent.children.indexOf(el);
        if (i >= 0) el.parent.children.splice(i, 1);
        el.parent = null;
      }
      el.isConnected = false;
    },
    contains(node) {
      let at = node;
      while (at) {
        if (at === el) return true;
        at = at.parent;
      }
      return false;
    },
    querySelector(sel) {
      return el.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const child of node.children || []) {
          if (matchesSelector(child, sel)) out.push(child);
          walk(child);
        }
      };
      walk(el);
      return out;
    },
  };
  el.classList = makeClassList(el);
  Object.defineProperty(el, "innerHTML", {
    get: () => el._html,
    set: (v) => {
      el._html = v;
      // 把 shell 的 head/body 物化出来，mountScreen 的 querySelector 才能找到真元素；
      // modal 只有 body 没有 head，也要物化。
      if (v.includes("screen-shell-body")) {
        el.children = parseShellHtml(v);
        for (const c of el.children) c.parent = el;
      }
    },
    configurable: true,
  });
  return el;
}

/** 物化 shell head：panel-head > button > span + h2，再加 body div；modal 只有 body。 */
function parseShellHtml(html) {
  const out = [];
  if (html.includes("panel-head")) {
    const head = makeEl("div");
    head.classList.add("panel-head");
    const btn = makeEl("button");
    btn.id = html.match(/<button[^>]*id="([^"]+)"/)?.[1] || "";
    btn.classList.add("nav-back");
    const span = makeEl("span");
    btn.appendChild(span);
    head.appendChild(btn);
    const h2 = makeEl("h2");
    h2.id = html.match(/<h2[^>]*id="([^"]+)"/)?.[1] || "";
    h2.textContent = html.match(/<h2[^>]*>([^<]*)<\/h2>/)?.[1] || "";
    head.appendChild(h2);
    out.push(head);
  }
  const body = makeEl("div");
  body.id = html.match(/<div[^>]*class="screen-shell-body"[^>]*id="([^"]+)"/)?.[1]
    || html.match(/<div[^>]*id="([^"]+)"[^>]*class="screen-shell-body"/)?.[1] || "";
  body.classList.add("screen-shell-body");
  out.push(body);
  return out;
}

function makeDoc() {
  const app = makeEl("div");
  app.id = "app";
  const body = makeEl("body");
  const view = makeEl("div");
  view.scrollCalls = [];
  view.scrollTo = (x, y) => view.scrollCalls.push([x, y]);
  view.rafCalls = 0;
  view.requestAnimationFrame = () => {
    view.rafCalls += 1;
    return 0;
  };
  const doc = {
    body,
    activeElement: null,
    defaultView: view,
    createElement: (tag) => makeEl(tag),
    addEventListener() {},
    querySelector: (sel) => {
      if (sel === "#app") return app;
      if (sel.startsWith("#")) {
        const walk = (node) => {
          if (node.id === sel.slice(1)) return node;
          for (const child of node.children || []) {
            const hit = walk(child);
            if (hit) return hit;
          }
          return null;
        };
        return walk(app) || walk(body);
      }
      return null;
    },
    getElementById: (id) => {
      const walk = (node) => {
        if (node.id === id) return node;
        for (const child of node.children || []) {
          const hit = walk(child);
          if (hit) return hit;
        }
        return null;
      };
      return walk(app) || walk(body);
    },
  };
  return { doc, app, body, view };
}

function installDoc() {
  const made = makeDoc();
  globalThis.document = made.doc;
  return made;
}

test("relocalizeShellScreens: zh->en 重渲染每屏标题与返回文案，并回调 onRelocalize", () => {
  const { app } = installDoc();
  let lang = "zh";
  const seen = [];
  const a = mountScreen({
    id: "reloc-a", title: { zh: "甲屏", en: "Screen A" }, host: "app",
    getLang: () => lang, onRelocalize: (l) => seen.push(["a", l]),
  });
  const b = mountScreen({
    id: "reloc-b", title: { zh: "乙屏", en: "Screen B" }, host: "app",
    getLang: () => lang, onRelocalize: (l) => seen.push(["b", l]),
  });
  assert.equal(a.el.querySelector("#reloc-a-title").textContent, "甲屏");
  assert.equal(b.el.querySelector("#reloc-b-title").textContent, "乙屏");

  lang = "en";
  relocalizeShellScreens({ a: a.el, b: b.el });
  assert.equal(a.el.querySelector("#reloc-a-title").textContent, "Screen A");
  assert.equal(b.el.querySelector("#reloc-b-title").textContent, "Screen B");
  for (const shell of [a, b]) {
    const back = shell.el.querySelector(`#btn-${shell.el.id.slice("screen-".length)}-back`);
    assert.equal(back.querySelector("span").textContent, "Back");
    assert.equal(back.getAttribute("aria-label"), "Back");
  }
  assert.deepEqual(seen, [["a", "en"], ["b", "en"]]);
  assert.equal(app.children.filter((c) => c.id.startsWith("screen-reloc-")).length, 2);
  a.destroy();
  b.destroy();
});

test("relocalizeShellScreens: 跳过没有 __shell 的屏；空/缺失注册表不抛错", () => {
  installDoc();
  let lang = "zh";
  const seen = [];
  const a = mountScreen({
    id: "reloc-c", title: { zh: "丙屏", en: "Screen C" }, host: "app",
    getLang: () => lang, onRelocalize: (l) => seen.push(l),
  });
  const plain = makeEl("main");
  plain.id = "screen-plain";
  lang = "en";
  assert.doesNotThrow(() => relocalizeShellScreens({ a: a.el, plain, nil: null, undef: undefined }));
  assert.equal(a.el.querySelector("#reloc-c-title").textContent, "Screen C");
  assert.deepEqual(seen, ["en"]);
  assert.doesNotThrow(() => relocalizeShellScreens(null));
  assert.doesNotThrow(() => relocalizeShellScreens(undefined));
  assert.doesNotThrow(() => relocalizeShellScreens({}));
  a.destroy();
});

test("relocalizeShellScreens: modal 屏无标题可换，只走 onRelocalize", () => {
  installDoc();
  let lang = "zh";
  const seen = [];
  const m = mountScreen({
    id: "reloc-modal", variant: "modal", host: "app",
    getLang: () => lang, onRelocalize: (l) => seen.push(l),
  });
  lang = "en";
  assert.doesNotThrow(() => relocalizeShellScreens({ m: m.el }));
  assert.deepEqual(seen, ["en"]);
  m.destroy();
});

test("mountScreen close: 焦点回到仍在页面的 opener", () => {
  const { app, doc } = installDoc();
  const opener = makeEl("button");
  opener.id = "btn-open";
  app.appendChild(opener);
  doc.activeElement = opener;
  const shell = mountScreen({
    id: "reloc-opener", title: { zh: "开屏", en: "Opener" }, host: "app",
    getLang: () => "zh",
  });
  shell.open();
  assert.equal(doc.activeElement, shell.el.querySelector("#reloc-opener-title"), "打开时焦点先到标题");
  shell.close();
  assert.equal(doc.activeElement, opener, "关闭后焦点回到 opener");
  assert.deepEqual(opener.focusCalls, [{ preventScroll: true }]);
  shell.destroy();
});

test("mountScreen close: opener 被重渲染后按 signature 找回新节点", () => {
  const { app, doc } = installDoc();
  const oldBtn = makeEl("button");
  oldBtn.id = "btn-open";
  app.appendChild(oldBtn);
  doc.activeElement = oldBtn;
  const shell = mountScreen({
    id: "reloc-opener2", title: { zh: "开屏二", en: "Opener 2" }, host: "app",
    getLang: () => "zh",
  });
  shell.open();
  // 页面重绘：旧 opener 下线，同 id 的新节点上线（My World 重绘即此情形）。
  oldBtn.remove();
  const newBtn = makeEl("button");
  newBtn.id = "btn-open";
  app.appendChild(newBtn);
  shell.close();
  assert.equal(doc.activeElement, newBtn, "关闭后焦点落到同 id 的新节点");
  assert.deepEqual(newBtn.focusCalls, [{ preventScroll: true }]);
  shell.destroy();
});

test("mountScreen close: 没有 opener 时不抛错、不乱聚焦", () => {
  const { doc, view } = installDoc();
  doc.activeElement = doc.body;
  const shell = mountScreen({
    id: "reloc-noopener", title: { zh: "无 opener", en: "No Opener" }, host: "app",
    getLang: () => "zh",
  });
  shell.open();
  assert.equal(doc.activeElement, shell.el.querySelector("#reloc-noopener-title"));
  assert.doesNotThrow(() => shell.close());
  // opener 为 null 时 deactivate 走 requestAnimationFrame 重试分支，不直接聚焦。
  assert.equal(view.rafCalls, 1, "无 opener 时安排下一帧重试");
  shell.destroy();
});
