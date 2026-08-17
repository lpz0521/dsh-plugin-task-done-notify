# 设计：dsh-plugin-task-done-notify（任务完成通知插件）

- 日期：2026-08-17
- 状态：已获用户批准（2026-08-17）
- 目标环境：DeepSeek Harness (DSH) 0.1.0-rc.6，`web` profile，Windows

## 1. 目标

当 DSH Web GUI 里的 agent 完成一轮回复（`running: true → false`）时，用**浏览器系统通知**
（Notification API，Windows 上显示为右下角系统 toast）自动通知用户"任务完成"。

明确不做（用户确认）：
- 通知正文不含回复摘要，只说"做完了"即可；
- 不做宿主端 Windows 原生通知（浏览器关闭也能弹）——留作未来扩展；
- 不做页面内浮窗（系统通知为主，环境不支持系统通知时静默跳过）。

## 2. 架构

单包双半结构，与已装插件 `dsh-plugin-wallpaper-engine` 完全同构：

```
dsh-plugin-task-done-notify/
├── package.json        # 声明 dsh.bundle.patch + dsh.client(platform: web, immediately: true)
├── cordis.patch.yml    # insert 一个宿主行（id: task-done-notify）
├── lib/
│   ├── index.js        # 宿主半：空插件（inject: [], apply 无操作）——仅占位
│   └── client.js       # 浏览器半：全部逻辑（手写 __ModuleLoader__ 格式，无需构建工具）
├── docs/superpowers/specs/2026-08-17-task-done-notify-design.md
└── README.md           # 安装与使用说明
```

### 为什么必须有宿主行

`@deepseek-ai/dsh-client-modules`（web 插件表服务）通过扫描 loader 条目中每个
entry 的 `options.name`（包名）→ `require.resolve(<包名>/package.json)` → 读取
`dsh.client` 声明来发现浏览器 bundle。因此本包**必须**作为一条 cordis 行挂进 loader，
其浏览器半才会被服务并被客户端加载。本插件宿主半无任何逻辑，只占位。

### 模块形态

- 宿主半 `lib/index.js`：`export const inject = []`，`export function apply() {}`，
  `export default { inject, apply }`。loader 按行 `name` 解析到包 `main`。
- 浏览器半 `lib/client.js`：`window.__ModuleLoader__.load({ id, factory })` 格式，
  `exports.inject = ["sessions", "slots"]`，`exports.apply = (ctx) => {...}`，
  内部 `require("react")` 渲染设置组件。手写该格式（参考 wallpaper 的 client.js），
  不需要 rollup/webpack 构建脚本。

## 3. 数据流（完成检测）

1. `apply(ctx)` 订阅 `ctx.sessions.list`（`ObservableSnapshot<SessionListState>`，
   uSES 兼容：`getSnapshot()` / `subscribe(fn)`）。
2. 维护 `Map<SessionId, { running: boolean; startedAt: number | null }>`。
3. 每次快照变化时 diff：
   - `running: false → true`：记录 `startedAt = Date.now()`（含插件加载时已在运行的会话）；
   - `running: true → false`：本轮回复完成，进入通知判定；
   - 会话从列表消失：从 Map 中删除。
4. 判定链（任一不过则跳过）：
   1. 总开关开启；
   2. 非子代理会话（`SessionSummary.parentId` 存在则跳过，除非设置"包含子代理"开启）；
   3. "仅在页面后台时通知"开启时，`document.hasFocus()` 必须为 false；
   4. 耗时（`Date.now() - startedAt`）≥ 最短耗时门槛（秒）。
5. 通过 → 弹系统通知：
   - 标题：`任务完成 ✓`
   - 正文：`会话：{SessionSummary.displayTitle}`
   - `tag: "dsh-task-done-notify"`（让系统合并同源通知）
   - 不显示图标（沿用浏览器默认）。
6. 清理：`ctx.effect(() => () => unsub())`，插件卸载/页面刷新时退订并清除 Map。

### 防抖与边界

- 初始快照中 `running: false` 的会话不通知（只响应翻转）。
- 多会话同时完成：各自弹一条（同 tag 由系统合并展示）。
- 子代理默认不通知（避免噪音），设置可开。
- 门槛为 0 时全部通知；插件加载前已开始的会话，耗时从加载时刻起算（可接受近似）。

## 4. 设置页

注册 `settings.general.item` 槽位（模式同 wallpaper 插件的设置项注册）：
`ctx.slots.inject("settings.general.item", () => ctx.slots.register({ name: "settings.general.item", id: "task-done-notify", order: 500, label: "任务完成通知" }, SettingsCard))`。

持久化：localStorage，key `dsh-task-done-notify:settings`。

| 设置项 | 键 | 默认值 |
|---|---|---|
| 总开关 | `enabled` | `true` |
| 仅在页面后台时通知 | `onlyWhenBackground` | `true` |
| 最短耗时（秒） | `minDurationSec` | `0` |
| 包含子代理会话 | `includeSubagents` | `false` |
| 发送测试通知（按钮） | — | 点击时请求权限 + 弹一条测试通知 |

设置变更立即生效（订阅处实时读取），不需要重启。

## 5. 错误处理

| 场景 | 行为 |
|---|---|
| 环境无 `Notification`（老浏览器/非安全上下文） | 静默跳过；设置页显示"当前环境不支持系统通知" |
| 权限 `denied` | 不弹；设置页显示"权限被拒绝，请在浏览器站点设置中允许通知" |
| 权限 `default` | 不自动请求（浏览器拦截非用户手势请求）；由"发送测试通知"按钮触发授权 |
| 订阅/退订异常 | 判定链 try/catch 包裹，单条失败不影响其他通知 |
| 插件卸载/刷新 | fiber 清理退订，无泄漏 |

## 6. 测试

手动验证（无自动化测试框架，纯客户端插件）：
1. 装入 web profile 后重启 `dsh web`，打开 GUI。
2. 设置 → 任务完成通知：点"发送测试通知"，确认授权流程与系统 toast 弹出。
3. 切到其他标签页，向 agent 发一个长任务，完成后确认弹出系统通知。
4. 边界验证：
   - 页面聚焦时完成 → 不弹（后台条件生效）；
   - 门槛设为 60 秒，发短问答 → 不弹；
   - 子代理会话完成 → 默认不弹；
   - 权限拒绝后 → 不弹且设置页有提示。

## 7. 安装步骤

1. 包目录：`D:\.work\dsh\dsh-plugin-task-done-notify`。
2. 安装进 web profile：
   `dsh plugin --profile web add D:\.work\dsh\dsh-plugin-task-done-notify`
   （绝对路径直接透传给 pnpm，按 link 装入 profile）。
3. 重启 web 应用（`dsh web`）使新 bundle 进入 loader 组合与客户端清单。
   **注意：会重启当前 3080 端口的 GUI，需用户确认时机。**
4. 验证：`dsh --profile web --dump-config` 可见 `task-done-notify` 行。

## 8. 未来扩展（本期不做）

- 宿主端 Windows 原生 toast（浏览器关闭也能收到）。
- 通知正文含回复摘要/耗时统计。
- 后台任务（job）与多轮目标（goal）完成的单独通知。
- 每会话/每 workspace 粒度的通知白名单。
