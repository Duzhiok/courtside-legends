/**
 * The credits page: who took each photo we show, and under which licence. Pure HTML builders —
 * app.js owns the DOM. The data is photoCredits.js (generated from the Wikimedia Commons API), ~900 KB: it is NOT imported here,
 * so nobody pays for it until the credits page is opened (app.js loads it with import() on click).
 */

/** Only http(s) links are ever rendered as links; anything else (javascript:, data:) becomes plain text. */
const link = (href, text, esc) =>
  /^https?:\/\//i.test(href || "")
    ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`
    : esc(text);
const titleOf = (file) => file.replace(/\.(jpe?g|png|webp)$/i, "");

/** S-P2-2: the credits data is static, so a sort is cached per (credits, nameOf)
 * pair — the default nameOf is a module-level function so repeat opens share
 * one identity and hit the cache. Callers passing a fresh closure each time
 * still get a correct (recomputed) result. */
const identityNameOf = (bref) => bref;
const rowsCache = new WeakMap();

/** One row per photo, sorted by the first player it shows. */
export function creditRows(credits, nameOf = identityNameOf) {
  if (!credits || typeof credits !== "object") throw new TypeError("creditRows needs the PHOTO_CREDITS object");
  const cached = rowsCache.get(credits);
  if (cached && cached.nameOf === nameOf) return cached.rows;
  const rows = Object.entries(credits)
    .map(([file, credit]) => ({ file, ...credit, players: credit.brefs.map(nameOf) }))
    .sort((a, b) => a.players[0].localeCompare(b.players[0]) || a.file.localeCompare(b.file));
  rowsCache.set(credits, { nameOf, rows });
  return rows;
}

function licenseSummary(rows) {
  const counts = {};
  for (const row of rows) counts[row.license] = (counts[row.license] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([license, count]) => `${license} ×${count}`)
    .join(" · ");
}

function rowHtml(row, esc) {
  const artist = row.artistUrl ? link(row.artistUrl, row.artist, esc) : esc(row.artist);
  const license = row.licenseUrl ? link(row.licenseUrl, row.license, esc) : esc(row.license);
  return `<li class="credit-row">
    <strong class="credit-players">${esc(row.players.join("、"))}</strong>
    <span class="credit-file">${link(row.page, `“${titleOf(row.file)}”`, esc)}</span>
    <span class="credit-meta">作者：${artist} · 许可：${license}</span>
  </li>`;
}

/** S-P2-2: only the first `shown` rows are rendered (default: all, so callers
 * that want the whole list keep the old behaviour); a "load more" button
 * covers the rest instead of one 2640-row innerHTML. */
export function creditsHtml({ rows, localCount = 0, shown = rows.length }, esc) {
  const rest = rows.length - shown;
  return `<div class="credits-intro">
      <p>球员照片来自 <strong>Wikimedia Commons</strong>，各按其许可证使用，作者与许可见下表。为适配界面，照片经过<strong>缩放和裁剪</strong>。</p>
      <p>没有照片的球员显示的是<strong>按球队配色生成的剪影</strong>，上面是姓名缩写，并不是本人照片。${
        localCount ? `另有 ${localCount} 位球员使用本项目自制的插画。` : ""
      }</p>
      <p>本项目是非官方的爱好作品，与 NBA、各球队、球员及 Wikimedia 基金会均无隶属关系。</p>
      <p class="tiny">共 ${rows.length} 张照片 · ${esc(licenseSummary(rows))}</p>
    </div>
    <ul class="credits-list">${rows.slice(0, shown).map((row) => rowHtml(row, esc)).join("")}</ul>${
      rest > 0
        ? `<p class="credits-more"><button type="button" class="btn" data-credits-more>加载更多（还剩 ${rest} 张）</button></p>`
        : ""
    }`;
}
