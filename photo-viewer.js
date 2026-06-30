// photo-viewer.js — единая логика просмотра фото для feed.html и view-profile.html
//
// Поведение (как в Telegram):
// - 1-й тап по фото — переключает "иммерсивный" режим (прячет шапку/подпись)
// - Двойной тап — зум в точку тапа (туда-обратно)
// - Щепок (pinch) двумя пальцами — плавный зум
// - При увеличении — можно двигать фото пальцем (pan)
// - При отпускании с маленьким зумом — плавно возвращается к исходному размеру
//
// Использование:
//   BlizkoPhotoViewer.attach(imgOrVideoElement, {
//     onImmersiveChange: function(isImmersive) { ... показать/скрыть свою чашку ... }
//   });
//   // когда подменяешь src на новое фото — обязательно вызови:
//   BlizkoPhotoViewer.reset(imgOrVideoElement);

var BlizkoPhotoViewer = (function () {
  var MAX_SCALE = 4;
  var DOUBLE_TAP_ZOOM = 2.5;
  var DOUBLE_TAP_MS = 300;
  var DRAG_THRESHOLD = 6;

  function attach(el, opts) {
    opts = opts || {};
    var state = {
      scale: 1,
      posX: 0,
      posY: 0,
      pointers: {},
      startDist: 0,
      startScale: 1,
      startPosX: 0,
      startPosY: 0,
      dragged: false,
      lastTapTime: 0,
      immersiveLevel: 0 // 0 обычный, 1 fullscreen+подпись, 2 fullscreen чисто
    };
    el._blizkoViewerState = state;

    el.style.transformOrigin = 'center center';
    el.style.transition = 'transform 0.18s ease-out';
    el.style.touchAction = 'none';
    el.style.willChange = 'transform';

    function applyTransform(animated) {
      el.style.transition = animated ? 'transform 0.18s ease-out' : 'none';
      el.style.transform = 'translate(' + state.posX + 'px,' + state.posY + 'px) scale(' + state.scale + ')';
    }

    function clampPan() {
      // Простое ограничение, чтобы фото не уезжало далеко за экран при большом зуме
      var maxOffset = (state.scale - 1) * 150;
      if (maxOffset < 0) maxOffset = 0;
      if (state.posX > maxOffset) state.posX = maxOffset;
      if (state.posX < -maxOffset) state.posX = -maxOffset;
      if (state.posY > maxOffset) state.posY = maxOffset;
      if (state.posY < -maxOffset) state.posY = -maxOffset;
    }

    function resetZoom(animated) {
      state.scale = 1;
      state.posX = 0;
      state.posY = 0;
      applyTransform(animated !== false);
    }

    function cycleImmersive() {
      state.immersiveLevel = (state.immersiveLevel + 1) % 3;
      if (opts.onImmersiveChange) opts.onImmersiveChange(state.immersiveLevel);
    }

    function pointerCount() {
      return Object.keys(state.pointers).length;
    }

    el.addEventListener('pointerdown', function (e) {
      state.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      state.dragged = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}

      if (pointerCount() === 2) {
        var pts = Object.keys(state.pointers).map(function (k) { return state.pointers[k]; });
        state.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        state.startScale = state.scale;
      } else if (pointerCount() === 1) {
        state.startPosX = state.posX;
        state.startPosY = state.posY;
        state._dragStartX = e.clientX;
        state._dragStartY = e.clientY;
      }
    });

    el.addEventListener('pointermove', function (e) {
      if (!state.pointers[e.pointerId]) return;
      state.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var count = pointerCount();

      if (count === 2) {
        var pts = Object.keys(state.pointers).map(function (k) { return state.pointers[k]; });
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (state.startDist > 0) {
          var newScale = state.startScale * (dist / state.startDist);
          if (newScale < 1) newScale = 1;
          if (newScale > MAX_SCALE) newScale = MAX_SCALE;
          state.scale = newScale;
          clampPan();
          applyTransform(false);
        }
        state.dragged = true;
      } else if (count === 1 && state.scale > 1) {
        var dx = e.clientX - state._dragStartX;
        var dy = e.clientY - state._dragStartY;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) state.dragged = true;
        state.posX = state.startPosX + dx;
        state.posY = state.startPosY + dy;
        clampPan();
        applyTransform(false);
      } else if (count === 1) {
        var dx2 = e.clientX - state._dragStartX;
        var dy2 = e.clientY - state._dragStartY;
        if (Math.abs(dx2) > DRAG_THRESHOLD || Math.abs(dy2) > DRAG_THRESHOLD) state.dragged = true;
      }
    });

    function onPointerEnd(e) {
      delete state.pointers[e.pointerId];
      if (pointerCount() > 0) return;

      if (state.scale < 1.05 && !state.dragged) {
        resetZoom(true);
      } else if (state.scale < 1.05) {
        resetZoom(true);
      }

      if (!state.dragged) {
        var now = Date.now();
        if (now - state.lastTapTime < DOUBLE_TAP_MS) {
          // двойной тап — зум туда-обратно
          if (state.scale > 1) {
            resetZoom(true);
          } else {
            state.scale = DOUBLE_TAP_ZOOM;
            applyTransform(true);
          }
          state.lastTapTime = 0;
        } else {
          state.lastTapTime = now;
          // одиночный тап — ждём, не последует ли второй (для двойного тапа),
          // если нет — переключаем immersive
          (function () {
            var tapTimeAtSchedule = state.lastTapTime;
            setTimeout(function () {
              if (state.lastTapTime === tapTimeAtSchedule) {
                cycleImmersive();
              }
            }, DOUBLE_TAP_MS);
          })();
        }
      } else if (state.scale <= 1.05) {
        resetZoom(true);
      }

      state.dragged = false;
    }

    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
  }

  function reset(el) {
    if (el && el._blizkoViewerState) {
      el._blizkoViewerState.scale = 1;
      el._blizkoViewerState.posX = 0;
      el._blizkoViewerState.posY = 0;
      el._blizkoViewerState.immersiveLevel = 0;
      el.style.transition = 'none';
      el.style.transform = 'translate(0px,0px) scale(1)';
    }
  }

  return { attach: attach, reset: reset };
})();
