# 更新日志

本页面的变更记录。遵守 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

## [Unreleased]

### 新增
- 副标题"液态玻璃 · 2026"，随语言切换中英文
- GitHub Stars 实时计数（接口 `GET https://api.github.com/repos/ZCH-KK/kk`）
- 中/英文双语切换（`?lang=en` URL 参数 / localStorage 记忆）
- `404.html` 友好错误页
- `robots.txt` + `sitemap.xml`
- `assets/og.png` 社交分享预览图（Open Graph）
- `favicon.svg` 替换原来的 data: 零字节图标
- 小游戏「捞流光 / Catch the Glow」:右侧 ✦ 入口,液态玻璃浮层内接住坠落光球(彩球+1/金球+5/暗刺球扣心),3 心制 + 最高分记录,鼠标/触屏/键盘可玩,WebAudio 合成音效可关,明暗自适应(`?demo=1/2/3` 预览封面/开局/结算)

## [1.0.0] - 2026-09-04

### 安全加固
- 严格 CSP（`default-src 'none'` + `connect-src https://api.github.com`）
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy` 禁用摄像头/麦克风/地理位置/支付
- 外链 `rel="noopener noreferrer nofollow"`

### 无障碍
- `.ghost` 加 `role="img"` + `aria-label`
- SVG 加 `aria-hidden="true"` `focusable="false"`
- `prefers-reduced-motion` 尊重用户偏好
- `:focus-visible` 键盘焦点环

### 性能与兼容
- 内联 CSS/JS 抽离到外部 `assets/`，可上 GitHub Pages
- 涟漪用 `animationend` 移除（替代 `setTimeout`）
- 后台标签自动暂停轨道动画（降耗降温）
- IE 11 兼容（`assets/ie.css` + `assets/ie-polyfills.js`，玻璃模糊降级）
- 移动端 `viewport-fit=cover` + `env(safe-area-inset-*)`
- 小屏 (`<480px`) / 横屏 (`max-height: 500px`) 适配

### 移除
- 调试用 `anim_check.html`、`anim_proof.html`
## 2026-09-04 热修改功能

- 新增右下角齿轮入口 (`#hotedit-toggle`)
- 新增 `assets/hotedit.js` (6.3 KB, ES5)
- `lang.js` 切换语言时派发 `kk:lang-changed` 事件
- CSS 改用 `:root` 变量 (`--bg/--blob1..4/--glass`),实时改色
- localStorage 键:`kk-hotedit-v1`
- URL 覆盖:`?edit=1` 自动展开 / `?css.--blob1=%23ff0000` 等
- 范围:文案 (中英按钮标题/Stars 前后缀/Footer)、CSS 变量、JSON-LD 字段
- 不在范围:HTML 结构、head meta、CSP 规则(需重新部署)
- IE 11 走 `assets/ie.css` 纯色兜底,功能仍可用
