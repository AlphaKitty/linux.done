# linux.done



**LINUX DO 社区订阅式帖子监控 Chrome 扩展**  
*Subscription-based post monitoring for [LINUX DO](https://linux.do)*

     

[English](#english) · [功能特性](#功能特性) · [安装](#安装) · [使用指南](#使用指南) · [多语言](#多语言) · [隐私](#隐私说明) · [打赏](#支持作者)

---



## 简介

**linux.done** 是一款面向 [LINUX DO](https://linux.do) 社区的 Chrome 浏览器扩展。  
它让你用「分类 × 标签 × 关键词」三维规则订阅真正关心的帖子，在匹配到内容时通过浏览器通知即时提醒，无需反复刷新论坛。

> 你的私人雷达：规则设好后 7×24 盯着论坛，有价值的帖子主动找你。


| 项目   | 说明                                      |
| ---- | --------------------------------------- |
| 当前版本 | **1.0.7**                               |
| 运行环境 | Chromium 内核浏览器（Chrome / Edge / Brave 等） |
| 清单标准 | Manifest V3                             |
| 目标站点 | [https://linux.do](https://linux.do)    |
| 界面语言 | 简体中文 / English                          |
| 开源协议 | MIT                                     |


---



## 功能特性



### 三维度订阅规则

```
规则 = 分类（可选）  AND  标签（可选）  AND  关键词（可选）
         │                 │                 │
         └─ OR 匹配        └─ OR 匹配        └─ OR 匹配
```

- **分类**：从 LINUX DO 类别树动态获取（福利羊毛、跳蚤市场、运营反馈……）
- **标签**：帖子级 Discourse 标签，支持搜索筛选、多选
- **关键词**：自由输入，匹配标题与摘要
- 所有维度均可选；留空表示该维度匹配任意值
- 规则可独立启用 / 禁用，支持自定义名称



### 智能通知推送

- 规则匹配时推送浏览器原生通知，点击直达帖子
- **聚合模式**：同次扫描多条匹配可合并为一条通知
- **冷却期**：同一规则可配置最小通知间隔（关闭 / 5min / 10min / 30min / 1h / 每日汇总）
- **免打扰时段**：指定时间段静音，避免夜间打扰
- **去重**：同一帖子只通知一次
- 内置通知测试与权限引导，排查「收不到通知」更方便



### 双通道数据获取


| 场景                 | 策略                                  | 体验   |
| ------------------ | ----------------------------------- | ---- |
| 已打开 `linux.do` 标签页 | Content Script 代理 + MessageBus 实时监听 | 近乎秒级 |
| 未打开任何相关标签页         | Service Worker 后台轮询（默认 **10 分钟**）   | 稳定兜底 |


通过已打开页面中的 Content Script 代理 API 请求，复用页面 Cloudflare 会话，降低 429 限流风险；无打开标签时自动降级为直连。

### 弹窗面板

- **最新帖子**：按发布时间排序
- **最新互动**：按最后活动时间排序，可展开回复详情
- 规则数量、上次扫描时间、通知开关状态一目了然
- 支持「阅后即焚」：点击打开后从列表自动移除
- 扩展角标显示匹配帖数量



### 存储与清理

- 匹配帖自动缓存，按最后活动时间排序
- 可配置保留时长：12h / 24h / 48h / 72h / 7d
- 可配置条数上限：50 / 100 / 200 / 500
- 默认 **48 小时 / 200 条**（约 200KB，远低于配额）
- 一键清空；已清除帖子有新活动时可重新入库



### 中英双语

设置页一键切换 **简体中文 / English**，弹窗、选项页、通知文案同步切换。详见 [多语言](#多语言)。

---



## 安装



### 方式一：Chrome 网上应用店（推荐）

> 点击下方链接跳转到 Chrome Web Store。

**[在 Chrome 网上应用店安装 linux.done](https://chromewebstore.google.com/detail/fdoolgbbkhbgpcocmjcdgffmkgdedidg?utm_source=item-share-cb)**

1. 打开上方链接
2. 点击「添加至 Chrome」
3. 确认权限后即可使用

兼容 Edge / Brave 等 Chromium 浏览器时，也可通过对应应用商店或「允许来自其他商店的扩展」安装同一扩展包。

### 方式二：开发者模式加载（源码）

适用于开发者、贡献者或希望使用最新源码的用户：

1. 克隆本仓库并进入扩展目录：
  ```bash
   git clone https://github.com/AlphaKitty/linux.done.git
   cd linux.done
  ```
2. 打开 Chrome，访问 `chrome://extensions`
3. 开启右上角 **「开发者模式」**
4. 点击 **「加载已解压的扩展程序」**
5. 选择本仓库根目录（即包含 `manifest.json` 的目录）
6. 点击工具栏扩展图标，进入设置并添加规则

---



## 使用指南



### 1. 添加订阅规则

1. 点击扩展图标 → 齿轮进入 **设置页**（或右键扩展图标相关入口）
2. 点击 **「添加规则」**
3. 选择要监控的 **分类**（可选）
4. 选择 **标签** 和/或 输入 **关键词**（可选）
5. 为规则命名并保存

> 维度内为 **OR**，维度之间为 **AND**。  
> 例如：分类 =「福利羊毛」且关键词包含「机场」→ 仅匹配该分类下标题/摘要含「机场」的帖子。



### 2. 接收通知

- 匹配到新帖时弹出浏览器通知
- 点击通知可直达帖子
- 若收不到通知，请检查：
  - 扩展通知权限
  - Chrome 系统级通知是否被阻止
  - 是否处于免打扰时段 / 规则冷却期
  - 规则是否已启用

可在弹窗中点击 **Notify** 发送测试通知，快速验证权限是否正常。

### 3. 日常使用

- **开着 LINUX DO 标签页**：走实时通道，匹配几乎即时
- **关着所有相关标签页**：后台每 10 分钟轮询兜底
- 在弹窗中浏览「最新帖子 / 最新互动」，管理通知开关与阅后即焚



### 4. 推荐工作流

```
安装扩展 → 开启通知权限 → 添加 1～3 条精准规则
        → 保持偶尔打开 linux.do（享受实时）
        → 其余时间交给后台轮询
```

规则宁精勿滥：关键词或标签越具体，信噪比越高。

---



## 设置项一览


| 设置   | 选项                                    | 说明            |
| ---- | ------------------------------------- | ------------- |
| 语言   | 简体中文 / English                        | 全局界面语言        |
| 启用通知 | 开 / 关                                 | 总开关           |
| 冷却期  | 关闭 / 5min / 10min / 30min / 1h / 每日汇总 | 同一规则最小通知间隔    |
| 聚合通知 | 开 / 关                                 | 同次扫描多条匹配合并为一条 |
| 免打扰  | 起止整点                                  | 时段内不弹通知       |
| 保留时长 | 12h / 24h / 48h / 72h / 7d            | 匹配帖自动清理周期     |
| 条数上限 | 50 / 100 / 200 / 500                  | 本地最多保留条数      |
| 阅后即焚 | 开 / 关（弹窗）                             | 点击打开后从列表移除    |


默认值：通知开启、冷却 10 分钟、聚合开启、保留 48h / 200 条、阅后即焚开启。

---



## 多语言



### 用户侧：如何切换语言

1. 打开扩展 **设置页**
2. 找到 **Language / 语言** 卡片
3. 在下拉框中选择：
  - `简体中文`
  - `English`
4. 点击 **保存**

切换后，设置页、弹窗文案与通知文案将使用所选语言。语言偏好保存在 `chrome.storage.sync`，可随 Chrome 账号同步。

### 开发者侧：i18n 模块说明

项目内置轻量双语模块 `[lib/i18n.js](lib/i18n.js)`，**不依赖** Chrome 官方 `_locales` 目录，便于在 MV3 扩展页中统一使用。

```js
import { t, initI18n, setLang, getLang } from './lib/i18n.js';

await initI18n();                 // 读取用户设置（默认 zh）
t('popup.scan');                  // → "扫描" / "Scan"
t('popup.rules', { n: 2 });       // → "2 条规则" / "2 rule(s)"
await setLang('en');              // 切换并持久化
```


| 能力    | 说明                                           |
| ----- | -------------------------------------------- |
| 语言包   | `ZH` / `EN` 键值表，键名点号分层（如 `setting.cooldown`） |
| 插值    | `{n}`、`{m}` 等占位符运行时替换                        |
| 回退    | 缺键时回退到英文，再缺则返回 key 本身                        |
| 初始化顺序 | 显式参数 → `settings.language` → 默认 `zh`         |
| 覆盖范围  | popup / options / background 通知文案            |




#### 新增翻译键

1. 在 `lib/i18n.js` 的 `ZH` 与 `EN` 中同步添加同一 key
2. HTML 静态文案使用 `data-i18n="your.key"`，由页面脚本在 `initI18n()` 后注入
3. 动态文案直接调用 `t('your.key', params)`

欢迎通过 PR 补充更多语言（如繁体中文、日本語）。新增语言时扩展 `LANG_MAP` 并在设置页下拉中增加选项即可。

---



## 工作原理（简图）

```
┌─────────────────┐     有 linux.do 标签      ┌──────────────────────┐
│  Service Worker │ ───────────────────────► │  Content Script      │
│  定时 Alarm     │                          │  · API 代理 (CF)     │
│  规则匹配       │ ◄── PAGE_TOPIC_DATA ──── │  · MessageBus 监听   │
│  通知推送       │                          │  · 定期提取最新帖    │
└────────┬────────┘                          └──────────────────────┘
         │ 无标签时
         ▼
  直连 Discourse 公开 API（10 min 轮询）
         │
         ▼
  matcher：分类 ∩ 标签 ∩ 关键词
         │
         ▼
  冷却 / 去重 / 聚合 → chrome.notifications
```

- **纯前端**：无自建后端，规则与缓存均在本地  
- **公开 API**：读取 `linux.do` 公开帖子数据  
- **隐私优先**：不上传订阅规则与浏览内容到第三方业务服务器

---



## 项目结构

```
linux.done/
├── manifest.json          # Chrome Extension Manifest V3
├── background.js          # Service Worker：扫描、通知、消息路由
├── content.js             # Content Script：API 代理 + 数据提取（无页面视觉改动）
├── content.css            # 预留样式（当前为空）
├── lib/
│   ├── storage.js         # chrome.storage 封装、规则 CRUD、缓存
│   ├── discourse.js       # Discourse API（类别、标签、帖子）
│   ├── matcher.js         # 三维匹配引擎
│   ├── i18n.js            # 中英双语
│   └── analytics.js       # 可选 GA4 Measurement Protocol（默认关闭）
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── wechat-pay.png     # 赞赏码（设置页使用）
├── package.json
├── LICENSE                # MIT
├── .gitignore
├── PUBLISH.md             # 开源发布步骤（维护者）
├── scripts/
│   └── export-clean.sh    # 导出干净副本
└── README.md
```

---



## 开发

```bash
# 进入扩展目录
cd linux.done

# 安装依赖（仅图标生成需要）
npm install

# 重新生成图标（需要 sharp）
npm run generate-icons
# 或：node icons/generate-icons.cjs
```

开发调试：

1. `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序
2. 修改代码后点击扩展卡片上的 **刷新**
3. Service Worker 日志：扩展详情页 → 「Service Worker」链接
4. 弹窗 / 设置页：右键检查即可使用 DevTools

---



## 常见问题

**为什么开着论坛时通知更快？**

  


已打开 `linux.do` 时，Content Script 会监听页面数据推送并提取最新帖，匹配后几乎立刻通知；此时后台 10 分钟轮询会被跳过，避免重复请求。  
未打开任何相关标签时，才由 Service Worker 每 10 分钟轮询兜底。



**设置了规则却没有通知？**

  


可逐项排查：

1. 帖子是否已被标记为已读 / 已通知（会去重）
2. 规则是否启用
3. 是否处于冷却期或免打扰时段
4. 浏览器 / 系统是否拦截了通知（用弹窗「Notify」测试）
5. 关键词 / 标签是否过于严格导致未命中



**会对 LINUX DO 或本机造成负担吗？**

  


设计目标是「几乎零负担」：

- 有标签页时优先使用页面侧数据通道，避免额外轰炸式 API  
- 无标签页时 10 分钟一次轮询，并配合缓存策略  
- Service Worker 仅在任务时短暂唤醒  
- 匹配为本地字符串逻辑，CPU / 内存占用可忽略



**是否需要登录 LINUX DO？**

  


扩展通过公开接口与页面上下文获取列表数据；是否需登录取决于站点本身对访客的可见范围。扩展不代替你登录，也不存储账号密码。



---



## 隐私说明

- 仅访问 `https://linux.do/*` 相关公开数据  
- 订阅规则与偏好存储于 **Chrome Sync**  
- 匹配缓存存储于 **Chrome Local**  
- **不收集** 可识别个人身份的业务数据用于扩展功能本身  
- **不将** 规则内容、帖子正文上传至作者自建服务器

可选的 Google Analytics（`lib/analytics.js`）默认 **未启用**（`API_SECRET` 为空时不发送任何统计）。启用前请自行评估并在隐私政策中披露。

权限用途简述：


| 权限               | 用途              |
| ---------------- | --------------- |
| `storage`        | 保存规则、设置与本地缓存    |
| `notifications`  | 匹配结果浏览器通知       |
| `alarms`         | 后台定时扫描          |
| `contextMenus`   | 扩展图标右键菜单        |
| `scripting`      | 必要时向已打开标签注入代理脚本 |
| host: `linux.do` | 读取论坛公开接口与页面上下文  |


---



## 支持作者

如果 **linux.done** 帮你抢到了羊毛、蹲到了好物，或只是少刷了几次论坛——欢迎请作者喝杯咖啡 ☕  

你的支持是持续维护与更新的最大动力。

  

微信扫码赞赏 · NullPointer

扩展设置页右下角的 😁 按钮也可随时打开赞赏卡片。

---



## 贡献

欢迎 Issue 与 Pull Request：

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交变更：`git commit -m "feat: describe your change"`
4. 推送分支并开启 PR

建议：

- 保持变更聚焦，避免无关重构  
- 新增用户可见文案时同步更新中英文 i18n  
- 说明动机、复现步骤或截图（如涉及 UI）

---



## 路线图（建议）

- [ ] 更多界面语言  
- [ ] 规则导入 / 导出  
- [ ] 更细的匹配字段（作者、最低回复数等）  
- [ ] 可选的桌面端 / 其它浏览器适配说明  

> 以上为规划方向，不构成交付承诺。欢迎在 Issue 中投票与讨论。

---



## 致谢

- [LINUX DO](https://linux.do) 社区与 Discourse 平台  
- 所有反馈 Bug、提出建议与打赏支持的用户

---



## License

本项目基于 [MIT License](./LICENSE) 开源。

```
Copyright (c) 2026 NullPointer / linux.done contributors
```

完整条款见仓库根目录 `[LICENSE](./LICENSE)`。

---



## English

**linux.done** is a Manifest V3 Chrome extension for [LINUX DO](https://linux.do). It watches the forum with **category × tag × keyword** subscription rules and pushes **browser notifications** when something matches—so you stop doom-refreshing the feed.

### Install

- **Chrome Web Store (recommended):**  
[Install linux.done](https://chromewebstore.google.com/detail/fdoolgbbkhbgpcocmjcdgffmkgdedidg?utm_source=item-share-cb)  
- **Load unpacked:** clone this repo → `chrome://extensions` → Developer mode → **Load unpacked** → select the `linux.done` directory.



### Quick start

1. Grant notification permission
2. Open **Options** → **Add Rule** → pick categories / tags / keywords
3. Keep a `linux.do` tab open for near real-time updates; otherwise background polling runs every **10 minutes**



### Highlights

- AND across dimensions, OR within each dimension  
- Cooldown, aggregate notifications, Do-Not-Disturb window, per-post dedupe  
- Content-script API proxy to reuse the page’s Cloudflare session when available  
- Popup: new topics, latest activity, burn-after-open, badge count  
- Configurable retention (time + max items)  
- **Chinese / English** UI via built-in `lib/i18n.js`  
- No backend; rules stay in `chrome.storage`



### Language switch

**Options → Language / 语言 → 简体中文 | English → Save**

### Support the author

If this extension saves you time, consider a tip via WeChat Reward QR codes in the [支持作者](#支持作者) section above, or the 😁 button on the options page.

### License

MIT — see [License](#license).

---

Made with ☕ for the LINUX DO community · Not affiliated with linux.do