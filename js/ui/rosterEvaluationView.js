import { photoImg } from "../data/photo.js";
import { skillChipsHtml } from "../data/skills.js";
import { nicknameBadgeHtml } from "../data/nicknames.js";
import { historicalUpsideHint } from "../engine/develop.js";

function perGame(value, gp) {
  return gp > 0 ? (Number(value) || 0) / gp : 0;
}

export function evaluateRosterPlayer(player, seasonRow, { salary = 0, ovr = 0 } = {}) {
  const stats = seasonRow?.stats || {};
  const gp = Number(stats.gp) || 0;
  const ppg = perGame(stats.pts, gp);
  const apg = perGame(stats.ast, gp);
  const rpg = perGame(stats.reb, gp);
  const mpg = perGame(stats.min, gp);
  const plusMinus = perGame(stats.plusMinus, gp);
  const salaryValue = Number(salary) || 0;
  let recommendation = "观察";
  let reason = "样本还不够，继续观察轮换和合同变化。";
  if (ovr >= 84 && ppg >= 16) {
    recommendation = "核心保留";
    reason = "能力和产出都达到核心级，除非收到明显升级方案，不建议主动交易。";
  } else if (salaryValue >= 220 && ppg < 12 && plusMinus < -2) {
    recommendation = "裁员候选";
    reason = "合同负担高、产出和净效率偏低，先比较裁员与交易腾薪资的代价。";
  } else if (salaryValue >= 150 && (ppg >= 14 || plusMinus >= 1)) {
    recommendation = "可交易资产";
    reason = "合同有价值且仍有产出，可以换取更适合当前窗口的球员或资产。";
  } else if (ppg >= 10 || plusMinus >= 0) {
    recommendation = "轮换保留";
    reason = "当前产出足以支撑轮换，除非位置重叠或交易能明显改善阵容。";
  }
  return {
    id: player.id,
    name: player.name,
    season: player.season,
    age: player.age ?? "—",
    photo: photoImg(player, "headshot sm"),
    skills: skillChipsHtml(player),
    nickname: nicknameBadgeHtml(player),
    potential: historicalUpsideHint(player) || "潜力信息不足，需要更多赛季样本。",
    abilities: {
      scoring: player.scoring ?? "—",
      three: player.three ?? "—",
      defense: player.defense ?? "—",
      rebound: player.rebound ?? "—",
      pass: player.pass ?? "—",
      speed: player.speed ?? "—",
      strength: player.strength ?? "—",
    },
    ovr,
    salary: salaryValue,
    gp,
    ppg,
    rpg,
    apg,
    mpg,
    plusMinus,
    recommendation,
    reason,
  };
}

export function buildRosterEvaluation(players, playerSeason, helpers = {}) {
  return [...(players || [])]
    .map((player) => evaluateRosterPlayer(
      player,
      playerSeason?.[`${helpers.teamId || ""}:${player.id}`],
      { salary: helpers.salaryOf?.(player), ovr: helpers.overallOf?.(player) },
    ))
    .sort((a, b) => {
      const order = { "裁员候选": 0, "可交易资产": 1, 观察: 2, 轮换保留: 3, "核心保留": 4 };
      return (order[a.recommendation] ?? 9) - (order[b.recommendation] ?? 9) || b.ovr - a.ovr;
    });
}

export function renderRosterEvaluation(container, rows) {
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = "<p class=\"tiny\">还没有可评估的球员。</p>";
    return;
  }
  container.innerHTML = `
    <div class="evaluation-note tiny">建议只作为决策参考：它不会自动交易或裁掉任何人。完整动作请切到「自由市场」。</div>
    <div class="roster-evaluation-list">
      ${rows.map((row) => `<article class="roster-evaluation-card" data-player-id="${row.id}">
        <header><div class="evaluation-player-heading">${row.photo}<div><strong>${row.name}</strong>${row.nickname}<span class="tiny"> · OVR ${row.ovr} · ${row.age}岁 · ${row.season || "—"}</span></div></div><b>${row.recommendation}</b></header>
        <div class="evaluation-stats">
          <span>合同 ¤${row.salary}</span><span>GP ${row.gp}</span><span>MIN ${row.mpg.toFixed(1)}</span><span>PTS ${row.ppg.toFixed(1)}</span><span>REB ${row.rpg.toFixed(1)}</span><span>AST ${row.apg.toFixed(1)}</span><span>+/- ${row.plusMinus >= 0 ? "+" : ""}${row.plusMinus.toFixed(1)}</span>
        </div>
        <div class="evaluation-abilities"><span>得分 ${row.abilities.scoring}</span><span>三分 ${row.abilities.three}</span><span>防守 ${row.abilities.defense}</span><span>篮板 ${row.abilities.rebound}</span><span>传球 ${row.abilities.pass}</span><span>速度 ${row.abilities.speed}</span><span>力量 ${row.abilities.strength}</span></div>
        <p class="tiny evaluation-potential">潜力：${row.potential}</p>
        ${row.skills ? `<div class="evaluation-skills">技能：${row.skills}</div>` : "<p class=\"tiny\">技能：暂无已配置技能</p>"}
        <p class="tiny">${row.reason}</p>
        <div class="btn-row evaluation-actions"><button type="button" class="btn small" data-eval-action="market">去自由市场 / 交易</button><button type="button" class="btn small ghost" data-eval-action="cut">去裁人面板</button><button type="button" class="btn small ghost" data-eval-action="compare" data-player-id="${row.id}">方案对比</button></div>
        <div class="trade-compare-panel" data-compare-for="${row.id}" hidden></div>
      </article>`).join("")}
    </div>`;
}
