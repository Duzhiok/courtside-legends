// M2b-1 role-player probe (R161): who actually shoots when the decision picks a catch-and-shoot role player.
//   node scripts/research/clutch-role-player-probe.mjs
// Found: picking Toni Kukoc (CHI 1996) makes him shoot LESS than with no decision (11/600 at handoff 0.78), because
// the decision turns him into the primary ball-handler and the existing low-appetite re-pass rule moves the ball on.

import { readFileSync } from "node:fs";
import { seasonToCard } from "../../js/data/players.js";
import { GameSim, CLUTCH_DECISION_TUNING as T } from "../../js/engine/sim.js";
import { seededStream } from "../../js/core/seededRandom.js";
const R = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const teamOf=(c,s)=>R.filter(r=>r.team===c&&r.season===s).map(seasonToCard).sort((a,b)=>b.scoring+b.three-a.scoring-a.three).slice(0,10);
const H=teamOf("CHI",1996), A=teamOf("SEA",1996);
for (const h of [0.78, 0.3, 0]) {
  T.handoff=h; const tally={}; let onCourtAtSubmit=0, onCourtAfter=0, accepted=0;
  for (let seed=1; seed<=600; seed++) {
    const s=new GameSim({home:{players:H,name:"CHI"},away:{players:A,name:"SEA"},youSide:"home",injuries:false,speed:3,rng:seededStream(seed),onEvent(){},onTick(){},onEnd(){}});
    s.running=true;s.paused=false;s.quarter=4;s.clock=12;s.score={home:97,away:100};s.possession="home";
    const X=s.home.onCourt.find(p=>/Kuko/.test(p.name)); if(X) onCourtAtSubmit++;
    const r=s.submitDecision({attemptId:s.issueAttemptId(),kind:"clutch_shooter",shooterId:X?.id,actionHint:"three"}); if(r.accepted)accepted++;
    for(let i=0;i<14&&!s.clutchLog.length;i++) s.step();
    if (s.home.onCourt.some(p=>p.id===X?.id)) onCourtAfter++;
    const o=s.clutchLog[0]; const k=o? (o.attempted?"ATTEMPTED":o.reason):"no-outcome"; tally[k]=(tally[k]||0)+1;
  }
  console.log(`h=${h} accepted ${accepted}/600 onCourt@submit ${onCourtAtSubmit} onCourt@end ${onCourtAfter}`, JSON.stringify(tally));
}
