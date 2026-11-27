# AI 更新操作手册（DailyGithub）

> 本文档面向 AI 助手（Agent）。请严格按步骤执行，不要凭记忆猜测命令或配置。
> 最后更新：2026-11-26

## 0. 项目事实（不可变的事实，直接采信）

| 项 | 值 |
| --- | --- |
| 本地路径 | `E:\WorkBuddyProjects\DailyGithub` |
| GitHub 仓库 | `https://github.com/Imbalyc0823/DailyGithub`（Public） |
| 线上地址 | `https://imbalyc0823.github.io/DailyGithub/` |
| 发布方式 | GitHub Pages，从 `main` 分支根目录自动发布（已配置，无需再动） |
| 发布机制 | `git push` 到 `origin main` 后，Pages 自动构建，约 1~2 分钟生效 |
| 站点类型 | 纯静态，无构建依赖，无需 npm/pip 安装任何东西 |

## 1. 本机网络约束（关键前提）

本机访问 GitHub 必须走本地 SOCKS 代理，**V2RayN 必须处于运行状态**：

- 代理地址：`socks5://127.0.0.1:10808`
- 检测代理是否存活：`netstat -ano | findstr :10808`（有 LISTENING 即存活；若没有，提示用户先打开 V2RayN，不要尝试直连——直连必失败）
- 沙箱/工作代理（`http_proxy=127.0.0.1:3094` 等）**无法**访问 github.com，git 命令不要依赖这些环境变量

## 2. 仓库 git 配置（已固化，不要改动）

以下配置已写入 `.git/config`（本地文件，不会提交）：

```
http.proxy = socks5://127.0.0.1:10808    # 推送走 SOCKS 代理
http.sslBackend = openssl                 # 绕开 Windows schannel 吊销检查报错
remote.origin.url 含 PAT token            # 认证方式，绕开不支持 SOCKS 的凭据管理器
```

**规则**：
- 推送命令直接用 `git push`，**不要**加 `-c http.proxy=...` 之类的临时参数
- **绝对不要**把 token 写进任何工作区文件（会被提交公开）；token 只存在于 `.git/config` 中
- **不要**执行 `git remote set-url origin https://github.com/...`（会抹掉 token 导致推送无法认证）

## 3. 每日更新流程

### 阶段一：生成当日内容（在项目根目录 `E:\WorkBuddyProjects\DailyGithub` 下执行）

设当日日期为 `<date>`（格式 `YYYY-MM-DD`）：

```bash
node tools/collect.js <参数>              # 抓榜单 + README 摘要 + 配图 → tools/.cache/<date>.json
python tools/img-to-jpg.py <date>         # 配图转 jpg → assets/img/<date>/
node tools/build-data.js <date>           # 合成数据文件（依赖 tools/copy-<date>.json）
node tools/build-report.js <date>         # 导出日报 + 周报 Markdown → reports/
```

补充说明：
- `copy-<date>.json`（中文导读）需要先人工/AI 撰写，格式参考现有的 `tools/copy-2026-11-25.json`
- `collect.js` 支持 `--only=daily|weekly`、`--reuse-detail`、`--boards=<file>`（github.com 直连不通时的备用通道），详见 README.md
- **最后一步**：在 `index.html` 底部按日期顺序追加一行 `<script src="assets/js/data/<date>.js"></script>`，漏掉这行新日期不会出现在页面上

### 阶段二：提交并推送（发布）

```bash
git add -A
git commit -m "日报 <date>"
git push
```

预期输出含 `main -> main`（首次之后的正常推送）。失败时看第 4 节排查。

### 阶段三：验证发布

推送成功后等待约 60~120 秒，然后验证：

```bash
curl -s -o /dev/null -w "%{http_code}" --socks5-hostname 127.0.0.1:10808 https://imbalyc0823.github.io/DailyGithub/
```

- 返回 `200` = 已上线（若仍是旧内容属 Pages 缓存延迟，等 1~2 分钟再试）
- 验证新数据文件已可访问：`https://imbalyc0823.github.io/DailyGithub/assets/js/data/<date>.js`

## 4. 故障排查

| 报错特征 | 原因 | 处理 |
| --- | --- | --- |
| `401` / `Authentication failed` | PAT 过期（约 90 天有效期，上次为 2026-11-26） | 让用户到 https://github.com/settings/personal-access-tokens/new 重新生成（勾选 DailyGithub 仓库 + Contents: Read and write），然后执行 `git remote set-url origin https://Imbalyc0823:<新token>@github.com/Imbalyc0823/DailyGithub.git` |
| `Failed to connect` / `Could not connect to server` | V2RayN 没开或端口变了 | 用 `netstat -ano | findstr :10808` 确认；没有就提示用户启动 V2RayN，开好后再推 |
| `CRYPT_E_REVOCATION_OFFLINE` | sslBackend 配置丢失 | 重新执行 `git config http.sslBackend openssl` |
| `ServicePointManager 不支持 socks5` | 凭据管理器被触发（配置丢失） | 确认 remote URL 含 token（`git remote -v` 会显示，不要截图外传） |
| `CONNECT tunnel failed, 502` | git 走了沙箱代理（3094） | 确认 `git config http.proxy` 为 `socks5://127.0.0.1:10808`，必要时 `git config http.proxy socks5://127.0.0.1:10808` |
| 推送成功但线上是旧内容 | Pages 构建中 | 等待后重试验证，无需任何操作 |

## 5. 红线（禁止事项）

1. 禁止把 token、`.git/` 内容写入任何被提交的文件
2. 禁止推送前不审查 `git status` / `git diff`——确认没有把缓存（`tools/.cache/`）、临时文件误加入
3. `.workbuddy/` 目录已被 `.gitignore` 排除，不要把它加回来
4. 不要改动 GitHub 仓库的 Pages 设置（当前 main /(root) 配置是正确的）
5. `index.html` 中数据 `<script>` 行必须按日期顺序插入，不要乱序
