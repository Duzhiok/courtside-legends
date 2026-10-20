/**
 * Single source of truth for home-screen game modes.
 *
 * This does not change any mode's behavior. It documents which entry
 * points are genuinely distinct experiences versus which are quick
 * variants of the same "one quick single game" flow, so the UI can stop
 * presenting near-duplicate choices as equally weighted top-level
 * buttons. Consolidating behavior happens gradually; this catalog is the
 * first reversible step: identical modes, clearer grouping.
 */

export const MODE_GROUPS = [
  {
    id: "core",
    label: "核心生涯 · 先从这里开始",
    modes: [
      {
        id: "timeTravel",
        title: "穿越生涯",
        description: "回到过去担任经理兼教练，用有限的未来知识改写五年历史",
        featured: true,
      },
      {
        id: "franchise",
        title: "联盟经理",
        description: "经营 15+ 年：选秀、球员发展、市场补强、完整比赛与联盟历史",
        featured: true,
      },
    ],
  },
  {
    id: "quick",
    label: "快速玩法 · 一局就懂",
    modes: [
      {
        id: "custom",
        title: "自定义对战",
        description: "15 块预算轮抽巅峰卡 → 挑战 32 支历史球队淘汰赛 · 另含双人/传奇",
        featured: true,
      },
      {
        id: "ranked",
        title: "排位赛",
        description: "用账号班底 + 教练/战术出战；胜负计入战绩，卡组不下线消失",
      },
      {
        id: "season",
        title: "常规赛征程",
        description:
          "32 队或穿越历史整年（如 1991：当年全联盟常规赛→季后赛，总决赛才可能遇乔丹）· 自命名拉斯维加斯队 · 评奖",
      },
      {
        id: "career",
        title: "金币晋级赛",
        description: "32 联队夺冠 → 挑战 15 支历史季后赛 → 再挑战 7 支历史总冠军；进程自动保存",
      },
      {
        id: "tournament",
        title: "多人淘汰赛",
        description: "每轮多一次选人，一路打到总决赛",
      },
    ],
  },
  {
    id: "quick-variants",
    label: "更多单局玩法 · 与自定义对战同类",
    parentModeId: "custom",
    collapsedByDefault: true,
    modes: [
      {
        id: "draft",
        title: "选秀建队",
        description: "抽球员与教练，打一场完整模拟赛",
        variantOf: "custom",
      },
      {
        id: "quick",
        title: "快速演示",
        description: "系统自动组两队，立刻开打看指挥",
        variantOf: "custom",
      },
    ],
  },
];

export function allModes(groups = MODE_GROUPS) {
  return groups.flatMap((group) => group.modes.map((mode) => ({ ...mode, groupId: group.id })));
}

export function modeById(modeId, groups = MODE_GROUPS) {
  return allModes(groups).find((mode) => mode.id === modeId) || null;
}

export function variantsOf(parentModeId, groups = MODE_GROUPS) {
  return allModes(groups).filter((mode) => mode.variantOf === parentModeId);
}

export function validateCatalog(groups = MODE_GROUPS) {
  const modes = allModes(groups);
  const ids = modes.map((mode) => mode.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("duplicate mode id in catalog");
  }
  for (const mode of modes) {
    if (mode.variantOf && !ids.includes(mode.variantOf)) {
      throw new Error(`mode ${mode.id} declares unknown variantOf ${mode.variantOf}`);
    }
  }
  for (const group of groups) {
    if (group.parentModeId && !ids.includes(group.parentModeId)) {
      throw new Error(`group ${group.id} declares unknown parentModeId ${group.parentModeId}`);
    }
  }
  return true;
}
