# dsh-plugin-task-done-notify

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DSH 任务完成通知插件：当 agent 完成一轮回复（`running: true → false`）时，
用浏览器系统通知（Windows 右下角 toast）自动弹出"任务完成 ✓"，
正文带**工作区 + 会话标题**。

## 功能

- 不管在不在页面都通知（可选：设置里开启"仅在页面后台时通知"）
- 最短耗时门槛（秒），短问答不打扰
- 默认不通知子代理会话（可开）
- 设置：DSH 设置 → General → "任务完成通知"
- 纯浏览器端插件：宿主行仅占位，检测逻辑订阅 `ctx.sessions.list`，
  无构建依赖，`pnpm test` 全量单测（core 单测 + vm 冒烟）

## 安装

**同一盘符**（如源码在 C 盘或 Linux/macOS），标准流程：

```bash
dsh plugin --profile web add <插件目录路径>
```

**Windows 跨盘符**（源码在 D 盘、profile 在 C 盘）：pnpm 会把 `D:\...`
绝对路径错误地当成相对路径段，生成损坏的 junction。绕行方案——同盘 junction +
相对 `link:` 路径（符号链接，源码改动实时生效）：

```powershell
# 1. 在 profile 里建 junction 指向插件源码
New-Item -ItemType Junction -Path "$env:DSH_HOME\profiles\web\plugins\dsh-plugin-task-done-notify" -Target "D:\.work\dsh\dsh-plugin-task-done-notify"

# 2. 用 link: 协议 + 相对路径安装
cd $env:DSH_HOME\profiles\web
pnpm add link:./plugins/dsh-plugin-task-done-notify

# 3. 把 "dsh-plugin-task-done-notify" 追加到 profiles\web\package.json 的 dsh.profile.bundles
```

装完后重启 `dsh web`，打开设置页点"发送测试通知"完成授权。

## 开发

```bash
pnpm test    # node --test：core 单测 + bundle 冒烟
pnpm build   # 重新生成 lib/client.js（core.js + app.js 拼接）
```

改 `lib/core.js` / `lib/app.js` 后需重新 `pnpm build`；bundle 是提交进仓库的，
安装时无需构建。

## 已知限制

浏览器通知要求 DSH 标签页处于打开状态（后台/最小化即可）；浏览器整体关闭时收不到。

## 作者与许可

作者：[lpz0521](https://github.com/lpz0521) · 以 [MIT](LICENSE) 许可发布。

在 GitHub 上给本项目一个 ⭐ 吧：<https://github.com/lpz0521/dsh-plugin-task-done-notify>
