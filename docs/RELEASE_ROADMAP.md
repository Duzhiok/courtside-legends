# 发行路线图(Release Roadmap)—— 平台、里程碑、Action Item

本页是「场边传奇 / Courtside Legends」从本地玩具项目走向"能让别人玩到"的总体规划,持续更新。

**和其他文档的分工**:
- `docs/TASKS.md` —— 游戏本身的 feature/bug 任务清单(排位、交易、技能这些)
- `docs/MOBILE_APPS.md` —— Capacitor 打包 Android/iOS 的**技术操作手册**(怎么编译、怎么签名)
- **本页(`docs/RELEASE_ROADMAP.md`)** —— "要不要上架、上哪、先上哪个、花不花钱"的**决策和进度**

---

## ⚠️ 前置风险(所有阶段都要先过这关,不分平台)

这个项目用的是**真实 NBA 球员的真名、真实历史数据、真实照片**。公开发布到任何平台(哪怕是免费
的 itch.io,不只是 App Store/Google Play)都有肖像权(right of publicity)+ NBPA 授权风险,
跟交不交上架费没有关系——免费平台一样可能被投诉下架。

详细分析见 `docs/MOBILE_APPS.md` 的「⚠️ 上架前必须想清楚的事」一节,这里不重复,只列结论:

- **私下发布(发链接/发安装包给朋友,不公开商店列表)**:零法律风险,随时可以做。
- **公开发布到任何平台**:在真正点"发布"按钮前,必须明确接受这个风险,或者先做"虚构球员"模式
  再公开。这是本路线图所有阶段的前置闸门,不是走完阶段 1 才需要考虑的事。

---

## 平台对比(已按这个项目的实际技术栈重新核实,不是抄通用模板)

| 平台 | 费用 | 这个项目适配度 | 为什么 |
|---|---|---|---|
| **浏览器直链 / itch.io** | $0 | 🟢 最高 —— 已经是网页,不用"导出" | 游戏本体就是 `index.html` + `css/js/assets`,能跑在任何浏览器,itch.io 直接上传整个文件夹即可,不需要额外工程 |
| **PWA(iOS Safari "添加到主屏幕")** | $0 | 🟢 很高 —— 唯一能让 iPhone 用户免审核、免年费玩到的路 | 浏览器游戏天然支持,只需加一个 `manifest.json` + 图标,不需要 Xcode、不需要 Apple 账号 |
| **Google Play** | $25 一次性 | 🟢 高 —— 技术已跑通 | Capacitor Android 工程已验证能编译出 APK(今天实测成功),只差注册账号和正式签名这步 |
| **Apple App Store** | $99/年 | 🟡 中 —— 技术已跑通,但审核+年费门槛高 | iOS 模拟器构建今天也已实测成功,但正式上架需要付费账号 + 人工审核,建议等前几个阶段验证完用户需求再做 |
| **Steam** | $100(营收满 $1000 可退) | 🔴 低,非当前目标 | 这是给 PC 可执行文件游戏的,现在这个项目没有桌面安装包;如果真想做,需要另外套 Electron/Tauri 壳子,属于全新工作量,不在当前范围 |
| ~~Godot 多平台导出~~ | — | ❌ 不适用 | 这个项目不是 Godot 项目,以上提到 Godot 的建议对这里不成立,记录在此是为了避免以后又照抄一遍模板 |

---

## 分阶段计划

### 阶段 0 —— 技术验证(已完成)

- [x] Capacitor 壳子搭建(`@capacitor/core` `@capacitor/android` `@capacitor/ios`)
- [x] `mobile/www` 同步脚本,只打包运行时文件(~11MB),不含 `node_modules`/`tests`/`docs`
- [x] 联机对战 URL 默认值修复(手机 App 不会再悄悄连一个不存在的 `localhost`)
- [x] Android:命令行搭建 SDK(platform-tools + android-36 + build-tools 36),`./gradlew assembleDebug`
      编译出 `app-debug.apk`(12MB)
- [x] iOS:激活完整 Xcode(26.6),解决 Swift Package Manager 在公司网络下载 Capacitor 二进制框架被拦
      403 的问题(用 `~/.swiftpm/configuration/mirrors.json` 把远程 URL 镜像到本地 HTTP 服务器),
      `xcodebuild ... -sdk iphonesimulator build` 跑出 **BUILD SUCCEEDED**
- [x] 全量测试 926/926、lint 0 错误,这轮改动没碰游戏逻辑

### 阶段 1 —— 零成本发布($0,现在就能做)

- [ ] **法务决策**:明确这一轮发布走"私下分享"还是"公开但接受肖像权风险"——这是阻塞项,
      没想清楚之前不要点"公开发布"
- [ ] itch.io 建项目页,HTML5 游戏类型,直接上传网页文件(确认 `index.html` 相对路径在 itch.io
      的沙箱 iframe 里正常工作,itch.io 对 HTML5 游戏有自己的打包/路径要求,需要实测一次)
- [ ] 加 `manifest.json` + 图标,支持 iOS Safari "添加到主屏幕"的 PWA 体验(不需要 App Store)
- [ ] (可选)itch.io 同时挂 Android APK 直接下载链接,作为 Google Play 之外的免审核安装方式
- [ ] 验证:手机浏览器打开能正常玩、添加到主屏幕后图标/全屏效果正常、无横向溢出

### 阶段 2 —— Google Play($25 一次性,建议在阶段 1 有初步反馈后再做)

- [ ] 注册 Google Play 开发者账号
- [ ] 生成正式签名 keystore(**备份好,丢了无法恢复**)
- [ ] `Build → Generate Signed Bundle`,产出 `.aab`
- [ ] 应用图标/启动图美术(占位图标需要换掉,`npx capacitor-assets generate` 可以从两张原始图
      自动生成全部尺寸)
- [ ] 内容分级问卷、数据安全表单、隐私政策页面(这个项目本地存档、默认不联网,大概率能填"不收集数据",
      但要亲自确认一遍)
- [ ] 先上 Internal testing 轨道验证,再推 Production

### 阶段 3 —— Apple App Store($99/年,延后,等前面阶段验证完用户需求再决定)

- [ ] 注册 Apple Developer Program
- [ ] 正式签名 + `Product → Archive` + 上传 App Store Connect
- [ ] 先上 TestFlight(最多 100 人,免审核)内测
- [ ] 提交 App Review

### 阶段 4 —— 可选/非当前目标

- [ ] Steam(需要先做桌面壳子,Electron/Tauri,属于新工程,暂不排期)
- [ ] itch.io 捐赠功能,给免费游戏加一个自愿付费入口

---

## 当前状态快照

| 项 | 状态 |
|---|---|
| 当前所在阶段 | 阶段 0 已完成,阶段 1 尚未开始 |
| 法务风险决策 | ⏳ 未定,阻塞所有"公开发布"动作 |
| Android 技术就绪度 | ✅ 可编译出 APK |
| iOS 技术就绪度 | ✅ 可编译模拟器版本,真机/正式签名未验证 |
| itch.io / PWA | ⏳ 未开始 |
| Google Play 账号 | ⏳ 未注册 |
| Apple Developer 账号 | ⏳ 未注册 |

---

## 进展日志(append-only,最新的在最下面)

- 创建本文档。来源:用户贴了一份"独立游戏零预算发行路线"的通用建议(itch.io/Google Play/Steam/
  Apple 对比 + Godot 多平台导出思路),经过核对后确认核心省钱逻辑成立,但 Godot 相关细节不适用于
  本项目(本项目是 Capacitor 包装的纯网页游戏,不是 Godot 工程)。已把"PWA 免费上 iPhone"这条
  建议本身没提到、但对本项目特别适用的路径补充进来。阶段 0(技术验证)已在今天的会话中实测完成:
  Android APK 编译成功、iOS 模拟器 BUILD SUCCEEDED。下一步:阶段 1 的法务决策 + itch.io 实测。
