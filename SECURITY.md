# 安全策略

## 报告漏洞

请不要在公开 issue、讨论区或 PR 里披露安全问题。

在本仓库的 **Security → Report a vulnerability** 提交私密报告（GitHub Private vulnerability reporting），只有维护者能看到。报告里请尽量包含：

- 受影响的版本或提交
- 部署方式（本地单用户模式 / 接入登录、Docker / nginx）
- 复现步骤和影响

收到后会尽快确认，修复发布前不会公开细节。

## 支持范围

只维护 `main` 分支的最新版本。

## 部署前请注意

- 本地单用户模式没有登录，只适合本机或可信网络使用；对外提供服务请接入登录并放在反向代理之后，见 README「安全提示」与「可选：飞书登录」。
- 不要提交 `api/.env.dev`、`api/.env.prod` 等真实配置。
