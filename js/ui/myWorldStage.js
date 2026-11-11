/**
 * My World's showcase backdrop: a locker room drawn as ONE static inline SVG (no network, no image asset, no licence question).
 * The live 3D figure and its platform are drawn on top by the viewer; this only has to put the figure somewhere. The floor
 * line sits at ~80% of the height and the spotlight pool is centred where the platform lands (~93%), so they line up.
 * Presentation only: aria-hidden, no data, no handlers.
 */
const GOLD = "#e9c46a";

/** One hanging jersey, drawn at (x, y); `fill` is the shirt, `num` the number. */
const jersey = (x, y, fill, num, ink = "#f6efe0") =>
  `<g transform="translate(${x} ${y})"><path d="M12 0h8q6 10 12 0h8l10 14-8 8v46H10V22l-8-8z" fill="${fill}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>` +
  `<text x="26" y="50" text-anchor="middle" font-family="Georgia,serif" font-size="20" font-weight="700" fill="${ink}">${num}</text></g>`;

/** One locker; `open` ones show a jersey, closed ones a nameplate. */
function locker(x, open, fill, num) {
  const vents = [0, 1, 2, 3].map((i) => `<rect x="${x + 16}" y="${124 + i * 9}" width="56" height="4" rx="2" fill="#0a241a"/>`).join("");
  const inner = open
    ? `<rect x="${x + 6}" y="${176}" width="76" height="300" rx="3" fill="#0b2619"/>${jersey(x + 18, 196, fill, num)}<rect x="${x + 14}" y="${300}" width="60" height="5" rx="2" fill="#2a5a44"/>`
    : `<rect x="${x + 22}" y="${300}" width="44" height="14" rx="2" fill="${GOLD}" opacity=".55"/>`;
  return `<rect x="${x}" y="100" width="88" height="400" rx="5" fill="url(#mwLocker)" stroke="rgba(233,196,106,.32)" stroke-width="1.5"/>${vents}${inner}`;
}

export function lockerRoomSvg() {
  const left = [30, 122, 214];
  const right = [698, 790, 882];
  const colours = ["#e9c46a", "#f6efe0", "#2f9a68", "#d7a43a", "#f6efe0", "#e9c46a"];
  const nums = ["7", "23", "11", "3", "34", "9"];
  const bank = (xs, offset) => xs.map((x, i) => locker(x, i !== 1, colours[offset + i], nums[offset + i])).join("");
  const strips = [130, 330, 500, 670, 870].map((cx) => `<rect x="${cx - 70}" y="26" width="140" height="10" rx="5"/>`).join("");
  const lines = [-300, 0, 250, 500, 750, 1000, 1300].map((x) => `<line x1="500" y1="560" x2="${x}" y2="700"/>`).join("");
  return `<svg class="mw-stage-art" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="mwWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a2218"/><stop offset=".72" stop-color="#17493a"/><stop offset="1" stop-color="#0f3226"/></linearGradient>
    <linearGradient id="mwLocker" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b5a42"/><stop offset=".55" stop-color="#2a6b50"/><stop offset="1" stop-color="#143f2f"/></linearGradient>
    <linearGradient id="mwFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#143a2b"/><stop offset=".35" stop-color="#0b2419"/><stop offset="1" stop-color="#040d09"/></linearGradient>
    <linearGradient id="mwCone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2cf" stop-opacity=".34"/><stop offset="1" stop-color="#fff2cf" stop-opacity="0"/></linearGradient>
    <radialGradient id="mwPool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9b0" stop-opacity=".5"/><stop offset="1" stop-color="#ffe9b0" stop-opacity="0"/></radialGradient>
    <radialGradient id="mwVignette" cx=".5" cy=".55" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <filter id="mwGlow" x="-20%" y="-300%" width="140%" height="700%"><feGaussianBlur stdDeviation="7"/></filter>
  </defs>
  <rect width="1000" height="560" fill="url(#mwWall)"/>
  <rect width="1000" height="74" fill="#061710"/>
  <g fill="#fff3d0" filter="url(#mwGlow)" opacity=".8">${strips}</g>
  <g fill="#fffaf0">${strips}</g>
  ${bank(left, 0)}${bank(right, 3)}
  <circle cx="500" cy="270" r="150" fill="none" stroke="${GOLD}" stroke-opacity=".16" stroke-width="3"/>
  <path d="M350 270h300M500 120v300M395 165c40 70 40 140 0 210m210-210c-40 70-40 140 0 210" fill="none" stroke="${GOLD}" stroke-opacity=".10" stroke-width="3"/>
  <rect x="30" y="500" width="940" height="22" rx="4" fill="#3a2a1b"/><rect x="30" y="500" width="940" height="5" rx="2" fill="#7a5a36" opacity=".8"/>
  <rect y="522" width="1000" height="38" fill="#0a2118"/>
  <rect y="560" width="1000" height="140" fill="url(#mwFloor)"/>
  <g stroke="#fff" stroke-opacity=".05" stroke-width="2">${lines}<line x1="0" y1="595" x2="1000" y2="595"/><line x1="0" y1="632" x2="1000" y2="632"/><line x1="0" y1="676" x2="1000" y2="676"/></g>
  <polygon points="440,0 560,0 780,650 220,650" fill="url(#mwCone)"/>
  <ellipse cx="500" cy="650" rx="360" ry="70" fill="url(#mwPool)"/>
  <rect width="1000" height="700" fill="url(#mwVignette)"/>
</svg>`;
}
