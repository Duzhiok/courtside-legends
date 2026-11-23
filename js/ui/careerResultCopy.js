// The Gold Challenge result screen's words: title, summary and the continue button's label, one function per outcome.
// Pure. app.js (handleCareerResult) keeps the order of everything that is not text: the gold payout, the daily-task and
// challenge grants, the buttons' click handlers, the autosave. It computes the numbers, calls one of these, and writes the result.
//
// Moved out of app.js unchanged (B61): the strings are byte-for-byte what it inlined. Some outcomes follow the UI language,
// some are Chinese-only, exactly as before; i18n-phrases.js translates the Chinese ones by their exact text.

/** Champions. `nextTier` is the next challenge tier id (or null); only playoff15 / champ7 give the button a new label. */
export function championCopy({ tierId, nextTier, tier, reward, gold, injLine, challengeNote, wasFinals, series, lang }, { finalsSeriesLabel }) {
  const title =
    tierId === "champ7" ? (lang === "en" ? "Historical Champions Challenge · Cleared!" : "历史总冠军挑战 · 通关！") : tierId === "playoff15" ? (lang === "en" ? "Playoff Challenge Champions!" : "季后赛挑战冠军！") : (lang === "en" ? "Champions!" : "总冠军！");
  let summary = (nextTier
    ? lang === "en"
      ? `Champions! Earned ¤${reward}. Now ¤${gold}. Continue to ${tier.nextLabelEn || tier.nextLabel} (roster and gold kept). ${injLine}`
      : `捧杯！获得 ¤${reward}。当前 ¤${gold}。可继续${tier.nextLabel}（保留阵容与金币）。${injLine}`
    : tierId === "champ7"
      ? lang === "en"
        ? `You beat all 7 historical champions! Earned ¤${reward}. Now ¤${gold}. ${injLine}`
        : `你已击败 7 支历史总冠军！获得 ¤${reward}。当前 ¤${gold}。${injLine}`
      : lang === "en"
        ? `Champions! Earned ¤${reward}. Now ¤${gold}. ${injLine}`
        : `捧杯！获得 ¤${reward}。当前 ¤${gold}。${injLine}`) + challengeNote;
  if (wasFinals && series) summary = `${finalsSeriesLabel(series, lang)} · ${summary}`;
  const continuesToNextTier = nextTier === "playoff15" || nextTier === "champ7";
  return { title, summary, continueLabel: continuesToNextTier ? tier.nextLabel : "捧杯回主页" };
}

/** Knocked out (a Finals loss, or a second loss). */
export function eliminatedCopy({ wasFinals, losses, series, round, kind, injLine }, { finalsSeriesLabel, careerRoundLabel }) {
  return {
    title: wasFinals ? "总决赛出局" : losses >= 2 ? "两败出局" : "淘汰出局",
    summary:
      wasFinals && series
        ? `${finalsSeriesLabel(series)} · 系列赛失利出局。可回看其他对决。${injLine}`
        : `${careerRoundLabel(round)} · ${kind}失利后出局（负场 ${losses}）。可回看其他对决。${injLine}`,
    continueLabel: "回主页",
  };
}

/** A Finals series game that did not end the series. */
export function seriesGameCopy({ youWin, series, gameNo, reward, gold, injLine }, { finalsSeriesLabel }) {
  const nextGame = (series.wins || 0) + (series.losses || 0) + 1;
  return {
    title: youWin ? `总决赛 G${gameNo} 拿下` : `总决赛 G${gameNo} 惜败`,
    summary:
      `${finalsSeriesLabel(series)}。获得 ¤${reward}，当前 ¤${gold}。` +
      `G${nextGame} 开打前可先进市场买卖球员，调整阵容再战。${injLine}`,
    continueLabel: `备战总决赛 G${nextGame}（先进市场）`,
  };
}

/** Another game in the same group is still to be played. `nextKind` / `nextOppName` describe it ("下一场" / "？" when unknown). */
export function anotherGameCopy({ youWin, kind, reward, nextKind, nextOppName, losses, injLine }) {
  return {
    title: youWin ? `${kind}过关` : `${kind}失利 · 还有机会`,
    summary: youWin
      ? `${kind}获胜（¤${reward}）。组内下一场：${nextKind}（对阵 ${nextOppName}）。负场 ${losses}/2。${injLine}`
      : `${kind}失利（¤${reward}）。进入 ${nextKind} 争取晋级。负场 ${losses}/2 —— 再输就出局。${injLine}`,
    continueLabel: `备战${nextKind}`,
  };
}

/** The stage is done and the next one is seeded. */
export function advanceCopy({ youWin, kind, reward, gold, nextLabel, losses, injLine, stageSize }) {
  return {
    title: youWin ? "晋级成功" : "惊险晋级",
    summary: `${kind}赛果已计入。获得 ¤${reward}，当前 ¤${gold}。下一轮：${nextLabel}。负场 ${losses}/2。${injLine}`,
    continueLabel: stageSize === 2 ? "备战总决赛" : "备战下一轮",
  };
}
