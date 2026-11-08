# ADR-008a 增补：My World 2.0 — 头像身份、我的家、Avatar Creator 2.0

状态：**PROPOSED（W1 / P0 已实现，其余待批准）**。本增补不改 ADR-008a 的决定，只把它的 N-1f 之后的工作排顺序。
范围硬约束：不改 GameSim；外观不改任何球员/生涯能力；Reborn 职业身份不动；不新增顶层模式；只用可再分发资源。

## 1. 审计事实（读代码得到，不是猜的）

| 项 | 现状 | 证据 |
|---|---|---|
| 个人主页头像 | 首字母剪影（`avatarDataUri({name, team:"NBA"})`），与 3D 形象无关 | `js/ui/myWorldView.js` `identityCardHtml` |
| 3D 形象 | 只在"我的形象"面板打开时挂载，关闭即销毁；换色用材质名 `Skin/Hair/Shirt/Pants` | `js/ui/avatar3d.js` |
| 外观数据 | `account.avatar = {skin,hair,outfit,style}`，**四个白名单字段**；访客一个本机 key | `js/data/avatarLook.js` |
| 模型 | `assets/avatar3d/man.glb`：**1 个蒙皮网格**、6 个材质（Shirt/Skin/Pants/Eyes/Socks/Hair）、31 骨骼、**0 个 morph target**、1852 三角面；自带 Idle / Clapping / Jump / Run / Sitting 等动画 | 直接解析 GLB JSON 块 |
| 来源/授权 | Quaternius，CC0（ADR-008a 记录来自 Poly Pizza 页面，**未逐项核对官网声明**） | `docs/ASSET_CREDITS.md` |
| 我的家 | 600×240 的 SVG 横条，物件位置写死 | `ROOM_SVG`（`myWorldView.js`） |
| 历史球星墙 | 不在 My World 面板里：它是首页 banner 的 `#home-legends-wall`，位于所有标签内容**下方**，所以 My World 标签下也会看到 | `index.html`、`homeShowcase.js` |
| 账号条 | 只有文字，无头像 | `refreshAccountHomeBar` |

**一个会咬人的约束：** `saveLook` 每次保存都会 `account.avatar = sanitizeLook(...)`，只保留四个字段。头像因此**必须放独立字段**，否则改一次发色就会把头像冲掉。

## 2. 里程碑（每个单独提交、单独验收）

| # | 任务 | 交付 | 状态 |
|---|---|---|---|
| W1 | **P0 头像身份统一** | 预设头像库 / 3D 形象截取头像 / 账号隔离持久化 / WebGL 缺失回退 / 个人主页 + 账号条 | 本次实现 |
| W2 | **P1 我的家** | 放大房间、移除球星墙（仅 My World 标签下）、编辑模式（拖动 / 保存 / 恢复默认 / 触控） | 待批准 |
| W3 | **P1 Creator 2.0 设计** | 见 §4；先审阅，批准后才碰 3D 模型 | 设计已写，待批准 |
| W4 | P2 个人照片上传 | 本机裁剪，默认私有；不上传 GitHub；不做人脸识别 | 待批准 |
| W5 | Future 自拍辅助 | 独立技术验证，必须用户确认、不存生物特征模板 | 研究项 |

ADR-008a 对应关系：W1/W3 属 N-1f（3D Avatar 垂直切片）的后续；W2 属 N-1 的 My Home；W4/W5 不在原 ADR 内，是新增。

## 3. W1 设计（已实现）

- **数据**：`account.avatarPortrait`（独立字段）；访客用 `cls_guest_portrait_v1`。
  `{source:"preset", preset:id}` 或 `{source:"3d", image:dataUrl, sig}`。
- **不信任存档**：预设 id 走白名单；`image` 必须是 `data:image/(png|jpeg|webp);base64,…` 且不超过 40KB，SVG / `javascript:` / 外链一律拒绝。
- **过期规则**：`sig` 是外观的签名。外观改了而头像还是旧外观，就**不再显示旧截图**，回退到预设；3D 查看器还开着时自动重新截取。
- **默认**：没选过时，按名字稳定哈希挑一个预设，所以不会再出现首字母剪影；真正失败才回退首字母。
- **预设**：6 个自绘 SVG 头像（肤色 × 发型 × 底色），自己生成，无版权问题。
- **截取**：`handle.capturePortrait()` 在同一任务内渲染并导出 128px JPEG（不需要 `preserveDrawingBuffer`）；WebGL 不可用时按钮不可用并说明原因，预设仍可选。
- **展示面**：个人主页身份卡、首页账号条。不碰 Reborn 的职业身份。

## 4. W3 — Avatar Creator 2.0 可行性评审（只设计，未改模型）

当前模型是"一个蒙皮网格 + 按材质涂色"。逐项评估：

| 目标 | 当前模型能否做 | 最小可行路径 | 美术工作 |
|---|---|---|---|
| 脸型 / 五官 | **不能**（无 morph，眼睛只是材质） | A. 换成带 morph 的 CC0 底模（需逐项核对许可）；B. 在 Blender 给现模型加 3–5 个 shape key；C. 只在**头像**层做 2D 脸部（不影响 3D） | B 约 3–5 个预设；A 需重做全部适配 |
| 发型 | 只有"显示/隐藏"一个 Hair 图元 | 在 Blender 做 4–6 个独立发型网格，运行时挂到头骨 | 4–6 个发型 |
| 体型 | **能做粗糙版**：骨骼缩放（肩、脊柱、四肢）+ 整体缩放，不需新资产 | 3 个体型预设；先做 spike 看蒙皮拉伸 | 无 |
| 视觉身高 | 能（整体缩放） | 同上 | 无 |
| 服装 | **不能**（衣服只是身体网格上的一块材质区域） | 现阶段只能给 Shirt 材质贴图案/号码（UV 待 spike 验证）；真正的服装要把 Shirt/Pants 从身体拆出来 | 拆分 + 3 种轮廓 |
| 球鞋 | 不能（只有袜子材质） | 新增鞋网格挂脚骨 | 2–3 双 |
| 动画 | **已有**（Clapping/Jump/Run/Sitting 可直接用作庆祝、坐下） | 无需新资产 | 无 |

结论：
1. **"重新涂一个网格 ≠ 换服装"**，Creator 2.0 的脸型、发型、服装三项**都需要美术资产**，纯代码做不到。
2. 免美术、可先做的只有：**体型预设（骨骼缩放）+ 视觉身高 + Shirt 图案/号码贴图 + 现有动画**。
3. 推荐垂直切片（批准后）：先做上面 2 的四项并截图验证；同时请美术/自己在 Blender 做 3 个发型 + 3 个脸型 shape key，作为第二个切片。不要一开始就上几十个滑块。
4. 体型/身高**只是外观**，不得影响 Reborn / My Team 的任何能力（单测会锁住这一点）。

## 5. 待你决定

| # | 问题 | 我的建议 |
|---|---|---|
| Q1 | W1 通过后先做 W2（我的家）还是 W3（Creator 垂直切片） | 先 W2：不依赖美术资产，收益立刻可见 |
| Q2 | Creator 的脸/发/服装资产谁来做 | 需要你定：自己 Blender、外包，还是换底模；我不会在没有资产时假装能做 |
| Q3 | 头像默认策略 | 按名字稳定挑预设（已实现） |
| Q4 | 访客是否可以截取 3D 头像 | 可以，存在本机 key，登录后不自动搬家（与外观一致） |
| Q5 | 球星墙只在 My World 标签下隐藏，还是整页只留首页 banner | 只在 My World 标签下隐藏 |
