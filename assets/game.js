/* kk 主页小游戏 — 捞流光 (Catch the Glow)
 * 液态玻璃浮层 + canvas 游戏:
 *   移动鼠标 / 手指 / ←→ 键,让玻璃碗接住坠落的彩色光球。
 *   彩球 +1, 金球 +5, 暗刺球千万别接(扣 1 心), 漏彩/漏金扣 1 心。
 *   3 颗心用光则结束, 最高分存 localStorage(kk-catch-best)。
 *
 * 约束(与整站一致):
 *   - CSP: script-src 'self' → 无 eval / 无 new Function / 无 innerHTML
 *   - style-src 'self' → 所有样式走 style.css, 仅经 canvas/class 实现
 *   - ES5 语法, 无外部资源, 音效用 WebAudio 合成(不发请求)
 *   - 尊重 prefers-reduced-motion; document.hidden 时自动停帧省电
 */
(function () {
  'use strict';
  if (!document.querySelector || !document.getElementById || !document.createElement) return;

  var shell   = document.getElementById('game-shell');
  var openBtn = document.getElementById('game-open');
  var canvas  = document.getElementById('game-canvas');
  if (!shell || !openBtn || !canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var heartsEl = document.getElementById('game-hearts');
  var scoreEl  = document.getElementById('game-score-n');
  var coverEl  = document.getElementById('game-cover');
  var startBtn = document.getElementById('game-start');
  var resultEl = document.getElementById('game-result');
  var rsScore  = document.getElementById('result-score');
  var rsBest   = document.getElementById('result-best');
  var againBtn = document.getElementById('game-again');
  var exitBtn  = document.getElementById('game-exit');
  var sndBtn   = document.getElementById('game-snd');
  var closeBtn = document.getElementById('game-close');

  // ---- 主题感知 ----
  function isLightTheme() {
    var r = document.documentElement;
    return !!(r && r.getAttribute('data-theme') === 'light');
  }

  // ---- 配色:与主页背景彩圈同色系 粉/青/金/绿/冰蓝 ----
  var PAL = [[255,126,217],[92,224,255],[255,226,122],[138,255,193],[170,210,255]];
  var GOLD = [255, 216, 96];
  var DARK = [126, 96, 224];

  // ---- 游戏状态 ----
  var state = 'closed';       // closed | cover | play | over
  var W = 0, H = 0, DPR = 1;
  var score = 0, best = 0, hearts = 3;
  var bowlX = 0, targetX = 0, bowlHalfW = 48, bowlY = 0;
  var keyL = false, keyR = false;
  var balls = [], parts = [];
  var spawnTimer = 0, spawnGap = 980, elapsed = 0;
  var lastTs = 0, rafId = 0;
  var hurtT = 0;
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var light = false;

  // ---- 声音(WebAudio 合成, 无外链) ----
  var AC = null, sndOn = true;
  try { sndOn = localStorage.getItem('kk-catch-sound') !== '0'; } catch (e) {}
  function ac() {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (C) { try { AC = new C(); } catch (e) {} }
    }
    return AC;
  }
  function beep(freq, dur, type, vol, delay) {
    if (!sndOn) return;
    var a = ac();
    if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    var t = a.currentTime + (delay || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function sfxCatch()      { beep(620 + Math.random() * 220, 0.09, 'sine', 0.05); }
  function sfxGold()       { beep(880, 0.07, 'triangle', 0.06); beep(1318, 0.12, 'triangle', 0.06, 0.07); }
  function sfxHurt()       { beep(180, 0.16, 'sawtooth', 0.05); beep(110, 0.2, 'sawtooth', 0.04, 0.02); }
  function sfxStart()      { beep(520, 0.08, 'sine', 0.05); beep(780, 0.1, 'sine', 0.05, 0.08); }
  function sfxOver()       { beep(440, 0.14, 'triangle', 0.06); beep(330, 0.14, 'triangle', 0.05, 0.13); beep(247, 0.3, 'triangle', 0.05, 0.26); }

  // ---- 工具 ----
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function readBest() {
    try { best = parseInt(localStorage.getItem('kk-catch-best') || '0', 10) || 0; } catch (e) { best = 0; }
  }
  function writeBest() {
    try { localStorage.setItem('kk-catch-best', String(best)); } catch (e) {}
  }
  function isEn() {
    var l = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    return l.indexOf('en') === 0;
  }
  // 模拟 canvas ellipse(Safari 9 等无 ctx.ellipse 时的兜底)
  function ellipsePath(cx, cy, rx, ry, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.restore();
  }

  // ---- 布局 / 尺寸 ----
  function fit() {
    DPR = window.devicePixelRatio || 1;
    W = canvas.clientWidth || 300;
    H = canvas.clientHeight || 200;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bowlY = H - 30;
    if (state === 'play' || state === 'over') {
      bowlX = clamp(bowlX, bowlHalfW + 4, W - bowlHalfW - 4);
      targetX = bowlX;
    } else {
      bowlX = W / 2;
      targetX = bowlX;
    }
  }

  // ---- 粒子(接住光球的小迸溅;reduced-motion 时关闭) ----
  function spark(x, y, color, count, big) {
    if (reduced) return;
    var n = count || 10;
    for (var i = 0; i < n && parts.length < 70; i++) {
      var ang = rand(0, Math.PI * 2);
      var sp = rand(60, big ? 230 : 170);
      parts.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 40,
        life: 0, max: rand(380, big ? 800 : 620),
        rgb: color,
        size: rand(1.6, big ? 4 : 3)
      });
    }
  }

  // ---- 光球 ----
  function spawnBall() {
    var roll = Math.random();
    var kind = roll < 0.14 ? 'dark' : (roll < 0.22 ? 'gold' : 'normal');
    var baseV = 100 + Math.min(150, score * 2.6);        // 随得分加速
    var r = kind === 'gold' ? rand(16, 21) : rand(11, 17);
    var c;
    if (kind === 'dark') c = DARK;
    else if (kind === 'gold') c = GOLD;
    else c = PAL[(Math.random() * PAL.length) | 0];
    balls.push({
      x: rand(r + 4, W - r - 4),
      y: -r - 10,
      vx: rand(-24, 24),
      vy: baseV * rand(0.92, 1.12),
      r: r,
      kind: kind,
      rgb: c,
      phase: rand(0, Math.PI * 2)
    });
    // 球越多间隔越短;难度上限
    spawnGap = Math.max(430, 980 - balls.length * 40 - Math.min(180, score * 2));
  }

  // ---- 主循环 ----
  function loop(ts) {
    if (state === 'closed') return;
    if (!lastTs) lastTs = ts;
    var dt = clamp(ts - lastTs, 0, 50);
    lastTs = ts;
    if (document.hidden) { rafId = requestAnimationFrame(loop); return; } // 省电:仅停逻辑
    if (state === 'play') update(dt);
    else if (state === 'over') hurtT = Math.max(0, hurtT - dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    elapsed += dt;
    // 生成新球
    spawnTimer += dt;
    if (spawnTimer >= spawnGap && balls.length < 16) {
      spawnTimer = 0;
      spawnBall();
    }
    // 移动 / 接球判定
    var keep = [];
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      b.phase += dt / 900;
      b.x += b.vx * dt / 1000;
      b.y += b.vy * dt / 1000;
      if (b.x < b.r + 2)      { b.x = b.r + 2; b.vx = Math.abs(b.vx); }
      else if (b.x > W - b.r - 2) { b.x = W - b.r - 2; b.vx = -Math.abs(b.vx); }

      // 是否落进碗口(球下缘到达碗口平面时)
      if (b.y + b.r >= bowlY - 8 && b.y - b.r <= bowlY + 6 &&
          Math.abs(b.x - bowlX) <= bowlHalfW + b.r * 0.55) {
        onCaught(b);
        continue;
      }
      // 掉出屏幕底 → 漏球
      if (b.y - b.r > H + 8) {
        if (b.kind !== 'dark') loseHeart();
        continue;
      }
      keep.push(b);
    }
    balls = keep;

    // 碗:键盘微移 / 平滑跟随指针
    var kdir = (keyL ? -1 : 0) + (keyR ? 1 : 0);
    if (kdir !== 0) {
      bowlX += kdir * 430 * dt / 1000;
      targetX = bowlX;
    } else if (Math.abs(targetX - bowlX) > 0.5) {
      bowlX += (targetX - bowlX) * clamp(dt / 70, 0, 1);
    }
    bowlX = clamp(bowlX, bowlHalfW + 4, W - bowlHalfW - 4);

    // 粒子
    var kp = [];
    for (var j = 0; j < parts.length; j++) {
      var p = parts[j];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vy += 90 * dt / 1000;
      kp.push(p);
    }
    parts = kp;
    hurtT = Math.max(0, hurtT - dt);
  }

  function onCaught(b) {
    var i = balls.indexOf(b);
    if (i >= 0) balls.splice(i, 1);
    if (b.kind === 'dark') {
      spark(b.x, b.y, DARK, 12, false);
      sfxHurt();
      loseHeart();
    } else if (b.kind === 'gold') {
      score += 5;
      spark(b.x, b.y, GOLD, 14, true);
      sfxGold();
      paintScore();
    } else {
      score += 1;
      spark(b.x, b.y, b.rgb, 10, false);
      sfxCatch();
      paintScore();
    }
  }

  function loseHeart() {
    hearts--;
    paintHearts();
    if (hearts <= 0) gameOver();
    else { hurtT = 240; }
  }

  function paintScore() {
    if (scoreEl) scoreEl.textContent = String(score);
  }
  function paintHearts() {
    if (!heartsEl) return;
    var hs = heartsEl.querySelectorAll('.h');
    for (var i = 0; i < hs.length; i++) {
      hs[i].className = 'h' + (i < hearts ? ' on' : ' off');
    }
  }

  // ---- 结束 ----
  function gameOver() {
    state = 'over';
    hurtT = 0;
    sfxOver();
    var prev = best;
    if (score > best) {
      best = score;
      writeBest();
    }
    var newBest = best > prev;   // score 为 0 时不会误报新纪录
    if (rsScore) {
      var zh = '本局得分 ' + score + ' · 最佳 ' + best;
      var en = 'Score ' + score + ' · Best ' + best;
      rsScore.textContent = isEn() ? en : zh;
    }
    if (rsBest) {
      if (newBest) {
        rsBest.textContent = isEn() ? '✦ New Best!' : '✦ 新纪录!';
        rsBest.hidden = false;
      } else {
        rsBest.hidden = true;
      }
    }
    if (coverEl) coverEl.hidden = true;
    if (resultEl) resultEl.hidden = false;
    if (againBtn) againBtn.focus();
  }

  // ---- 开始 / 重置 ----
  function startGame() {
    score = 0; hearts = 3;
    balls = []; parts = [];
    spawnTimer = 0; spawnGap = 980; elapsed = 0; lastTs = 0;
    paintScore(); paintHearts();
    if (resultEl) resultEl.hidden = true;
    if (coverEl) coverEl.hidden = true;
    state = 'play';
    light = isLightTheme();
    sfxStart();
  }

  // ---- 浮层开合 ----
  function openGame() {
    if (state !== 'closed') return;
    shell.hidden = false;
    light = isLightTheme();
    state = 'cover';
    readBest();
    fit();
    // 封面文案固定(数字部分)
    if (coverEl) coverEl.hidden = false;
    if (resultEl) resultEl.hidden = true;
    if (closeBtn) closeBtn.focus();
    lastTs = 0;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function closeGame() {
    state = 'closed';
    shell.hidden = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    balls = []; parts = [];
    if (openBtn) openBtn.focus();
  }

  // ---- 输入 ----
  function pointerX(clientX) {
    var r = canvas.getBoundingClientRect();
    return clientX - r.left;
  }
  function moveTo(clientX) {
    targetX = clamp(pointerX(clientX), bowlHalfW + 4, W - bowlHalfW - 4);
  }

  function onPointer(e) {
    if (state !== 'play') return;
    var x = (e.touches && e.touches.length) ? e.touches[0].clientX
          : (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0].clientX
          : e.clientX;
    if (typeof x === 'number') moveTo(x);
    if (e.cancelable) { try { e.preventDefault(); } catch (err) {} }
  }

  // ---- 绑定 ----
  if (openBtn.addEventListener) {
    openBtn.addEventListener('click', openGame);
  }
  if (closeBtn && closeBtn.addEventListener) closeBtn.addEventListener('click', closeGame);
  if (exitBtn && exitBtn.addEventListener) exitBtn.addEventListener('click', closeGame);
  if (startBtn && startBtn.addEventListener) startBtn.addEventListener('click', startGame);
  if (againBtn && againBtn.addEventListener) againBtn.addEventListener('click', startGame);

  if (canvas.addEventListener) {
    canvas.addEventListener('mousemove', onPointer);
    canvas.addEventListener('touchstart', onPointer, { passive: false });
    canvas.addEventListener('touchmove', onPointer, { passive: false });
    canvas.addEventListener('touchend', onPointer, { passive: false });
    canvas.addEventListener('mousedown', onPointer);
  }

  if (document.addEventListener) {
    document.addEventListener('keydown', function (e) {
      var k = e.keyCode;
      if (state === 'closed') return;
      if (k === 27) { closeGame(); return; }                 // Esc 关闭
      if (state !== 'play') return;
      if (k === 37 || k === 65) keyL = true;                 // ← / A
      if (k === 39 || k === 68) keyR = true;                 // → / D
    });
    document.addEventListener('keyup', function (e) {
      var k = e.keyCode;
      if (k === 37 || k === 65) keyL = false;
      if (k === 39 || k === 68) keyR = false;
    });
  }

  // 声音开关
  if (sndBtn && sndBtn.addEventListener) {
    sndBtn.addEventListener('click', function () {
      sndOn = !sndOn;
      try { localStorage.setItem('kk-catch-sound', sndOn ? '1' : '0'); } catch (e) {}
      var lbl = isEn() ? (sndOn ? 'Sound on' : 'Sound off') : (sndOn ? '音效开' : '音效关');
      sndBtn.setAttribute('aria-pressed', sndOn ? 'true' : 'false');
      sndBtn.setAttribute('aria-label', lbl);
      sndBtn.setAttribute('title', lbl);
      sndBtn.textContent = sndOn ? '🔊' : '🔇';
      if (sndOn) beep(700, 0.08, 'sine', 0.05);
    });
    var sLabel = isEn() ? 'Sound on' : '音效开';
    sndBtn.setAttribute('aria-pressed', sndOn ? 'true' : 'false');
    sndBtn.setAttribute('aria-label', sLabel);
    sndBtn.setAttribute('title', sLabel);
    sndBtn.textContent = sndOn ? '🔊' : '🔇';
  }

  // 语言切换时刷新动态 aria(Emoji 图标由 lang.js 只刷 textContent,这里兜底)
  if (document.addEventListener) {
    document.addEventListener('kk:lang-changed', function () {
      if (sndBtn) {
        var lbl2 = isEn() ? (sndOn ? 'Sound on' : 'Sound off') : (sndOn ? '音效开' : '音效关');
        sndBtn.setAttribute('aria-label', lbl2);
        sndBtn.setAttribute('title', lbl2);
      }
      if (state === 'over' && rsScore) {
        var z = '本局得分 ' + score + ' · 最佳 ' + best;
        var e2 = 'Score ' + score + ' · Best ' + best;
        rsScore.textContent = isEn() ? e2 : z;
      }
    });
  }

  window.addEventListener('resize', function () { if (state !== 'closed') fit(); });

  // ---- 绘制 ----
  function drawBowl() {
    var x = bowlX, top = bowlY - 22, half = bowlHalfW, depth = 26;
    var bodyA = light ? 0.42 : 0.16;          // 玻璃体
    var rimC  = light ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)';
    var bodyC = light ? 'rgba(24,58,105,0.85)' : 'rgba(160,200,255,0.18)';

    // 碗壁(口略宽, 底略窄的杯形)
    ctx.beginPath();
    ctx.moveTo(x - half, top);
    ctx.quadraticCurveTo(x - half + 2, top + depth + 14, x, top + depth + 10);
    ctx.quadraticCurveTo(x + half - 2, top + depth + 14, x + half, top);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, top, 0, top + depth + 10);
    g.addColorStop(0, bodyC);
    g.addColorStop(1, light ? 'rgba(16,40,80,0.7)' : 'rgba(120,170,255,0.08)');
    ctx.fillStyle = g;
    ctx.fill();

    // 亮边(液态玻璃折射边缘)
    ctx.lineWidth = light ? 1.8 : 1.2;
    ctx.strokeStyle = rimC;
    ctx.stroke();

    // 口沿高光
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ellipsePath(x, top, half, 6, 0);
    ctx.stroke();

    // 内部水面(接住光球后微微闪光)
    ctx.beginPath();
    ellipsePath(x, top + depth + 8, half * 0.66, 4, 0);
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.55)' : 'rgba(160,220,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 高光点
    ctx.beginPath();
    ctx.fillStyle = light ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)';
    ctx.arc(x - half * 0.52, top + 5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBall(b) {
    var x = b.x, y = b.y, r = b.r;
    if (b.kind === 'dark') { drawDark(b); return; }
    // 外发光
    var g0 = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.1);
    g0.addColorStop(0, rgba(b.rgb, b.kind === 'gold' ? 0.5 : 0.3));
    g0.addColorStop(1, rgba(b.rgb, 0));
    ctx.fillStyle = g0;
    ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, Math.PI * 2); ctx.fill();

    // 球体(白芯彩壳, 像液态玻璃珠)
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,' + (b.kind === 'gold' ? 0.95 : 0.85) + ')');
    g.addColorStop(0.45, rgba(b.rgb, 0.9));
    g.addColorStop(1, rgba([b.rgb[0] * 0.55 | 0, b.rgb[1] * 0.55 | 0, b.rgb[2] * 0.6 | 0], 0.95));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  function drawDark(b) {
    var x = b.x, y = b.y, r = b.r;
    // 危险光晕
    var g0 = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.4);
    g0.addColorStop(0, 'rgba(150,110,240,0.4)');
    g0.addColorStop(1, 'rgba(150,110,240,0)');
    ctx.fillStyle = g0;
    ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();

    // 旋转的尖刺
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.phase);
    ctx.fillStyle = 'rgba(150,110,235,0.95)';
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a0 = i * Math.PI / 4;
      ctx.moveTo(Math.cos(a0) * r * 1.05, Math.sin(a0) * r * 1.05);
      ctx.lineTo(Math.cos(a0 + 0.17) * r * 1.6, Math.sin(a0 + 0.17) * r * 1.6);
      ctx.lineTo(Math.cos(a0 + 0.34) * r * 1.05, Math.sin(a0 + 0.34) * r * 1.05);
    }
    ctx.closePath();
    ctx.fill();

    // 核心(深紫黑)
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(190,160,255,0.9)');
    g.addColorStop(0.5, 'rgba(110,80,200,0.95)');
    g.addColorStop(1, 'rgba(45,25,90,0.98)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // 微弱景深底纹(液态玻璃浮层里的空间感)
    ctx.fillStyle = light ? 'rgba(160,190,230,0.12)' : 'rgba(120,180,255,0.05)';
    ctx.fillRect(0, 0, W, H);
    drawBowl();
    for (var i = 0; i < balls.length; i++) drawBall(balls[i]);

    // 粒子
    for (var j = 0; j < parts.length; j++) {
      var p = parts[j];
      var t = p.life / p.max;
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = rgba(p.rgb, 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 受伤红闪(仅 play 且刚扣心)
    if (hurtT > 0 && (state === 'play')) {
      var a = Math.min(0.4, hurtT / 240 * 0.4);
      ctx.strokeStyle = 'rgba(255,90,130,' + a.toFixed(3) + ')';
      ctx.lineWidth = Math.max(3, H * 0.02);
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
    }
  }

  // 调试/预览:?demo=1 打开封面浮层;?demo=2 直接开局;?demo=3 立即模拟漏 3 球看结算页
  var qs = window.location.search || '';
  var demoMode = /[?&]demo=([123])/.test(qs) ? parseInt(RegExp.$1, 10) : 0;
  if (demoMode) {
    function bootDemo() {
      openGame();
      if (demoMode >= 2) {
        startGame();
        if (demoMode === 3) {
          setTimeout(function () { loseHeart(); loseHeart(); loseHeart(); }, 120);
        }
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootDemo);
    } else {
      bootDemo();
    }
  }
})();
