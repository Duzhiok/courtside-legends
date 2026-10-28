# 打包成 Android / iOS App，然后怎么上架

本页记录「场边传奇 / Courtside Legends」怎么从一个纯前端网页（`index.html` + `css/` + `js/` +
`assets/`，零构建、零框架）变成真的 Android / iOS 应用，以及接下来上架两个商店要走哪些步骤。

**先看最重要的一条，再往下看技术步骤** ↓↓↓

## ⚠️ 上架前必须想清楚的事：真实球员的名字/数据/照片

这个游戏用的是**真实 NBA 球员的真名、真实历史数据、真实赛季卡，还有部分球员的真实照片**（见
`js/data/photoCredits.js`、`docs/AVATAR_SPEC.md` 的来源说明）。这件事在你自己电脑上本地玩、或者
发给朋友装在他们手机上玩，完全没问题——这就是现在这个仓库一直在做的事。

但如果你想**公开上架到 App Store / Google Play 的公共商店列表**（任何人都能搜到、下载），这就不只是
技术问题了：

- NBA 球员的姓名、肖像、数据在商业产品里受**肖像权（right of publicity）**和 **NBPA 集体授权**保护。
  2K、EA 这些公司每年要付真金白银给 NBA/NBPA 买这个授权。
- Apple 和 Google 的商店审核条款都明确禁止「未经授权使用第三方商标/肖像」。真被举报，轻则下架，
  重则收到律师函。
- 这和「游戏引擎抓取的是维基公共领域照片」没关系——球员姓名和数据本身就是被保护的，照片许可证只解决
  版权问题，解决不了肖像权问题。

**这不是在吓唬你，是实话。** 你现在有三条路，我建议按顺序考虑：

1. **私下发布，不上公共商店**（推荐，零法律风险，技术上今天就能做到）：
   - Android：直接把 APK 文件发给朋友，让他们在手机设置里允许「未知来源安装」，不用上 Google Play。
   - iOS：用 Xcode 直接装到你自己的 iPhone（免费 Apple ID 就行），或者用 TestFlight 的
     **内部测试**（最多 100 人，不用公开审核，不用上架）。
   - 这条路今天就能走完，下面的技术步骤全部适用。
2. **真去谈 NBA/NBPA 授权** —— 对个人开发者基本不现实（起步费用和流程都是给工作室、联盟级别准备的），
   但如果你认真想商业化，这是唯一干净的路。
3. **重新设计成「虚构球员」模式再公开上架** —— 保留数值引擎、重新生成姓名和头像，工程量不小，
   但能完全绕开肖像权问题。

本页下面的「打包」部分三条路都适用；「上架到公共商店」部分默认你已经想清楚了版权问题（或者只是先在
内部测试阶段跑通流程）。

## 这次做了什么（已完成，在仓库里）

项目是纯 ES Module 的静态页面，没有打包器，所以选了 **Capacitor**（不是 React Native 重写）——
它把现有网页原样装进一个原生 WebView 壳子里，改动量最小，公司级作品（Instagram 的部分页面、Ionic
的所有应用）都在用。

- `npm install` 新增了 `@capacitor/core` `@capacitor/cli` `@capacitor/android` `@capacitor/ios`
  （v8.6.0，iOS 这版默认用 Swift Package Manager，不需要装 CocoaPods，省一道坎）。
- `capacitor.config.json`：`appId: com.courtsidelegends.app`，`appName: Courtside Legends`。
  **`appId` 建议你改成自己的域名反写**（比如你有 `yourname.com` 就用 `com.yourname.courtsidelegends`），
  这个值在两个商店里都是唯一标识，后面改起来比较麻烦，越早定下来越好。
- `scripts/mobile/sync-www.mjs`：只把真正运行需要的文件（`index.html` `online.html` `css/` `js/`
  `assets/`，约 11MB）复制到 `mobile/www/`，不会把 `node_modules`、`.git`、`docs/`、`server/`、
  `tests/`（仓库总共 154MB）一起塞进 App 包。
- `android/`、`ios/` 两个原生工程目录——**这两个要提交到 git**（Capacitor 官方惯例：里面有图标、
  权限这些没法从 `cap add` 自动重新生成的工程配置）。`mobile/www/`、`android/local.properties`、
  `ios/App/Pods/` 这些机器相关/可重新生成的产物已经加进 `.gitignore`。**注意**：Capacitor 自己生成的
  `android/.gitignore` 和 `ios/.gitignore` 还会把 `android/app/src/main/assets/public/`
  和 `ios/App/App/public/`（真正装网页代码的地方）也排除了——这是官方惯例，把它们当作构建产物。
  **所以别直接双击打开 `.xcodeproj`/`android` 文件夹**，先跑一次下面的 `npm run mobile:android`/
  `npm run mobile:ios`（它们内部会先自动调一次 `mobile:sync` 把网页代码写进去，否则应用启动会是一块白屏）。
- `package.json` 新增命令：
  ```bash
  npm run mobile:sync-web   # 只重新复制网页文件到 mobile/www
  npm run mobile:sync       # 复制 + npx cap sync（同步进 android/ 和 ios/ 工程）
  npm run mobile:android    # 同步后用 Android Studio 打开 android/ 工程
  npm run mobile:ios        # 同步后用 Xcode 打开 ios/App/App.xcodeproj
  ```
- **顺手修了一个会在手机上直接炸掉的 bug**：联机对战页 `online.html` 原来服务器地址默认值写死
  `ws://localhost:3001`。在你电脑本地用 `python scripts/serve_nocache.py` 开发时这是对的（真有本地
  服务器）；但打包成 App 之后，页面跑在 `https://localhost` 或 `capacitor://localhost` 这种安全上下文
  里，`localhost` 指的是手机自己、根本没有服务器在监听，而且 iOS/Android 默认直接拦截「安全页面发起
  不加密 ws:// 连接」（混合内容策略）。现在改成：只有真的在 `http://` 本地开发环境下才预填
  `ws://localhost:3001`，其它情况（手机 App、正式 https 部署）留空并提示「请先填写服务器地址
  （wss://你的域名）」，不会再对着一个根本不存在的服务器悄悄失败。
  - **这意味着：手机 App 里的联机对战功能，需要你自己先把 `server/online-server.mjs` 部署到一台
    有公网域名 + HTTPS 证书的服务器上（`wss://`），然后在 App 里手动填这个地址。** 单机模式
    （排位赛、职业经理、穿越生涯等）完全不受影响，不需要任何服务器。
- 全量测试 926/926、lint 0 错误——这轮改动没碰游戏逻辑，只碰了打包壳子和那一处 URL 默认值。

## 本机环境检查结果（跑手机 App 之前要知道的事）

| 需要的工具 | 这台 Mac 现状 |
|---|---|
| Node / npm | ✅ 已有 |
| Android Studio | ✅ 已安装，但**还没第一次启动过**，Android SDK 还没下载 |
| Xcode（完整版，不是命令行工具） | ❌ 没装，只有 Command Line Tools，**打不了 iOS 包** |
| CocoaPods | 不需要（这版 Capacitor 用 SPM） |
| Java | ✅ OpenJDK 21，够用 |

Gradle 第一次跑的时候要联网下载构建工具和 Gradle 本体，这边沙箱环境的网络把
`services.gradle.org` 这类域名挡掉了，所以我这边没法帮你跑通「真的点一下编译出 APK」这最后一步——
但这是沙箱限制，你自己的 Mac 上网络正常，不会有这个问题。

## 下一步：你需要做的（必须在真机 GUI 里做，我没法远程代劳）

### Android 这边

1. 打开一次 Android Studio（在「应用程序」里点开，不是命令行），走一遍首次启动的 SDK 安装向导，
   它会自动把 `~/Library/Android/sdk` 建好。
2. 之后就能用：
   ```bash
   npm run mobile:android
   ```
   这会打开 Android Studio，加载 `android/` 工程。点右上角绿色三角「运行」，选一个模拟器
   （Android Studio 自带模拟器管理器可以新建一台虚拟手机）或者用数据线接真手机（手机上开「开发者
   选项 → USB 调试」）。
3. 想要调试时能用桌面 Chrome 看 console：`chrome://inspect` 能直接连上手机里跑的 WebView。

### iOS 这边

1. 去 Mac App Store 装 **Xcode**（完整版，不是命令行工具，下载比较大，几个 GB 起步，预留点时间）。
2. 装完之后：
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   npm run mobile:ios
   ```
   这会用 Xcode 打开 `ios/App/App.xcodeproj`。左上角选一台模拟器（比如 iPhone 15），点左上角
   播放按钮直接跑。
3. 想装到自己的真 iPhone：Xcode 里选中项目 → `Signing & Capabilities` → 登录你自己的 Apple ID
   （免费账号就行，不用付 99 刀）→ 选「Automatically manage signing」。接上数据线，选中你的手机作为
   运行目标，点播放，手机上会提示「信任此电脑/开发者」，点一下就能跑了（限制：免费账号装的 App
   7 天后要重新连电脑装一次，这是 Apple 的免费开发者限制，不是我们的问题）。

## 应用图标和启动图

Capacitor 默认塞了个占位图标（Capacitor 自家 logo），正式发布前要换成你自己的。不用一张张尺寸手做，
用官方工具一键生成全部尺寸：

```bash
npm install --save-dev @capacitor/assets
```

准备两张图放进 `resources/`（这个目录现在还没建，工具会告诉你确切要求）：
- `resources/icon.png` —— 1024×1024，纯图标，不要自带圆角/阴影（商店会自己裁）。
- `resources/splash.png` —— 2732×2732，启动画面，建议居中放 logo，四周留白（避免不同屏幕比例裁切）。

然后：

```bash
npx capacitor-assets generate
```

会自动生成 Android 全部 mipmap 尺寸和 iOS 全部 `.appiconset`/`LaunchScreen` 资源，再跑一次
`npm run mobile:sync` 让它们进到两个原生工程里。

## 上架到 Google Play（Android）

1. **注册 Google Play 开发者账号**：https://play.google.com/console/signup ——一次性 **25 美元**，
   需要身份验证，一般几小时到 2 天通过。
2. **生成正式签名**（和调试签名不是一回事，调试签名不能提交到商店）：
   ```bash
   keytool -genkey -v -keystore courtside-release.keystore \
     -alias courtside -keyalg RSA -keysize 2048 -validity 10000
   ```
   **这个 keystore 文件和密码要备份好、不要丢、不要提交到 git**——丢了就再也不能给同一个 App
   发更新了，Google 不认回收。建议存进密码管理器或者加密硬盘。
3. 在 `android/app/build.gradle` 配置用这个 keystore 签名（Android Studio 里
   `Build → Generate Signed Bundle / APK` 走向导更省事，照着填 keystore 路径和密码就行）。
4. 生成正式包：Android Studio 里选 `Build → Generate Signed Bundle / APK`，选 **Android App
   Bundle（.aab）**（Google 现在要求新 App 必须用 aab，不再收独立 apk）。
5. 去 [Google Play Console](https://play.google.com/console) 建一个新应用：
   - 应用名称、默认语言、应用/游戏分类（这个显然该选「游戏」）。
   - **内容分级问卷**：诚实填，涉及体育竞技、无暴力无色情，一般能拿到较低年龄分级。
   - **数据安全表单**：说明 App 收集什么数据——这个 App 所有存档都在手机本地 `localStorage`，
     没有账号系统、没有上传任何数据到你控制之外的服务器（除非用户自己开了联机对战连自己的服务器），
     如实填「不收集用户数据」大概率是对的，但你应该自己过一遍确认。
   - **隐私政策 URL**：Google 强制要求，哪怕是「我们不收集任何数据」这种一段话的页面也得有个公开链接
     （可以直接挂在 GitHub Pages 或者仓库的 `docs/` 里）。
   - 上传 `.aab`，填商店listing：至少 2 张手机截图、一张 1024×500 的 feature graphic、简短/完整
     应用描述、图标。
6. 先发 **内部测试（Internal testing）轨道**——不用等审核，几分钟内自己的测试账号就能装。确认没问题
   再推 **生产（Production）轨道**，这次才会真正进入公开审核（一般几小时到几天）。

## 上架到 App Store（iOS）

1. **注册 Apple Developer Program**：https://developer.apple.com/programs/enroll/ —— **每年 99
   美元**，个人或公司都行，身份验证通常当天到几天。
2. 在 [App Store Connect](https://appstoreconnect.apple.com) 创建新 App：
   - Bundle ID 要和 `capacitor.config.json` 里的 `appId` 一致。
   - 同样要填**隐私政策 URL**、**隐私「营养标签」问卷**（iOS 这边叫 App Privacy，问的也是你收集
     什么数据——这个 App 本地存档、不联网上传的情况下大概率全选「不收集」）。
   - 年龄分级问卷。
3. Xcode 里：项目设置 → `Signing & Capabilities` → 选你的付费开发者 Team → 打开
   `Automatically manage signing`。
4. `Product → Archive` 打正式包，Xcode Organizer 里点 `Distribute App → App Store Connect`
   直接上传（不用手动用 Transporter，新 Xcode 都走这条路）。
5. 建议先发 **TestFlight 内部测试**（最多 100 人，不用公开审核，几分钟到几小时生效）跑一遍真机
   冒烟测试，确认没问题后在 App Store Connect 里提交 **App Review**——人工审核，一般 24–48 小时，
   节假日会更慢。审核被拒也很常见，通常给具体原因，改完重交就行。

## 两边费用对比

| | Google Play | App Store |
|---|---|---|
| 开发者账号 | 一次性 $25 | 每年 $99 |
| 审核方式 | 自动化为主，偶尔人工 | 人工审核，通常 1-2 天 |
| 需要的电脑 | 任意装了 Android Studio 的机器 | **必须是 Mac**（装 Xcode） |
| 测试发布 | Internal testing 轨道 | TestFlight（内部测试免审核） |

## 我做了 vs. 你需要做

**我（code agent）已经做完的：**
- 整个 Capacitor 打包壳子、两个原生工程、同步脚本、npm 命令。
- 修复了联机对战在手机/正式环境下会默认连一个不存在的 `localhost` 服务器的 bug。
- 验证了 `npm run mobile:sync` 全流程跑通（复制 → 两个原生工程都正确收到最新网页代码）。
- 全量测试 926/926、lint 干净，这轮改动没碰任何游戏逻辑。

**只有你能做的（需要账号、付款、真机 GUI，我这边工具调不到）：**
- 想清楚上面那条 ⚠️ 肖像权的事，决定走哪条路。
- 装完整版 Xcode（Mac App Store，几 GB，需要你的 Apple ID 登录）。
- 打开一次 Android Studio 走 SDK 安装向导。
- 注册 Google Play / Apple Developer 账号（需要你自己的身份信息和付款方式）。
- 生成并**妥善保管**签名证书/keystore（丢了没法找回）。
- 在两边后台填商店信息、截图、隐私政策、提交审核。
- 准备正式的 App 图标/启动图美术（`resources/icon.png` + `resources/splash.png`，工具能自动生成
  全部尺寸，但原始美术得你出）。

把以上账号/证书这些准备好之后，技术部分（打包、同步、构建）随时可以回来找我继续跑完。
