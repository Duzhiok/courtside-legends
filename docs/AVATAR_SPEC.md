# 球员插画规格（`assets/avatars/`）

本地插画**优先于一切**：只要 `assets/avatars/<bref>.webp` 存在，这位球员所有赛季的卡、首页传奇墙都会用它，
盖过带署名的 Wikimedia 照片和程序生成的头像。没有插画的球员完全不受影响。

## 怎么加一张

1. 按下面的规格出图，命名为 `<bref>.webp`（球员 ID 见下表，也可以是 `.png` / `.jpg`），放进 `assets/avatars/`。
2. `node scripts/avatars/build-manifest.mjs` 生成清单（文件名写错、同一球员有两个文件会直接报错，不会悄悄不显示）。
3. `npm test`，再在浏览器里看**两处**：收藏页的圆形头像、首页的 4:5 传奇卡。

## 画面规格

| 项 | 要求 |
|---|---|
| 比例 / 尺寸 | **4:5 竖版**，推荐 1024×1280（最小 800×1000） |
| 格式 / 体积 | WebP 优先；**每张 ≤ 300 KB**（测试会检查） |
| 构图 | 头肩像。**脸的中心在距顶部约 35% 处、水平居中** |
| 安全区 | 头像在界面里是**圆形**，`object-fit: cover`、`object-position: center 18%`：脸必须在中间约 55% 宽、上半部 55% 高之内，肩膀放在下 35%，否则会被圆形裁掉 |
| 背景 | 纯色或简单渐变，别放复杂场景（缩到 28px 也要认得出人形） |
| **不要** | 任何文字、球衣号码文字、队徽、联盟标志、品牌标志、签名、水印 |
| 一致性 | 同一批请用**同一种画风和同一个提示词骨架**，这样一整墙是「一套」 |

## 提示词模板（按你的生图工具改）

```
Head-and-shoulders illustration of {name}, {era} NBA player, {team colours} plain jersey.
Stylised flat vector look, bold shapes, soft gradient background, not photorealistic.
Face centred at 35% from the top, shoulders at the bottom, 4:5 portrait.
No text, no numbers, no logos, no team marks, no watermark, no signature.
```

## 优先名单（球员 ID 已用名册核对过）

| ID | 球员 | ID | 球员 |
|---|---|---|---|
| `jordami01` | 迈克尔·乔丹 | `birdla01` | 拉里·伯德 |
| `abdulka01` | 贾巴尔 | `olajuha01` | 奥拉朱旺 |
| `onealsh01` | 奥尼尔 | `bryanko01` | 科比·布莱恩特 |
| `jamesle01` | 勒布朗·詹姆斯 | `curryst01` | 斯蒂芬·库里 |
| `jokicni01` | 尼古拉·约基奇 | `chambwi01` | 张伯伦 |
| `russebi01` | 比尔·拉塞尔 | `ervinju01` | 朱利叶斯·欧文 |
| `duncati01` | 蒂姆·邓肯 | `nowitdi01` | 诺维茨基 |
| `iversal01` | 阿伦·艾弗森 | `duranke01` | 凯文·杜兰特 |
| `antetgi01` | 字母哥 | `hardeja01` | 詹姆斯·哈登 |

前 9 个是首页传奇墙的人，现在用的是带署名的 Wikimedia 照片；放进插画后会被替换。

## 先看清楚的风险（我不是律师）

- **插画一位真实球员，用的仍然是他的肖像**。AI 生成解决的是「图片版权」，**不**解决「肖像权」和「球衣队徽商标」。
  本地自己玩没问题；**公开发布前**建议找专业人士看一眼。
- 生图工具的服务条款要允许商用；AI 纯生成的图在不少地区**不享有版权**，也就是别人也能拿去用。
- 留一份记录：用的工具、日期、提示词。被投诉时删掉对应文件、重跑第 2 步就行，其余不受影响。
- 提示词里**不要写**「长得像某某」这类描述真人五官的内容，只写姓名、年代、球衣配色。
