# Security Policy

English | [简体中文](#安全策略)

## Reporting a vulnerability

Please do not disclose security issues in public issues, discussions or pull requests.

Submit a private report under **Security → Report a vulnerability** in this repository (GitHub private vulnerability reporting). Only the maintainers can see it. Please include, where possible:

- The affected version or commit
- How it is deployed (local single-user mode or with login; Docker or nginx)
- Steps to reproduce and the impact

We will acknowledge the report as soon as possible and will not disclose details before a fix is released.

## Supported versions

Only the latest version on the `main` branch is maintained.

## Before deploying

- Local single-user mode has no login and is only meant for your own machine or a trusted network. To serve others, set up login and put the service behind a reverse proxy; see "Security notice" and "Optional: multi-user login" in the README.
- Do not commit real configuration such as `api/.env.dev` or `api/.env.prod`.

---

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

- 本地单用户模式没有登录，只适合本机或可信网络使用；对外提供服务请接入登录并放在反向代理之后，见 README「安全提示」与「可选：多用户登录」。
- 不要提交 `api/.env.dev`、`api/.env.prod` 等真实配置。
