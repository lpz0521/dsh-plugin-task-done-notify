# dsh-plugin-task-done-notify

DSH 任务完成通知插件：当 agent 完成一轮回复（`running: true → false`）时，
用浏览器系统通知（Windows 右下角 toast）自动弹出"任务完成 ✓"。

- 仅在页面处于后台时通知（可关）
- 最短耗时门槛（秒），短问答不打扰
- 默认不通知子代理会话（可开）
- 设置：DSH 设置 → General → "任务完成通知"

## 安装

```bash
dsh plugin --profile web add D:\.work\dsh\dsh-plugin-task-done-notify
```

然后重启 `dsh web`，打开设置页点"发送测试通知"完成授权。

## 开发

```bash
pnpm test    # node --test：core 单测 + bundle 冒烟
pnpm build   # 重新生成 lib/client.js（core.js + app.js 拼接）
```

## 已知限制

浏览器通知要求 DSH 标签页处于打开状态（后台/最小化即可）；浏览器整体关闭时收不到。
