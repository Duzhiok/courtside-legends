/**
 * My Home screen (Home 2.0, H1/H2): the full, interactive version of the room that My World previews.
 * Reads everything fresh from the account (shop ownership, saved layout) and the app's model getter
 * (real trophies, best cards, portrait). Writes only `account.homeLayout`, through data/homeLayout.js —
 * the rules (owned only, no overlaps, slots) live there, this file only turns clicks into moves.
 */
import { HOME_GRID, WALL_SLOTS, getHomeLayout, movePiece, resetHomeLayout, resolveHome, rotatePiece, saveHomeLayout } from "../../data/homeLayout.js";
import { ownedFurnitureIds } from "../../data/shop.js";
import { SHOP_ITEMS, itemName } from "../../data/shopCatalog.js";
import { renderIsoRoom } from "./isoRoom.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const T = (lang, zh, en) => (lang === "en" ? en : zh);
const SCREEN_ID = "screen-my-home";

export function ensureMyHomeScreen() {
  let el = document.querySelector(`#${SCREEN_ID}`);
  if (el) return el;
  el = document.createElement("main");
  el.id = SCREEN_ID;
  el.className = "screen";
  el.innerHTML = `<div class="panel-head"><button class="nav-back" id="btn-my-home-back" type="button"><span>返回</span></button><h2>我的家 · My Home</h2></div><div id="my-home-body"></div>`;
  (document.querySelector("#app") || document.body).appendChild(el); // inside #app: it carries the page padding and max width
  return el;
}

/** Display name of a furniture id, from the shop catalog that sells it. */
function pieceName(id, lang) {
  const item = SHOP_ITEMS.find((i) => i.effect?.type === "furniture" && i.effect.furnitureId === id);
  return item ? itemName(item, lang) : id;
}

const REASONS = {
  "not-owned": ["这件家具还没买", "You do not own this piece yet"],
  occupied: ["那里已经有东西了", "Something is already there"],
  "out-of-room": ["放不下：超出房间了", "Does not fit: outside the room"],
  "wrong-spot": ["这件家具放不到那里", "This piece cannot go there"],
  "wall-piece": ["挂墙的家具不能旋转", "Wall pieces cannot rotate"],
  guest: ["访客不能保存布局，请先创建账号", "Guests cannot save a layout — create an account first"],
};

export function createMyHome({ getLang, getModel, show, goBack, onOpenShop } = {}) {
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  let el = null;
  let body = null;
  let wired = false;
  let selected = null;
  let status = "";

  const model = () => (typeof getModel === "function" ? getModel() : { account: null, cards: [], trophyCount: 0, portrait: null, name: "" });
  const owned = (account) => ownedFurnitureIds(account);

  function state() {
    const m = model();
    const ids = owned(m.account);
    const placed = resolveHome(ids, getHomeLayout(m.account));
    if (selected && !placed.some((p) => p.id === selected)) selected = null;
    return { m, ids, placed };
  }

  function trayHtml(placed, l) {
    if (!placed.length) {
      return `<p class="mh-empty">${T(l, "还没有家具——去商城买一件，它会立刻出现在房间里。", "No furniture yet — buy a piece in the Shop and it shows up here at once.")}</p>`;
    }
    return `<ul class="mh-tray">${placed
      .map((p) => `<li><button type="button" class="mh-chip${p.id === selected ? " is-selected" : ""}" data-mh-pick="${esc(p.id)}" aria-pressed="${p.id === selected}">${esc(pieceName(p.id, l))}<small>${p.kind === "wall" ? T(l, "挂墙", "Wall") : T(l, "地面", "Floor")}</small></button></li>`)
      .join("")}</ul>`;
  }

  function controlsHtml(placed, l) {
    const sel = placed.find((p) => p.id === selected);
    const floor = sel?.kind === "floor";
    const wall = sel?.kind === "wall";
    const d = (act, glyph, zh, en) => `<button type="button" class="mh-step" data-mh-act="${act}" aria-label="${T(l, zh, en)}"${floor ? "" : " disabled"}>${glyph}</button>`;
    return `<div class="mh-controls">
      <div class="mh-dpad" role="group" aria-label="${T(l, "微调位置", "Nudge position")}">${d("nx", "↖", "向左后移", "Back left")}${d("py_", "↗", "向右后移", "Back right")}${d("ny", "↙", "向左前移", "Front left")}${d("px", "↘", "向右前移", "Front right")}</div>
      <div class="mh-actions">
        <button type="button" class="btn small" data-mh-act="rotate"${floor ? "" : " disabled"}>${T(l, "⟳ 旋转", "⟳ Rotate")}</button>
        <button type="button" class="btn small" data-mh-act="next-slot"${wall ? "" : " disabled"}>${T(l, "换个挂钩", "Next hook")}</button>
        <button type="button" class="btn small ghost" data-mh-act="reset">${T(l, "恢复默认布局", "Reset layout")}</button>
        <button type="button" class="btn small mw-gold" data-mh-act="shop">${T(l, "🛍️ 逛商城 · 家具", "🛍️ Shop · Furniture")}</button>
      </div>
    </div>`;
  }

  function render() {
    if (!body) return;
    const l = lang();
    const { m, ids, placed } = state();
    const room = renderIsoRoom({ placed, trophyCount: m.trophyCount, cards: m.cards, portrait: m.portrait?.src || null, name: m.name, lang: l, interactive: true, selectedId: selected, label: T(l, "我的篮球房间（可点选家具并摆放）", "My basketball room (select a piece and place it)") });
    const hint = selected ? T(l, `已选中「${pieceName(selected, l)}」：点地板格子或墙上的挂钩来移动。`, `“${pieceName(selected, l)}” selected: click a floor tile or a wall hook to move it.`) : T(l, "先在「我的家具」里点选一件，再点房间的地板格子或墙上的挂钩。", "Pick a piece under “My furniture”, then click a floor tile or a wall hook in the room.");
    body.innerHTML = `<div class="mh-layout">
      <section class="mh-stage-card"><div class="mh-stage">${room}</div><p class="mh-status" role="status" aria-live="polite">${esc(status || hint)}</p></section>
      <aside class="mh-side">
        <div class="mh-stats">
          <div><b>${m.trophyCount}</b><span>${T(l, "冠军奖杯", "Trophies")}</span></div>
          <div><b>${Math.min(m.cards.length, 3)}/3</b><span>${T(l, "展示球员卡", "Framed cards")}</span></div>
          <div><b>${ids.length}</b><span>${T(l, "家具", "Furniture")}</span></div>
        </div>
        <h3>${T(l, "我的家具", "My furniture")}</h3>
        ${trayHtml(placed, l)}
        ${controlsHtml(placed, l)}
        <p class="tiny mh-note">${T(l, "金币只买外观与便利：家具只是装饰，不影响球员能力和比赛。", "Gold buys looks and convenience only: furniture is decoration and never changes ratings or matches.")}</p>
      </aside>
    </div>`;
  }

  function say(reason) {
    const r = REASONS[reason] || [reason, reason];
    status = T(lang(), r[0], r[1]);
  }

  /** Apply a pure move/rotate result: persist it, or explain why not. */
  function commit(result, okText) {
    const { m } = state();
    if (!result.ok) {
      say(result.reason);
      return false;
    }
    if (!saveHomeLayout(m.account, result.layout)) {
      say("guest");
      return false;
    }
    status = okText || "";
    return true;
  }

  function solidAt(placed, x, y) {
    const hit = placed.filter((p) => p.kind === "floor" && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.d);
    return hit.find((p) => p.id !== "rug") || hit[0] || null;
  }

  function onCell(x, y) {
    const { ids, placed } = state();
    const l = lang();
    const sel = placed.find((p) => p.id === selected);
    if (sel?.kind === "floor") {
      const ax = Math.min(x, HOME_GRID - sel.w);
      const ay = Math.min(y, HOME_GRID - sel.d);
      const res = movePiece(ids, getHomeLayout(state().m.account), sel.id, { x: ax, y: ay });
      if (commit(res, T(l, `已摆好「${pieceName(sel.id, l)}」`, `Placed “${pieceName(sel.id, l)}”`))) return;
    }
    const occupant = solidAt(placed, x, y);
    if (occupant) {
      selected = occupant.id;
      status = "";
    }
  }

  function onSlot(slotId) {
    const { ids, placed } = state();
    const l = lang();
    const sel = placed.find((p) => p.id === selected);
    if (sel?.kind === "wall") {
      const res = movePiece(ids, getHomeLayout(state().m.account), sel.id, { slot: slotId });
      if (commit(res, T(l, `已挂好「${pieceName(sel.id, l)}」`, `Hung “${pieceName(sel.id, l)}”`))) return;
    }
    const occupant = placed.find((p) => p.slot === slotId);
    if (occupant) {
      selected = occupant.id;
      status = "";
    } else if (sel) {
      say("wrong-spot");
    }
  }

  function nudge(dx, dy) {
    const { ids, placed, m } = state();
    const sel = placed.find((p) => p.id === selected);
    if (sel?.kind !== "floor") return;
    commit(movePiece(ids, getHomeLayout(m.account), sel.id, { x: sel.x + dx, y: sel.y + dy }), "");
  }

  const ACTIONS = {
    nx: () => nudge(-1, 0),
    px: () => nudge(1, 0),
    ny: () => nudge(0, -1),
    py_: () => nudge(0, 1),
    rotate: () => {
      const { ids, m } = state();
      if (selected) commit(rotatePiece(ids, getHomeLayout(m.account), selected), "");
    },
    "next-slot": () => {
      const { ids, placed, m } = state();
      const sel = placed.find((p) => p.id === selected);
      if (sel?.kind !== "wall") return;
      const order = Object.keys(WALL_SLOTS);
      const free = order.filter((s) => s === sel.slot || !placed.some((p) => p.slot === s));
      const next = free[(free.indexOf(sel.slot) + 1) % free.length];
      commit(movePiece(ids, getHomeLayout(m.account), sel.id, { slot: next }), "");
    },
    reset: () => {
      const { m } = state();
      if (resetHomeLayout(m.account)) status = T(lang(), "已恢复默认布局", "Layout reset");
      else say("guest");
    },
    shop: () => onOpenShop?.("home"),
  };

  function wire() {
    if (wired) return;
    wired = true;
    el.querySelector("#btn-my-home-back")?.addEventListener("click", () => (typeof goBack === "function" ? goBack() : el.classList.remove("active")));
    body.addEventListener("click", (e) => {
      const pick = e.target.closest("[data-mh-pick]");
      const cell = e.target.closest("[data-cell]");
      const slot = e.target.closest("[data-slot]");
      const act = e.target.closest("[data-mh-act]");
      if (pick) {
        selected = selected === pick.dataset.mhPick ? null : pick.dataset.mhPick;
        status = "";
      } else if (cell) {
        const [x, y] = cell.dataset.cell.split(",").map(Number);
        onCell(x, y);
      } else if (slot) {
        onSlot(slot.dataset.slot);
      } else if (act) {
        status = "";
        ACTIONS[act.dataset.mhAct]?.();
      } else return;
      render();
    });
    // A purchase made in the shop dialog on top of this screen shows up as soon as the dialog closes.
    document.querySelector("#shop-dialog")?.addEventListener("close", () => {
      if (el.classList.contains("active")) render();
    });
  }

  function open() {
    el = ensureMyHomeScreen();
    body = el.querySelector("#my-home-body");
    wire();
    selected = null;
    status = "";
    render();
    if (typeof show === "function") show("myHome");
    else el.classList.add("active");
  }

  return { open, refresh: render };
}
