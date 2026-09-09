# Native / Desktop / Release 边界审查

审查标识：2026-09-05；实际验证延续至 2026-09-06（Asia/Shanghai）。起点及交接时 HEAD：`46ff23c`，所有修改均未提交。

## 结论与范围

- 当前真实产品路径是 **Capacitor Android + Electron / Node Windows 包**。`src-tauri/` 是未接入当前发布链的历史壳，已据实标注，未添加权限或尝试“修通”历史框架。
- 本子任务主动修改的项目文件只在 `android/`、`electron/`、`scripts/`、`src-tauri/` 及本报告。没有修改 `src/`、根 `package*.json`、其他 docs 或 `.github`。没有 branch、commit、push、账号/凭据操作、设备安装或刷机。
- 使用 systematic-debugging → 可复现 RED → 最小修复 → GREEN，并按 error-handling 检查拒绝、清理和异步失败；完成前采用 verification-before-completion。没有用关闭沙箱、降低 Web 安全、扩大 Android 权限或吞掉测试失败来换取通过。
- 网络上游全部由测试桩替代；真实 HTTP 测试只绑定 `127.0.0.1` 的临时端口并关闭。没有访问已登录浏览器，没有发出真实第三方写请求。Windows 归档实测只操作测试夹具文本；没有运行安装器或真实浏览器。
- 最终验证：**32 个 Node 测试、15 个 JVM 边界测试**；Android debug APK 离线编译/封装及 APK v2 签名验证通过。设备行为、完整 Windows 启动/安装、最终应用层同步后的发布包仍未验证。

仓库根目录为 `<repo-root>`。本报告清单中的相对路径均以此为根。

## 已读文件清单

### 基线范围内的 48 个跟踪文本/配置文件

逐文件读完以下文件；没有把 PNG、Gradle wrapper 二进制/启动模板或构建输出当作第一方实现审查。部分配置本身是 Capacitor 生成文件或模板，仍检查其实际约束，但不宣称为原创代码。

```text
android/.gitignore
android/app/.gitignore
android/app/build.gradle
android/app/capacitor.build.gradle
android/app/proguard-rules.pro
android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java
android/app/src/main/AndroidManifest.xml
android/app/src/main/java/com/beid/app/BeidDanmakuView.java
android/app/src/main/java/com/beid/app/BeidFocusBootReceiver.java
android/app/src/main/java/com/beid/app/BeidFocusNotificationPlugin.java
android/app/src/main/java/com/beid/app/BeidFocusNotificationReceiver.java
android/app/src/main/java/com/beid/app/BeidNativePlayerPlugin.java
android/app/src/main/java/com/beid/app/BeidShareIntentPlugin.java
android/app/src/main/java/com/beid/app/CrashReporter.java
android/app/src/main/java/com/beid/app/MainActivity.java
android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml
android/app/src/main/res/drawable/ic_launcher_background.xml
android/app/src/main/res/layout/activity_main.xml
android/app/src/main/res/layout/beid_native_player.xml
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
android/app/src/main/res/values/ic_launcher_background.xml
android/app/src/main/res/values/strings.xml
android/app/src/main/res/values/styles.xml
android/app/src/main/res/xml/file_paths.xml
android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java
android/build.gradle
android/capacitor.settings.gradle
android/gradle.properties
android/gradle/wrapper/gradle-wrapper.properties
android/settings.gradle
android/variables.gradle
electron/desktop-server.mjs
electron/main.mjs
scripts/beid-icon-fg.svg
scripts/build-android-debug-apk.mjs
scripts/build-windows-desktop.mjs
scripts/build-windows-portable.mjs
scripts/pack-electron-win.mjs
scripts/setup-android-sdk.mjs
scripts/verify-cross-viewport.mjs
src-tauri/Cargo.toml
src-tauri/README.md
src-tauri/build.rs
src-tauri/package.json
src-tauri/src/main.rs
src-tauri/tauri.conf.json
src-tauri/tauri.config.js
```

### 补充读取与排除

- 完整只读：根 `package.json`、`capacitor.config.ts`；`android/local.properties` 的 SDK 路径；已生成的 `android/app/src/main/assets/capacitor.config.json`、`capacitor.plugins.json`、`android/app/src/main/res/xml/config.xml`。
- 只为应用层契约定位、未重复全面审查/修改：`src/lib/bilibili/nativeShareIntent.ts`（全文）、`src/lib/bilibili/nativeMediaPlayer.ts`（接口/初始化部分及检索）、`src/features/bilibili/BilibiliPlayerView.tsx`（原生状态回调片段）、`src/lib/bilibili/httpAdapter.ts`、`src/lib/bilibili/mediaHostPolicy.ts` 及通知/分享相关引用（检索）。
- 第三方接口参考，非第一方代码覆盖：`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/{BridgeActivity,Bridge,Plugin,JSObject}.java` 的生命周期/通知/API 片段；`node_modules/electron/electron.d.ts` 的权限回调定义。
- 读取本次新增的测试、测试工具与发布公共模块；完整路径见后面的“全部改动路径”。读取构建测试结果 XML、APK 输出元数据、合并 Manifest；只枚举 APK 压缩条目而未接触设备数据。
- 已加载 using-superpowers（独立子任务豁免完整启动仪式）、systematic-debugging、test-driven-development、testing-anti-patterns、error-handling、security-best-practices、verification-before-completion。范围内及父级未发现额外 AGENTS.md；遵循用户提供的 ECC/写范围指令。
- 排除作者归属：所有 PNG；`android/gradlew`、`android/gradlew.bat`、`android/gradle/wrapper/gradle-wrapper.jar`；`node_modules/`、Gradle/SDK 缓存、Capacitor/Cordova 生成库、`assets/public` 的打包 JS、既有 `dist/` 和 `release/`。这些不是本次第一方源文件审查的替代品。

## 实际问题与修复

严重性针对本地应用威胁模型，不意味着这些服务暴露于公网。复现请求均使用虚构 Cookie、文本和域名，不使用真实账户。

### N01 — 高：桌面代理可逃出固定上游并转发 Cookie

`new URL(rest, targetOrigin)` 接受 `//host/path`；请求 `/bili-api//127.0.0.1:9/private` 可变更上游。前缀匹配也接受不属于路由的附加文本；媒体/API 的 `redirect: follow` 不检查后续目的地。若调用方带 `x-beid-cookie`，原实现会把它放入被替换目的地的请求。

修复 `electron/desktop-server.mjs:73`：固定 origin + 仅赋值 pathname/search；准确路由边界；拒绝协议相对路径/反斜杠、用户信息和非默认端口；最多 5 次手动重定向，每跳重新验证。API 重定向不能离开其固定 origin，CDN 只能在既有媒体白名单内跳转。保留正常 Range/206 与合法 CDN 跳转，不以全禁代理取代修复。

### N02 — 高：本地服务缺少来源边界，代理文档继承应用来源

原实现未检查 Host/Origin/Fetch Metadata，可被异源页面或 Host 重绑定方式调用；上游 HTML 被原样作为应用来源文档返回。已要求精确 loopback authority、同源 Origin/Referer，拒绝 cross-site；不添加宽松 CORS。代理响应增加 `default-src 'none'; sandbox`，避免代理导航文档获得应用来源能力。无 Origin 的本地 HTTP 客户端仍可调用，不宣称具有本地进程认证。

### N03 — 高：静态文件 junction 穿透、残留隐藏文件外泄

原 safeJoin 只验证字符串路径。`dist/linked` 指向夹具外部私密目录时可读出文本；已有 `dist/.env` 也会被直接返回。修复 `electron/desktop-server.mjs:218`：实际路径包含性检查、隐藏路径拒绝、非法编码作为 400，保留正常 SPA fallback。静态目录仍必须由可信安装/构建流程控制；不声称解决恶意本地写入者的所有 TOCTOU/hard-link 场景。

### N04 — 中：请求体、错误与登录响应边界不完整

原代理省略 POST Content-Type，可能使表单请求失效；请求体无限累积；Cookie 名过滤未锚定，`prefixSESSDATA` 也会被带回。修复为保留 Content-Type、1 MiB 请求体上限、请求取消处理、上游响应头等待超时、明确 400/403/405/413/502，以及精确 Cookie 名匹配。意外错误只记录类别/代码，不记录 Cookie。

### N05 — 高：Electron 窗口、外部协议和权限缺少约束

原 `startsWith('http://127.0.0.1')` 会允许 lookalike 新窗口，其他 URL 不分协议交给 OS；没有主框架导航/重定向防护或权限处理器。`electron/main.mjs:71` 现在拒绝创建新窗口，内部地址在原窗口加载，仅 HTTP(S) 外链交给 shell；阻止外部主框架导航、重定向和 webview 附加。保持 sandbox/contextIsolation、禁用 Node integration；敏感权限默认拒绝，仅本应用主框架可申请通知/全屏。测试使用 Electron API 桩，未真的调用外部协议处理器。

### N06 — 中：随机端口使桌面持久存储来源随启动改变

Electron 原来每次监听随机端口，localStorage/IndexedDB 来源因端口变化而隔离。现在固定 `127.0.0.1:4173`，端口被占用则显示启动失败并退出，不打开占用该端口的其他服务。不会自动读取/迁移历史随机端口或默认浏览器资料目录。迁移/导出要求见交接契约。

### N07 — 中：Android 提醒 hash 冲突与恢复路径失败

`"Aa"` 与 `"BB"` 有相同 String.hashCode，原 PendingIntent 无 data，排程/取消会碰撞，通知 int ID 也会覆盖。修复 `BeidFocusNotificationPlugin.java:221` 与 `BeidFocusNotificationReceiver.java:37`：完整 ID 的 URI 参与 PendingIntent identity，通知使用完整 tag，打开 Intent action 也区分 tag；取消/重排兼容移除旧 hash-only alarm，并避免取消时 UPDATE_CURRENT 改写内容。

恢复现在按提醒隔离异常，失败项保留以便重试，后续项继续；过期项清理 title/reason/time；启动时重试恢复，增加系统 `MY_PACKAGE_REPLACED` 恢复入口。仍不在锁屏未解锁阶段承诺 credential-protected preferences 可用，不补发已过期提醒，也不保证 OEM 精确时间交付。

### N08 — 中：通知权限与系统设置操作虚报成功

原 Android 33 以下始终声称通知允许，且系统设置 Activity 启动失败被吞掉。现在查询全局通知开关、频道状态及运行时权限；设置启动失败通过 PluginCall.reject 返回。没有增加任何 uses-permission。实际 OS 对话框和通知频道行为仍需设备验证。

### N09 — 中：分享类型不符合 Android EXTRA_TEXT 契约

原 getStringExtra 不接受合法 CharSequence 分享；畸形 extras 抛异常可越过插件进入 Activity 生命周期。现在读取 CharSequence 并安全转为文本，对 RuntimeException 记录/丢弃，不将任意异常传播为 Activity 崩溃。

反证：Capacitor BridgeActivity.load 本身会调用 onNewIntent(getIntent())，所以没有把“冷启动从不派发分享”误报为缺陷。既有 retained event + pendingText 双通道不擅自改协议，应用层仍负责去重。

### N10 — 中：原生播放器超时、READY、同步失败和销毁竞态

- READY 回调原来无条件 play，暂停后 seek/重新缓冲也会自行恢复播放；移除该强制 play，open 的 playWhenReady 保持初次自动播放契约。
- open 超时原来只 reject，播放器仍可能稍后出声；现在停止并隐藏原生表面，再恰好一次结束 pending call。
- prepare 同步异常原来遗留 pendingOpenCall；现在立即清理，避免之后第二次 resolve/reject。
- player.release 抛异常原来导致字段及 SimpleCache 不释放；现在先断开字段/视图引用，finally 链保证 cache 清理。
- ticker 原来把 ended/failed/idle 覆盖成 paused；现在仅在 READY 时发送周期性播放/暂停状态。

证据：`BeidNativePlayerPlugin.java:81`、`:291`、`:497`、`:577`；真实生产方法 + mock Android/Media3 的 JVM 调用，不是仅检查源字符串。

### N11 — 中：Windows 便携包布局错误与启动竞态

原 server 被复制到 `app/desktop-server.mjs`，但相对查找的是 `../dist`，实际资源却在 `app/dist`，新解压包无法找到入口。现在保留 `app/electron/desktop-server.mjs` + `app/dist` 的源码布局，夹具打包后真实启动其服务器验证。

原启动器固定 sleep 800 ms，不管 bind 是否成功就打开 4173。新 `electron/portable-launcher.mjs` 等待成功监听，失败绝不启动浏览器。运行时用独立浏览器资料目录，拒绝退回默认已登录资料目录。后台 spawn 隐藏，退出/失败清理服务；VBS 加 UTF-16 BOM，CMD 使用 ASCII `launch.vbs` 别名。实际 Edge/Chrome 进程生命周期仍需用户授权验收。

### N12 — 中：发布脚本可打旧代码、混入私密文件或误删链接目标

- 原 wrapper 只在 dist 不存在时 build，现正常入口总是重新 build，子脚本直接执行也 build；仅内部 `--prepared` 表示调用者已完成构建。
- 版本由根 manifest 只读取得并验证，不再固定写 0.3.0。
- `release-utils.mjs:85`、`:98` 对 Web payload 和 Electron runtime 文件/目录做 fail-closed 白名单检查，拒绝隐藏文件、任意 JSON、旧 resources/app/profile、未知文件和链接。不是静默过滤后声称安全，也不是完整的代码内容密钥扫描。
- 递归 reset 前验证 release 子路径与 symlink/junction 父链；夹具证明旧脚本会破坏链接指向目录，新脚本拒绝且保留内容。
- 归档使用 shell:false、windowsHide:true、PowerShell 编码参数及 literal path 引用，修复空格/单引号路径处理；真实 Windows Compress/Expand 往返通过。
- 每包写有序 SHA-256 文件清单 `release-manifest.json`，不放入机器绝对路径。此清单是完整性记录，不是代码签名；ZIP 时间戳/SDK 变化不保证 bit-for-bit 一致。
- Node 便携版安装脚本单独命名 `windows-portable-setup.cmd` 并使用独立目标目录，避免与 Electron 安装脚本互相覆盖；复制失败不再假报成功。没有真实执行安装、升级或卸载。

### N13 — 低：设备测试模板的包名断言错误

instrumented 模板仍断言 `com.getcapacitor.app`，与真正构建的 `com.beid.app` 不符。先用配置契约测试复现，再修正断言；instrumented Java 编译通过，但未在设备上运行，不能记为设备测试通过。

### 历史 Tauri 状态

根 package 的 main/desktop:win 均走 Electron，未发现当前发布入口调用 Tauri。Cargo 声明 `[lib]` 却没有 `src/lib.rs`，无 Cargo.lock/capabilities，旧 README 还宣称未注册的通知能力。Rust/Cargo 不在 PATH，未构建。仅更正 README 状态；没有给历史壳补全权限、弱化 CSP 或注册协议。

## RED / GREEN 与执行命令

以下命令在仓库根执行，全部使用离线夹具或现有本地依赖。修复前的失败都已实际观察，而不是推测。

| 验证 | RED 证据 | GREEN / 最终结果 |
| --- | --- | --- |
| `node --test electron/desktop-server.test.mjs` | 首组 10 个失败：200/302、缺 Content-Type、可读夹具私密文件等；之后 CSP、Cookie 名与隐藏文件各先单独 RED | 13/13 |
| `node --experimental-vm-modules --test electron/main.test.mjs` | 6 个失败：随机端口、新窗口 allow、任意 OS URL、缺导航/权限处理、启动失败不退出 | 6/6 |
| `node --experimental-vm-modules --test scripts/release-boundary.test.mjs` | 首批 7 个打包失败；fresh-build 测试曾误匹配脚本文件名，修正测试后单独验证 RED；新增启动确认/编码测试也先 RED | 11/11，包括真实 Windows 文本 ZIP 往返 |
| `node --test scripts/native-configuration.test.mjs` | 缺 MY_PACKAGE_REPLACED；模板包名错误，各先 RED | 2/2 |
| `node scripts/test-native-boundary.mjs` | 第一组生产方法 10/10 RED；修复后第二组 15 中 5 RED（旧 alarm、设置、升级、畸形 intent、ticker） | 15/15 JVM |

完整 Node 组合命令：

```powershell
node --experimental-vm-modules --test electron/desktop-server.test.mjs electron/main.test.mjs scripts/release-boundary.test.mjs scripts/native-configuration.test.mjs
```

原生构建/测试：

```powershell
npm run mobile:doctor
node scripts/test-native-boundary.mjs
.\android\gradlew.bat --offline --no-daemon -p android -I ..\scripts\native-audit.init.gradle :app:assembleDebug --console=plain
.\android\gradlew.bat --offline --no-daemon -p android -I ..\scripts\native-audit.init.gradle :app:compileDebugAndroidTestJavaWithJavac --console=plain
```

`mobile:doctor` 返回 ok:true，本机 JDK 21.0.12 / SDK 36 可用；Gradle 8.14.3 离线完成 assembleDebug（90 tasks）、instrumented Java 编译（67 tasks）。17 个 JS/MJS 文件语法检查、11 个跟踪 XML 解析、范围内 git diff --check 通过。

### JVM runner 的环境限制与处理

最初直接运行 `:app:testDebugUnitTest --tests com.beid.app.NativeBoundaryTest` 时，Java 编译成功，但本机 Gradle test worker 报 `ClassNotFoundException: com.beid.app.NativeBoundaryTest`；不把这个装载错误当成有效 RED。直接 Java/JUnit 使用同一测试 classpath 可以加载并显示真实断言失败。路径/worker 装载问题的精确根因未证实（本机 native.encoding=GBK，项目路径含中文）。

`scripts/native-audit.init.gradle` 将外部 Capacitor 项目的 buildDir 放回 `android/build/native-audit-dependencies/`，并构建/导出真实 test classpath；`test-native-boundary.mjs` 通过独立 JVM + 显式 Mockito agent 执行全部断言。没有设置 returnDefaultValues、排除失败测试或修改框架安全行为。Mockito 只属于 testImplementation，不进入 APK。

已知工具提示未掩盖：AGP 的 overridePathCheck/flatDir 提示、SDK XML 版本提示、JVM class sharing 提示、Node VM Modules 实验性提示、PowerShell 初次模块加载进度。它们不是“零告警”承诺，也没有因此认定真机可用。

## Native 构建与发布证据

实际产生并检查的 APK：

```text
<repo-root>\android\app\build\outputs\apk\debug\app-debug.apk
bytes: 12823104
SHA256: 3D4C78F047FE635CDB12E496C6C1C73D080A8BA0B9CBC323BD1ADD0C0178DB78
applicationId: com.beid.app
versionCode: 3
versionName: 0.3.0
minSdk: 24
targetSdk / compileSdk: 36
variant: debug / debuggable
```

- `aapt2 dump badging`、合并 Manifest 和 output-metadata.json 相互核对；allowBackup=false、usesCleartextTraffic=false 保留，新增恢复 action 存在。
- `apksigner verify --verbose`：Verifies，v2=true，1 signer；这是 debug 构建验证，不是生产签名/SourceStamp。
- 枚举 APK 754 个压缩条目，常见 `.env/.git/last_crash/credential/cookie/key-store` 文件名匹配为 0。没有宣称完成全字节秘密检测。
- **本次未执行 mobile:sync**：为避免与主模型同时写 dist/src 相关产物，APK 使用工作树里已有的 Android `assets/public`。这是 native 补丁编译/封装证据，不是与主模型最终应用层源码完全一致的发布候选。
- **未产出真实 Windows 发布包**：`BEID_ELECTRON_DIST` 未设置，实际 `node_modules/electron/dist/electron.exe` 不存在。没有下载运行时或把合成测试 electron.exe 当真实产品。打包测试验证的是流程、边界和文件清单；真实归档验证的是无害文本夹具。
- 没有写根 `release/`/`dist/`、没有调用 root electron-builder 构建、没有启动占用主模型端口的常驻服务。测试临时目录在各自 `.test-artifacts/` 并在测试结束清理。

## 给主模型的应用层/跨范围契约

1. **数据迁移必须明确**：Electron 来源固定到 4173；浏览器便携版改为 `LOCALAPPDATA/BEID/portable-browser`。历史随机端口/默认浏览器的数据未自动迁移，升级前应提供导出/导入指引，不能把旧数据不可见误称为已迁移或已丢失。
2. **代理接口收紧**：非同源、跨 API origin 重定向、非 HTTPS CDN、带 userinfo/非默认端口 URL 会失败。应用层不应对 403 无限重试或回退为任意网络代理。新增 CDN 需要协调 `src/lib/bilibili/mediaHostPolicy.ts` 和 Electron 白名单；Range、POST Content-Type、登录 Cookie header 契约保留。
3. **播放器 Promise/生命周期**：open 失败会停止并隐藏 native surface；ready 不会覆盖用户 pause；dispose/destroy 仍是前端生命周期责任。主模型应继续检查组件卸载后的异步 open、分享双通道去重和 listener 清理。
4. **Android 网络信任仍在应用层**：native open 当前只检查 HTTPS 前缀，并接受调用方 media headers；CapacitorHttp 全局启用。应审核上游选源/headers，不要把账户 Cookie 交给不匹配 host。Android cleartext=false 是现有反证，但不等于完成 native URL/DNS 策略验证。
5. **权限 UX**：桌面敏感权限默认拒绝，只有本应用主框架的通知/全屏受控允许；外部 iframe 全屏及未来麦克风功能需要有意设计，而不是重新全放行。Android 通知关闭或设置不可用现在会真实返回 false/reject，前端需显示可理解的提示。
6. **根打包配置属于主模型**：根 `package.json` 的 electron-builder `files: electron/**/*` / extraResources 仍是另一条未经过本次 release-utils 验证的入口，可能包含测试或未筛选 dist。若计划使用 `npx electron-builder`/NSIS，需由主模型收紧该配置或统一到受检流水线；本子任务不越权编辑根 package/.github。现有 desktop:win 则走已修复脚本。
7. **最终联调流程**：主模型应用层稳定后再授权执行 build → cap sync → Android 构建、安装/设备验证及真实 Windows 打包/启动，不应直接发布本报告的旧 assets debug APK。`--prepared` 只用于已完成前置构建的受控调用。

### App.tsx / attachNativeShareIntent 的精确调用端要求

此处是给主模型的接口验收要求，不是扩审/修改 App.tsx；依据已读的 nativeShareIntent 基线实现。**不需要修改 Android 插件方法、事件名或 payload。**

1. Effect cleanup 必须同步设置 disposed/cancelled。随后完成的 getLaunchUrl 结果、appUrlOpen 回调、shareReceived 回调和 pendingText 结果都不得再导航、打开视频或更新状态。只在异步注册完成后存一个 cleanup 引用不够。
2. Capacitor addListener 返回 Promise；如果组件先卸载、handle 后到达，必须立即 await/catch handle.remove()，不能把 handle 留在已失效的组件闭包。attachNativeShareIntent 返回的异步 disposer 也遵循相同规则。
3. 已读 helper 存在一个具体失败路径：addListener 成功后 getPendingText 拒绝，函数未返回 disposer，已取得的 listener 泄漏。主模型应在 helper 内捕获 pending 查询/初始化失败，先移除已取得 listener，再按约定传播错误；不要只在 App.tsx 吞掉 rejection。
4. 如果要允许 pending 查询期间卸载后立即移除 listener，可在 JS helper 增加可选 AbortSignal/等价生命周期参数；abort 先禁止分发，已取得 handle 立即 remove，晚到 handle 同样 remove。不能只 Promise.race 后遗忘后台注册。remove 应幂等或最多一次；异步移除失败必须被观察/报告，不能产生 unhandled rejection。
5. 保留 retained shareReceived 与 getPendingText 的一次性交付语义，不因冷启动双通道而重复导入/导航；不要去掉 native retained event 来掩盖清理问题。

建议应用层回归：卸载早于 addListener resolve；卸载早于 getLaunchUrl resolve；addListener 成功而 getPendingText reject；已注册后卸载而 pending 仍悬挂；卸载后的事件；StrictMode 重挂载；retained + pending 相同分享。期望均为不发生卸载后操作、已取得 handle 被清理、无未观察的 Promise rejection。

## 未验证与保留风险

- 真机/模拟器均未运行：Android 24/31/33/36 通知开关、频道关闭、精确闹钟撤销、Doze、重启/应用升级、强制停止、锁屏、OEM 后台限制、提醒点击、PIP、旋转、音频焦点、Media3 实际重试/播放/清理、硬件返回、多次 Activity 创建。
- Node/JVM 单测不模拟 Android Binder、真实 PendingIntent 注册表、NotificationManager、ExoPlayer 渲染或网络，只验证实际生产控制流对平台 API 的使用。设备矩阵仍是发布门槛。
- Windows 真实 Electron、Edge/Chrome 独立资料目录、浏览器已有实例交接、关闭时序、安装/覆盖升级/卸载、SmartScreen、签名、NSIS 均未验证。CMD 安装器仍为轻量覆盖式安装，不承诺事务升级或回滚。
- SDK setup 仍取 cmdline-tools;latest，缓存 ZIP 只按大小判断，无元数据 checksum 验证；Gradle wrapper 使用镜像且未固定 distributionSha256Sum。未运行 SDK 下载/许可证接受；这是供应链/可复现性待办，不把未经复现的网络攻击记为已证实漏洞。
- mobile:doctor 目前仍主要检查目录存在，提示 JDK 17+ 与实际 Java 21 编译要求不完全一致，且其 local SDK 选择与 local.properties 指向的实际 Gradle SDK 可不同；此次真正离线编译成功比 doctor 输出更强。后续应补工具链版本/路径一致性检查。
- 允许的 CDN/API 域名仍依赖可信 DNS/TLS 与供应商；本次阻断 URL/重定向逃逸，不宣称完成 DNS 解析地址固定或所有 CDN 租户风险消除。
- CrashReporter 保留 app 外部私有目录 last_crash.txt；FileProvider 非 exported，未在范围内找到把任意这些文件授权给外部的第一方调用。没有为了理论风险删掉诊断能力或扩大文件访问权限。
- 并行主模型的 src 修改、原有两份 superpowers docs 均未碰。另观察到根 `%SystemDrive%/ProgramData/Microsoft/Windows/Caches/` 未跟踪目录（创建时间 2026-09-06 01:05:13），只看文件名/元数据，来源未确定，没有读数据库或越界删除；请主模型核实归属，勿整仓 git add。

## 全部改动路径

修改现有文件（14）：

```text
android/app/build.gradle
android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java
android/app/src/main/AndroidManifest.xml
android/app/src/main/java/com/beid/app/BeidFocusBootReceiver.java
android/app/src/main/java/com/beid/app/BeidFocusNotificationPlugin.java
android/app/src/main/java/com/beid/app/BeidFocusNotificationReceiver.java
android/app/src/main/java/com/beid/app/BeidNativePlayerPlugin.java
android/app/src/main/java/com/beid/app/BeidShareIntentPlugin.java
electron/desktop-server.mjs
electron/main.mjs
scripts/build-windows-desktop.mjs
scripts/build-windows-portable.mjs
scripts/pack-electron-win.mjs
src-tauri/README.md
```

新增文件（13，含本报告）：

```text
android/app/src/test/java/com/beid/app/NativeBoundaryTest.java
electron/.gitignore
electron/desktop-server.test.mjs
electron/main.test.mjs
electron/portable-launcher.mjs
scripts/.gitignore
scripts/native-audit.init.gradle
scripts/native-configuration.test.mjs
scripts/release-boundary.test.mjs
scripts/release-utils.mjs
scripts/test-native-boundary.mjs
scripts/test-support/module-harness.mjs
docs/NATIVE_AUDIT_2026-09-05.md
```

生成的 APK、类文件、test classpath、测试/构建报告位于已忽略的 `android/**/build/`，不是待提交源文件。不要把未验证的设备项、合成 Windows runtime 或历史 Tauri 壳描述为发布成功。
