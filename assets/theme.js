/* 明暗主题切换 (theme.js)
 * 优先级:URL ?theme=dark|light > localStorage kk-theme > 系统 prefers-color-scheme > 默认 dark
 * 放 <head> 里、样式表之前执行,避免首帧闪烁。
 * ES5 写法,不依赖内联脚本/样式(CSP 安全)。
 */
(function () {
  'use strict';
  var KEY = 'kk-theme';
  var root = document.documentElement;

  function sysPref() {
    try {
      if (window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    } catch (e) {}
    return 'dark';
  }

  function read() {
    // URL 参数优先(也方便预览/调试)
    var m = (window.location.search || '').match(/[?&]theme=(dark|light)/);
    if (m) return m[1];
    try {
      var s = localStorage.getItem(KEY);
      if (s === 'light' || s === 'dark') return s;
    } catch (e) {}
    return sysPref();
  }

  var theme = read();

  function isLight() { return theme === 'light'; }

  function apply() {
    root.setAttribute('data-theme', theme);

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isLight() ? '#eef3ff' : '#050f1f');

    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', isLight() ? 'true' : 'false');
      var zh = isLight() ? '切换到暗色模式' : '切换到亮色模式';
      var en = isLight() ? 'Switch to dark mode' : 'Switch to light mode';
      var label = ((root.lang || 'zh').indexOf('en') === 0) ? en : zh;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    }
  }

  function store(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }

  // 暴露给按钮点击/其他脚本
  window.kkSetTheme = function (next) {
    if (next !== 'light' && next !== 'dark') return;
    theme = next;
    store(next);
    apply();
  };

  function bind() {
    var btn = document.getElementById('theme-toggle');
    if (btn && btn.addEventListener) {
      btn.addEventListener('click', function () {
        window.kkSetTheme(isLight() ? 'dark' : 'light');
      });
    }

    // 系统主题变化时跟随(仅当用户没手动存过偏好)
    try {
      var mq = window.matchMedia('(prefers-color-scheme: light)');
      var onSys = function () {
        try {
          if (!localStorage.getItem(KEY)) { theme = sysPref(); apply(); }
        } catch (e) {}
      };
      if (mq && mq.addEventListener) mq.addEventListener('change', onSys);
      else if (mq && mq.addListener) mq.addListener(onSys);
    } catch (e) {}

    // 语言切换后刷新 aria-label 文案
    if (document.addEventListener) {
      document.addEventListener('kk:lang-changed', apply);
    }
  }

  apply();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
