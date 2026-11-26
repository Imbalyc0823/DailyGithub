# 开源日报 · GitHub Trending Daily / Weekly

一个留档 GitHub 趋势榜的静态站点：同一页面里分「中文版」与「全球版」两个板块，可切换日期，并在每周日额外提供一份「周报」。收录仓库名称、原始链接、简介、语言、星标数、README 导读与配图。

纯静态，无构建步骤，双击 `index.html` 即可打开（`file://` 下也能正常工作）。

## 目录结构

```
DailyGithub/
├── index.html                      # 站点外壳（唯一页面，日期 / 周期通过数据切换）
├── assets/
│   ├── css/site.css                # 全部样式（编辑风浅色主题）
│   ├── img/<date>/*.jpg            # 当日 README 配图（统一转 jpg，最长边 ≤1024、单张 <1MB）
│   └── js/
│       ├── site.js                 # 渲染逻辑：周期、板块、筛选、搜索、日期切换
│       └── data/YYYY-MM-DD.js      # 每日数据，一天一个文件（含 weekly 段）
├── reports/                        # 导出的 Markdown（按时间戳命名）
└── tools/                          # 采集与生成脚本
```

## 每日更新流程

一条命令采集四个榜单（`daily` 的中文/全球、`weekly` 的中文/全球），再走三步生成：

```bash
node tools/collect.js                 # 抓榜单 + README 摘要 + 下载配图 → tools/.cache/<date>.json
python tools/img-to-jpg.py <date>     # 配图转 jpg（≤1024px、<1MB），剔除小图标 → assets/img/<date>/
node tools/build-data.js <date>       # 合成数据文件（需 tools/copy-<date>.json 提供中文导读）
node tools/build-report.js <date>     # 导出日报 + 周报 Markdown
```

- `collect.js` 支持 `--only=daily|weekly` 与 `--reuse-detail`（复用已抓到的 README/配图缓存，只重解析榜单）。
- `build-data.js` 的数字全部取自采集结果，文案取自 `tools/copy-<date>.json`；同日同名仓库若历史数据已有导读，会自动复用。
- 最后在 `index.html` 底部按日期顺序补一行 `<script src="assets/js/data/YYYY-MM-DD.js"></script>`。

### 数据字段

| 字段 | 说明 |
| --- | --- |
| `owner` / `name` | 仓库归属与名称，链接自动拼为 `github.com/owner/name` |
| `desc` | GitHub 上的原始描述 |
| `intro` | 基于 README 的导读（全球版为中文编译） |
| `tag` | 18 字以内的一句话定位 |
| `lang` / `stars` / `today` | 语言、总星标、新增星标（日报=今日，周报=本周） |
| `img` / `imgW` / `imgH` | README 配图的本地 jpg 路径与尺寸；缺失时用排版式书封兜底 |
| `note` | 可选，当日编者按（写在 `copy-<date>.json` 的 `_note`），渲染为首页「今日观察」并进日报 |

`weekly` 段与日报同构，额外带 `label`（如「2026 年第 47 周」）与 `range`（如 `11.16 – 11.22`）。

## 页面能力

- 周期切换：**日报 / 周报**（周报按钮仅在存在周报数据时出现）。
- 板块切换：全部 / 中文版 / 全球版；关键词搜索。
- 日期切换：右上角选择器，或 `?date=YYYY-MM-DD`；周报直达用 `?period=weekly`。
- 每条内容保留原始仓库链接，榜单区块右上角直达原始榜单。

## 设计说明

- 浅色纸感底 + 朱红强调色，标题用衬线体、数据用等宽体，形成编辑版式（Folio / No. 编号）。
- 榜单前三名以「书封」大图呈现；无截图时用仓库名做排版封面。
- 长条形 logo（宽高比偏离 16:9）改用 `contain` 完整显示，避免被裁成半截文字。
- 星标上涨使用红色（国内行情惯例），并附新增星标的相对长度提示。

## 数据来源与声明

- 榜单与仓库元数据来自 GitHub Trending 每日榜 / 每周榜，星标数为采集时刻的页面展示值。
- 「简介」为仓库原始描述；「导读」为整理与中文编译，非逐字翻译。
- 配图取自仓库 README，已等比缩放转存为 jpg，版权归原作者所有，此处仅作介绍用途。
