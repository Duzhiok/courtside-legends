/**
 * Gold Lifestyle Shop dialog (user decision 2026-11-09): the shop sells Cosmetic
 * (looks only) and Convenience (saves time, never raises the single-game win rate)
 * items. No draws, no power — the catalog enforces that structurally.
 *
 * Pure HTML builders are exported for tests; createShop() wires one <dialog>
 * (event delegation on data-shop-action) and owns only the dialog's local state
 * (selected category/item, armed two-step buy, last ticket-use result).
 * All money / ownership / ticket state lives in js/data/shop.js.
 */
import { SHOP_CATEGORIES, SHOP_ITEMS, itemsByCategory, itemById, itemName, itemDesc, kindLabel, categoryLabel } from "../data/shopCatalog.js";
import { getShop, purchaseShopItem, equipShopItem, unequipShopItem, equippedClothingItemId, equippedFrameId, ticketBalance, autoXpRemaining, ownedItems, recentPurchases, ownedFurnitureIds } from "../data/shop.js";
import { lookColors } from "../data/avatarLook.js";
import { avatarDataUri } from "../data/avatarArt.js";
import { furnitureSvgFor, furnitureViewBox, roomPreviewSvg } from "./shopFurniture.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const T = (lang, zh, en) => (lang === "en" ? en : zh);

export function reasonText(reason, lang = "zh") {
  switch (reason) {
    case "guest": return T(lang, "请先登录账号购买（访客没有金币收入）", "Sign in to buy — guests earn no gold");
    case "not-enough-gold": return T(lang, "金币不足", "Not enough gold");
    case "already-owned": return T(lang, "已拥有这件商品", "You already own this");
    case "not-owned": return T(lang, "尚未拥有这件商品", "You don't own this yet");
    case "no-season": return T(lang, "当前没有进行中的常规赛", "No regular season in progress");
    case "no-tickets": return T(lang, "没有可用的托管卡", "No Auto-Play Tickets left");
    case "season-done": return T(lang, "本赛季剩余场次已打完", "No games left this season");
    case "no-games-simmed": return T(lang, "没有可以托管的比赛", "No games to simulate");
    default: return T(lang, "购买失败", "Purchase failed");
  }
}

/** Small preview for an item card / detail panel, drawn from the real effect data. */
export function shopPreviewHtml(item, lang = "zh") {
  const effect = item.effect || {};
  if (effect.type === "furniture") {
    // The piece's own SVG group from the furniture registry, cropped to its viewBox.
    const svg = furnitureSvgFor(effect.furnitureId);
    const vb = furnitureViewBox(effect.furnitureId);
    return `<svg class="shop-preview-svg" viewBox="${esc(vb)}" width="84" height="120" role="img" aria-label="${esc(itemName(item, lang))}">${svg}</svg>`;
  }
  if (effect.type === "outfit") {
    const colors = lookColors({ outfit: effect.outfitId });
    return `<svg class="shop-preview-svg" viewBox="0 0 48 64" width="48" height="64" role="img" aria-label="${esc(itemName(item, lang))}">
      <circle cx="24" cy="12" r="11" fill="${colors.Skin}" stroke="#1a1a1a" stroke-width="1.5" />
      <path d="M13 12 a11 11 0 0 1 22 0 l-2 -1 a10 6 0 0 0 -18 0 z" fill="${colors.Hair}" />
      <rect x="14" y="25" width="20" height="20" rx="4" fill="${colors.Shirt}" stroke="#1a1a1a" stroke-width="1.5" />
      <rect x="16" y="45" width="16" height="14" rx="3" fill="${colors.Pants}" stroke="#1a1a1a" stroke-width="1.5" />
    </svg>`;
  }
  if (effect.type === "frame") {
    // The item's own frame class (mw-frame-<frameId>) — same class the portrait wears.
    return `<span class="shop-preview-frame mw-frame-${esc(effect.frameId)}"><img src="${avatarDataUri({ name: "You", team: "NBA" })}" alt="" width="64" height="64" /></span>`;
  }
  if (effect.type === "autoTickets") {
    return `<span class="shop-preview-ticket"><span class="shop-preview-ticket-n">×${effect.games}</span><span class="shop-preview-ticket-sub">${esc(T(lang, "托管场次", "auto games"))}</span></span>`;
  }
  return "";
}

export function shopItemCardHtml(item, state, lang = "zh") {
  const shop = state.shop;
  const owned = item.effect?.type === "autoTickets" ? false : Boolean(shop?.owned?.[item.id]);
  const selected = state.selectedId === item.id;
  const stateText = owned ? T(lang, "已拥有", "Owned") : T(lang, `¤${item.price}`, `¤${item.price}`);
  return `<article class="shop-card${selected ? " is-selected" : ""}${owned ? " is-owned" : ""}" data-shop-action="select-item" data-item-id="${esc(item.id)}" tabindex="0" role="button" aria-pressed="${selected}">
    <div class="shop-card-preview">${shopPreviewHtml(item, lang)}</div>
    <div class="shop-card-name">${esc(itemName(item, lang))}</div>
    <div class="shop-card-meta"><span class="shop-kind">${esc(kindLabel(item.kind, lang))}</span><span class="shop-price">${esc(stateText)}</span></div>
  </article>`;
}

function ticketUseHtml(state, lang) {
  const ctx = state.ticketCtx || { season: false, remaining: 0, credits: 0, xpRemaining: 0 };
  const use = state.lastUse;
  const rows = [];
  if (use?.ok) {
    rows.push(`<p class="shop-status ok">${esc(T(lang, `已托管 ${use.simmed} 场：${use.wins} 胜 ${use.losses} 负。账号经验 +${use.gained}（${use.xpGames} 场计经验），剩余托管卡 ${use.tickets} 张。`, `Simulated ${use.simmed} games: ${use.wins}W ${use.losses}L. Account XP +${use.gained} (${use.xpGames} games paid XP), ${use.tickets} tickets left.`))}</p>`);
  } else if (use) {
    rows.push(`<p class="shop-status err">${esc(reasonText(use.reason, lang))}</p>`);
  }
  const allGames = Math.min(ctx.credits, ctx.remaining);
  return `<div class="shop-ticket-use">
    <p class="shop-ticket-line">${esc(T(lang, `托管卡：${ctx.credits} 张 · 本赛季剩余 ${ctx.remaining} 场 · 今天还能计经验的托管场次：${ctx.xpRemaining} 场`, `Tickets: ${ctx.credits} · ${ctx.remaining} games left this season · XP-paying auto games left today: ${ctx.xpRemaining}`))}</p>
    <div class="btn-row">
      <button type="button" class="btn small" data-shop-action="use-tickets" data-games="5" ${!ctx.season || ctx.credits < 5 || ctx.remaining <= 0 ? "disabled" : ""}>${esc(T(lang, "托管 5 场", "Sim 5 games"))}</button>
      <button type="button" class="btn small" data-shop-action="use-tickets" data-games="20" ${!ctx.season || ctx.credits < 20 || ctx.remaining <= 0 ? "disabled" : ""}>${esc(T(lang, "托管 20 场", "Sim 20 games"))}</button>
      <button type="button" class="btn small" data-shop-action="use-tickets" data-games="${allGames}" ${!ctx.season || allGames <= 0 ? "disabled" : ""}>${esc(T(lang, `托管全部 ${allGames} 场`, `Sim all ${allGames} games`))}</button>
    </div>
    ${rows.join("")}
  </div>`;
}

export function shopDetailHtml(item, state, lang = "zh") {
  if (!item) return `<div class="shop-detail-empty">${esc(T(lang, "选择一件商品查看详情。", "Pick an item to see its details."))}</div>`;
  const account = state.account;
  const shop = state.shop;
  const effect = item.effect || {};
  const isTicket = effect.type === "autoTickets";
  const owned = !isTicket && Boolean(shop?.owned?.[item.id]);
  const armed = state.armedBuyId === item.id;
  const actions = [];
  if (!account) {
    actions.push(`<button type="button" class="btn" data-shop-action="open-accounts">${esc(T(lang, "登录账号后购买", "Sign in to buy"))}</button>`);
  } else if (isTicket) {
    actions.push(`<button type="button" class="btn" data-shop-action="buy" data-item-id="${esc(item.id)}">${esc(armed ? T(lang, `确认花费 ¤${item.price}？`, `Confirm ¤${item.price}?`) : T(lang, `购买 ¤${item.price}`, `Buy ¤${item.price}`))}</button>`);
  } else if (!owned) {
    actions.push(`<button type="button" class="btn" data-shop-action="buy" data-item-id="${esc(item.id)}">${esc(armed ? T(lang, `确认花费 ¤${item.price}？`, `Confirm ¤${item.price}?`) : T(lang, `购买 ¤${item.price}`, `Buy ¤${item.price}`))}</button>`);
  } else if (effect.type === "outfit") {
    const wearing = equippedClothingItemId(account) === item.id;
    actions.push(wearing
      ? `<button type="button" class="btn ghost" data-shop-action="unequip" data-item-id="${esc(item.id)}">${esc(T(lang, "换下（恢复默认球衣）", "Take off (back to default)"))}</button>`
      : `<button type="button" class="btn" data-shop-action="equip" data-item-id="${esc(item.id)}">${esc(T(lang, "穿上", "Wear it"))}</button>`);
  } else if (effect.type === "frame") {
    const on = equippedFrameId(account) === item.id;
    actions.push(on
      ? `<button type="button" class="btn ghost" data-shop-action="unequip" data-item-id="${esc(item.id)}">${esc(T(lang, "取下头像框", "Remove frame"))}</button>`
      : `<button type="button" class="btn" data-shop-action="equip" data-item-id="${esc(item.id)}">${esc(T(lang, "戴上头像框", "Apply frame"))}</button>`);
  } else if (effect.type === "furniture") {
    actions.push(`<p class="shop-status ok">${esc(T(lang, "已摆进 My Home 房间，去 My World 看看。", "Placed in your My Home room — see it in My World."))}</p>`);
  }
  const status = state.status ? `<p class="shop-status ${state.status.kind}">${esc(state.status.text)}</p>` : "";
  return `<div class="shop-detail">
    <div class="shop-detail-preview">${shopPreviewHtml(item, lang)}</div>
    <h3>${esc(itemName(item, lang))}</h3>
    <p class="shop-detail-kind">${esc(kindLabel(item.kind, lang))} · ${esc(categoryLabel(item.category, lang))} · ${esc(`¤${item.price}`)}</p>
    <p class="shop-detail-desc">${esc(itemDesc(item, lang))}</p>
    ${isTicket ? ticketUseHtml(state, lang) : ""}
    <div class="btn-row">${actions.join("")}</div>
    ${status}
  </div>`;
}

/**
 * Owned-inventory tab: what the account already owns, with its real state and
 * the actions that apply — wear / take off clothing, apply / remove a frame,
 * furniture already placed (shown in the room preview). Tickets are credits,
 * shown as a balance line. This is where a player finds, equips and places
 * what they bought instead of hunting through the shop again; My World reads
 * the same ownership through the shop.js API (workstream D).
 */
export function shopInventoryHtml(state, lang = "zh") {
  const account = state.account;
  if (!account) {
    return `<div class="shop-inventory"><p class="shop-empty">${esc(T(lang, "登录账号后查看已拥有的商品。", "Sign in to see what you own."))}</p></div>`;
  }
  const owned = state.owned || [];
  const recent = state.recent || [];
  const furniture = state.furniture || [];
  const rows = owned.map(({ item, equipped }) => {
    const effect = item.effect || {};
    const stateText = effect.type === "furniture" ? T(lang, "已摆进房间", "Placed in your room")
      : effect.type === "outfit" ? (equipped ? T(lang, "穿着中", "Wearing") : T(lang, "未穿", "Not wearing"))
      : effect.type === "frame" ? (equipped ? T(lang, "已戴上", "Applied") : T(lang, "未戴上", "Not applied"))
      : "";
    const action = effect.type === "outfit"
      ? `<button type="button" class="btn small${equipped ? " ghost" : ""}" data-shop-action="${equipped ? "unequip" : "equip"}" data-item-id="${esc(item.id)}">${esc(equipped ? T(lang, "换下", "Take off") : T(lang, "穿上", "Wear it"))}</button>`
      : effect.type === "frame"
        ? `<button type="button" class="btn small${equipped ? " ghost" : ""}" data-shop-action="${equipped ? "unequip" : "equip"}" data-item-id="${esc(item.id)}">${esc(equipped ? T(lang, "取下", "Remove") : T(lang, "戴上", "Apply"))}</button>`
        : "";
    return `<div class="shop-owned-row"><span class="shop-owned-name">${esc(itemName(item, lang))}</span><span class="shop-owned-state">${esc(stateText)}</span><span class="btn-row">${action}</span></div>`;
  }).join("");
  const recentRows = recent.map(({ item }) => `<li>${esc(itemName(item, lang))}</li>`).join("");
  return `<div class="shop-inventory">
    <h3>${esc(T(lang, "我的房间预览", "My room preview"))}</h3>
    <div class="shop-room-preview">${roomPreviewSvg(furniture)}</div>
    <p class="shop-ticket-line">${esc(T(lang, `托管卡：${state.tickets || 0} 张`, `Auto-Play Tickets: ${state.tickets || 0}`))}</p>
    <h3>${esc(T(lang, "已拥有", "Owned"))}</h3>
    ${owned.length ? `<div class="shop-owned-list">${rows}</div>` : `<p class="shop-empty">${esc(T(lang, "还没有买过商品——喜欢的家具、衣服和头像框都在上面几个分类里。", "Nothing bought yet — furniture, clothing and frames are in the tabs above."))}</p>`}
    <h3>${esc(T(lang, "最近购买", "Recently bought"))}</h3>
    ${recentRows ? `<ul class="shop-recent-list">${recentRows}</ul>` : `<p class="shop-empty">${esc(T(lang, "还没有购买记录。", "No purchases yet."))}</p>`}
  </div>`;
}

export function shopDialogHtml(state, lang = "zh") {
  const account = state.account;
  const gold = account ? (account.gold || 0) : 0;
  const items = itemsByCategory(state.category);
  const selected = itemById(state.selectedId) || items[0] || null;
  const inventory = state.view === "inventory";
  return `<div class="shop-head">
    <h2>${esc(T(lang, "商城", "Shop"))}</h2>
    <p class="shop-gold">${esc(T(lang, `我的金币：¤${gold}`, `My gold: ¤${gold}`))}</p>
    <button type="button" class="btn small ghost shop-close" data-shop-action="close" aria-label="${esc(T(lang, "关闭", "Close"))}">✕</button>
  </div>
  <p class="shop-note">${esc(T(lang, "金币只买生活与便利：外观、家具、托管。金币不买球员卡、不加比赛属性。", "Gold buys lifestyle and convenience only: looks, furniture, auto-play. Gold never buys player cards or match attributes."))}</p>
  <div class="shop-tabs" role="tablist">
    ${SHOP_CATEGORIES.map((c) => `<button type="button" role="tab" aria-selected="${state.category === c.id && !inventory}" class="shop-tab${state.category === c.id && !inventory ? " is-active" : ""}" data-shop-action="select-category" data-category="${esc(c.id)}">${esc(lang === "en" ? c.en : c.zh)}</button>`).join("")}
    <button type="button" role="tab" aria-selected="${inventory}" class="shop-tab${inventory ? " is-active" : ""}" data-shop-action="select-inventory">${esc(T(lang, "已拥有", "Owned"))}</button>
  </div>
  ${inventory ? shopInventoryHtml(state, lang) : `<div class="shop-body">
    <div class="shop-grid">${items.map((item) => shopItemCardHtml(item, state, lang)).join("")}</div>
    ${shopDetailHtml(selected, state, lang)}
  </div>`}`;
}

export function createShop({ getLang, getAccount, onUseTickets, ticketContext, onOpenAccounts, onPurchased }) {
  const dialog = document.getElementById("shop-dialog");
  if (!dialog) return null;
  const state = { category: "home", view: "catalog", selectedId: null, armedBuyId: null, lastUse: null, status: null };

  function snapshot() {
    const account = getAccount ? getAccount() : null;
    return {
      account,
      shop: account ? getShop(account) : { owned: {}, tickets: 0 },
      category: state.category,
      view: state.view,
      selectedId: state.selectedId,
      armedBuyId: state.armedBuyId,
      lastUse: state.lastUse,
      status: state.status,
      owned: account ? ownedItems(account) : [],
      recent: account ? recentPurchases(account, 5) : [],
      furniture: account ? ownedFurnitureIds(account) : [],
      tickets: account ? ticketBalance(account) : 0,
      ticketCtx: ticketContext ? ticketContext() : { season: false, remaining: 0, credits: 0, xpRemaining: 0 },
    };
  }

  function render() {
    dialog.innerHTML = shopDialogHtml(snapshot(), getLang());
  }

  function open(opts = {}) {
    if (opts.category) state.category = opts.category;
    if (opts.view) state.view = opts.view;
    const items = itemsByCategory(state.category);
    if (!state.selectedId || !items.some((i) => i.id === state.selectedId)) state.selectedId = items[0]?.id || null;
    state.armedBuyId = null;
    state.lastUse = null;
    state.status = null;
    render();
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
  }

  function refresh() {
    if (dialog.open) render();
  }

  dialog.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-shop-action]");
    if (!btn) return;
    const action = btn.dataset.shopAction;
    const account = getAccount ? getAccount() : null;
    if (action === "close") { dialog.close(); return; }
    if (action === "select-category") {
      state.category = btn.dataset.category;
      state.view = "catalog";
      const items = itemsByCategory(state.category);
      state.selectedId = items[0]?.id || null;
      state.armedBuyId = null;
      state.status = null;
      render();
      return;
    }
    if (action === "select-inventory") {
      state.view = "inventory";
      state.armedBuyId = null;
      state.status = null;
      render();
      return;
    }
    if (action === "select-item") {
      state.selectedId = btn.dataset.itemId;
      state.armedBuyId = null;
      state.status = null;
      render();
      return;
    }
    if (action === "buy") {
      const id = btn.dataset.itemId;
      if (state.armedBuyId !== id) { state.armedBuyId = id; state.status = null; render(); return; }
      state.armedBuyId = null;
      const res = purchaseShopItem(account, id);
      if (res.ok) {
        state.status = { kind: "ok", text: getLang() === "en" ? `Bought ${itemName(res.item, "en")} for ¤${res.item.price}.` : `已购买 ${itemName(res.item, "zh")}，花费 ¤${res.item.price}。` };
        if (onPurchased) onPurchased(res.item);
      } else {
        const extra = res.reason === "not-enough-gold" ? (getLang() === "en" ? ` (need ¤${res.price}, have ¤${res.gold})` : `（需要 ¤${res.price}，现有 ¤${res.gold}）`) : "";
        state.status = { kind: "err", text: reasonText(res.reason, getLang()) + extra };
      }
      render();
      return;
    }
    if (action === "equip" || action === "unequip") {
      const id = btn.dataset.itemId;
      const res = action === "equip" ? equipShopItem(account, id) : unequipShopItem(account, id);
      state.status = res.ok
        ? { kind: "ok", text: getLang() === "en" ? "Done." : "已完成。" }
        : { kind: "err", text: reasonText(res.reason, getLang()) };
      if (res.ok && onPurchased) onPurchased(res.item);
      render();
      return;
    }
    if (action === "use-tickets") {
      const games = Number(btn.dataset.games) || 5;
      const res = onUseTickets ? await onUseTickets(games) : { ok: false, reason: "no-games-simmed" };
      state.lastUse = res;
      state.status = null;
      render();
      return;
    }
    if (action === "open-accounts") {
      dialog.close();
      if (onOpenAccounts) onOpenAccounts();
      return;
    }
  });

  return { open, refresh, close: () => dialog.close() };
}
