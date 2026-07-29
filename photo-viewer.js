// photo-viewer.js — просмотрщик фото с зумом
//
// КРИТИЧНЫЙ ФИКС: раньше reset(el) полностью УДАЛЯЛ все обработчики жестов (pointerdown/
// move/up и т.д.). Но страницы (feed.html, profile.html) вызывают attach() один раз за
// сессию, а затем на КАЖДОЕ открытие фото — reset(). То есть сразу после первого же
// открытия фото слушатели навешивались и тут же срывались, а флаг "уже прикреплено"
// не давал навесить их снова. В итоге зум (и вообще любые жесты) переставали работать
// после первого просмотра — оставался только "мёртвый" touch-action:none, из-за чего
// фото не реагировало вообще ни на что ("только одно положение").
// Теперь reset() лишь сбрасывает масштаб/позицию (визуальное состояние), а полное
// снятие обработчиков вынесено в отдельную detach() — её страницы не вызывают.
//
// Плюс: pinch-to-zoom двумя пальцами, двойной тап для зума, панорамирование увеличенного
// фото одним пальцем, зум колёсиком на десктопе.
window.BlizkoPhotoViewer = (function() {
  var DRAG_THRESHOLD = window.matchMedia('(pointer: coarse)').matches ? 12 : 6;
  var MIN_SCALE = 1;
  var MAX_SCALE = 4;
  var DOUBLE_TAP_MS = 300;
  var DOUBLE_TAP_DIST = 30;
  var DOUBLE_TAP_ZOOM = 2.5;

  function attach(el, options) {
    options = options || {};
    el.style.touchAction = 'none'; // сами обрабатываем и пан, и зум, и тап-жесты
    el.style.cursor = 'grab';

    var pointers = new Map(); // pointerId -> {x, y}

    var state = {
      scale: 1,
      tx: 0, ty: 0,
      dragging: false,
      moved: false,
      startX: 0, startY: 0,
      startTx: 0, startTy: 0,
      pinching: false,
      startDist: 0,
      startScale: 1,
      immersive: 0,
      lastTapTime: 0,
      lastTapX: 0, lastTapY: 0,
      suppressNextTap: false,
    };

    function applyTransform() {
      el.style.transform = 'translate(' + state.tx + 'px,' + state.ty + 'px) scale(' + state.scale + ')';
    }

    function resetZoom() {
      state.scale = 1;
      state.tx = 0;
      state.ty = 0;
      state.immersive = 0; // страница сама сбрасывает CSS-класс immersive при смене фото — держим внутреннее состояние в синхроне
      applyTransform();
    }

    function distance(p1, p2) {
      var dx = p1.x - p2.x, dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function midpoint(p1, p2) {
      return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }

    // Меняет масштаб так, чтобы точка (clientX, clientY) на экране осталась под пальцем/курсором.
    function zoomToward(clientX, clientY, targetScale) {
      var newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale));
      if (newScale === state.scale) return;

      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { state.scale = newScale; applyTransform(); return; }

      var fracX = (clientX - rect.left) / rect.width;
      var fracY = (clientY - rect.top) / rect.height;
      var newWidth = rect.width * (newScale / state.scale);
      var newHeight = rect.height * (newScale / state.scale);
      var newLeft = clientX - fracX * newWidth;
      var newTop = clientY - fracY * newHeight;

      state.tx += (newLeft - rect.left);
      state.ty += (newTop - rect.top);
      state.scale = newScale;

      if (state.scale <= 1.001) {
        resetZoom();
      } else {
        applyTransform();
      }
    }

    function onPointerDown(e) {
      if (e.target.closest('.modal-topbar') || e.target.closest('.modal-footer') || e.target.closest('button') || e.target.closest('a')) {
        return;
      }

      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);

      if (pointers.size === 1) {
        var now = Date.now();
        var dx = e.clientX - state.lastTapX;
        var dy = e.clientY - state.lastTapY;
        var isDoubleTap = (now - state.lastTapTime) < DOUBLE_TAP_MS
          && Math.abs(dx) < DOUBLE_TAP_DIST && Math.abs(dy) < DOUBLE_TAP_DIST;

        state.lastTapTime = now;
        state.lastTapX = e.clientX;
        state.lastTapY = e.clientY;

        if (isDoubleTap) {
          state.suppressNextTap = true;
          state.lastTapTime = 0;
          if (state.scale > 1) {
            resetZoom();
          } else {
            zoomToward(e.clientX, e.clientY, DOUBLE_TAP_ZOOM);
          }
        } else {
          state.suppressNextTap = false;
        }

        state.dragging = true;
        state.moved = false;
        state.startX = e.clientX;
        state.startY = e.clientY;
        state.startTx = state.tx;
        state.startTy = state.ty;
        el.style.cursor = 'grabbing';
      } else if (pointers.size === 2) {
        state.pinching = true;
        state.dragging = false;
        state.suppressNextTap = true;
        var pts = Array.from(pointers.values());
        state.startDist = distance(pts[0], pts[1]);
        state.startScale = state.scale;
      }
    }

    function onPointerMove(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (state.pinching && pointers.size >= 2) {
        var pts = Array.from(pointers.values());
        var newDist = distance(pts[0], pts[1]);
        var mid = midpoint(pts[0], pts[1]);
        if (state.startDist > 0) {
          var targetScale = state.startScale * (newDist / state.startDist);
          zoomToward(mid.x, mid.y, targetScale);
        }
        return;
      }

      if (state.dragging && pointers.size === 1) {
        var dx = e.clientX - state.startX;
        var dy = e.clientY - state.startY;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          state.moved = true;
        }

        if (state.scale > 1) {
          state.tx = state.startTx + dx;
          state.ty = state.startTy + dy;
          applyTransform();
        } else {
          // Как и раньше — небольшой визуальный сдвиг при обычном (не увеличенном) фото.
          el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
        }
      }
    }

    function onPointerEnd(e) {
      pointers.delete(e.pointerId);

      if (state.pinching) {
        if (pointers.size < 2) {
          state.pinching = false;
          state.startDist = 0;
          if (pointers.size === 1) {
            var remaining = Array.from(pointers.values())[0];
            state.dragging = true;
            state.moved = true;
            state.startX = remaining.x;
            state.startY = remaining.y;
            state.startTx = state.tx;
            state.startTy = state.ty;
          }
        }
        return;
      }

      if (!state.dragging) return;
      if (pointers.size > 0) return; // ждём отпускания всех пальцев

      state.dragging = false;
      el.style.cursor = 'grab';

      if (state.scale > 1) {
        applyTransform(); // фиксируем панораму, ничего не сбрасываем
        state.suppressNextTap = false;
        return;
      }

      el.style.transform = '';

      var isTap = !state.moved;
      if (isTap && !state.suppressNextTap) {
        cycleImmersive();
      }
      state.suppressNextTap = false;
    }

    function cycleImmersive() {
      state.immersive = (state.immersive + 1) % 2;
      if (options.onImmersiveChange) {
        options.onImmersiveChange(state.immersive);
      }
    }

    function onWheel(e) {
      e.preventDefault();
      var targetScale = state.scale - e.deltaY * 0.0025;
      zoomToward(e.clientX, e.clientY, targetScale);
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('pointerleave', onPointerEnd);
    el.addEventListener('wheel', onWheel, { passive: false });

    el._blizkoPhotoViewer = {
      onPointerDown: onPointerDown,
      onPointerMove: onPointerMove,
      onPointerEnd: onPointerEnd,
      onWheel: onWheel,
      resetZoom: resetZoom,
    };
  }

  // Сбрасывает ТОЛЬКО визуальное состояние (масштаб/позицию/immersive) перед показом
  // нового фото. НЕ трогает обработчики событий — attach() достаточно вызвать один раз
  // за всё время жизни страницы.
  function reset(el) {
    if (el._blizkoPhotoViewer && el._blizkoPhotoViewer.resetZoom) {
      el._blizkoPhotoViewer.resetZoom();
    } else {
      el.style.transform = '';
    }
    el.style.cursor = 'grab';
  }

  // Полностью снимает обработчики жестов — вызывать только если элемент действительно
  // уничтожается/заменяется и больше не будет использоваться (обычные страницы Blizko
  // это не делают, элемент модалки переиспользуется).
  function detach(el) {
    if (el._blizkoPhotoViewer) {
      el.removeEventListener('pointerdown', el._blizkoPhotoViewer.onPointerDown);
      el.removeEventListener('pointermove', el._blizkoPhotoViewer.onPointerMove);
      el.removeEventListener('pointerup', el._blizkoPhotoViewer.onPointerEnd);
      el.removeEventListener('pointercancel', el._blizkoPhotoViewer.onPointerEnd);
      el.removeEventListener('pointerleave', el._blizkoPhotoViewer.onPointerEnd);
      el.removeEventListener('wheel', el._blizkoPhotoViewer.onWheel);
      delete el._blizkoPhotoViewer;
    }
    el.style.transform = '';
    el.style.cursor = '';
    el.style.touchAction = '';
  }

  return {
    attach: attach,
    reset: reset,
    detach: detach
  };
})();
