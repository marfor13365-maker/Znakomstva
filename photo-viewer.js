// photo-viewer.js — исправленный просмотрщик фото
window.BlizkoPhotoViewer = (function() {
  var DRAG_THRESHOLD = window.matchMedia('(pointer: coarse)').matches ? 12 : 6;
  
  function attach(el, options) {
    options = options || {};
    el.style.touchAction = 'pan-y'; // разрешаем вертикальный скролл
    el.style.cursor = 'grab';
    
    var state = {
      dragging: false,
      startX: 0, startY: 0,
      dx: 0, dy: 0,
      immersive: 0 // 0 = обычный, 1 = полный
    };
    
    function onPointerDown(e) {
      // Не обрабатывать, если клик по кнопкам или ссылкам внутри модалки
      if (e.target.closest('.modal-topbar') || e.target.closest('.modal-footer') || e.target.closest('button') || e.target.closest('a')) {
        return;
      }
      
      state.dragging = true;
      state.startX = e.clientX;
      state.startY = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    }
    
    function onPointerMove(e) {
      if (!state.dragging) return;
      state.dx = e.clientX - state.startX;
      state.dy = e.clientY - state.startY;
      
      // Если движение больше порога — считаем drag, не тап
      if (Math.abs(state.dx) > DRAG_THRESHOLD || Math.abs(state.dy) > DRAG_THRESHOLD) {
        el.style.transform = 'translate(' + state.dx + 'px, ' + state.dy + 'px)';
      }
    }
    
    function onPointerEnd(e) {
      if (!state.dragging) return;
      state.dragging = false;
      el.style.cursor = 'grab';
      el.style.transform = '';
      
      // Проверяем, был ли это тап (короткое движение)
      var isTap = Math.abs(state.dx) < DRAG_THRESHOLD && Math.abs(state.dy) < DRAG_THRESHOLD;
      
      if (isTap) {
        cycleImmersive();
      }
      
      state.dx = 0;
      state.dy = 0;
    }
    
    function cycleImmersive() {
      state.immersive = (state.immersive + 1) % 2; // 0 → 1 → 0
      if (options.onImmersiveChange) {
        options.onImmersiveChange(state.immersive);
      }
    }
    
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('pointerleave', onPointerEnd); // ← важно для мобильных
    
    // Сохраняем ссылки для removeEventListener если понадобится
    el._blizkoPhotoViewer = {
      onPointerDown: onPointerDown,
      onPointerMove: onPointerMove,
      onPointerEnd: onPointerEnd
    };
  }
  
  function reset(el) {
    if (el._blizkoPhotoViewer) {
      el.removeEventListener('pointerdown', el._blizkoPhotoViewer.onPointerDown);
      el.removeEventListener('pointermove', el._blizkoPhotoViewer.onPointerMove);
      el.removeEventListener('pointerup', el._blizkoPhotoViewer.onPointerEnd);
      el.removeEventListener('pointercancel', el._blizkoPhotoViewer.onPointerEnd);
      el.removeEventListener('pointerleave', el._blizkoPhotoViewer.onPointerEnd);
      delete el._blizkoPhotoViewer;
    }
    el.style.transform = '';
    el.style.cursor = '';
  }
  
  return {
    attach: attach,
    reset: reset
  };
})();
