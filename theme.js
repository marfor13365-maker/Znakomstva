// Общий модуль темы для всех страниц Blizko
// Подключается как <script src="theme.js"></script> ПЕРЕД остальными стилями не нужно —
// он применяется через JS сразу после загрузки DOM.

(function() {
  var THEMES = {
    pink: { accent: '#ff1744', accent2: '#ff5252' },
    tiffany: { accent: '#00bfb3', accent2: '#00e6d6' },
    green: { accent: '#00c853', accent2: '#43ea69' }
  };

  function getMode() {
    return localStorage.getItem('blizko_mode') || 'dark';
  }

  function getColor() {
    return localStorage.getItem('blizko_color') || 'pink';
  }

  function applyTheme() {
    var mode = getMode();
    var color = getColor();
    var c = THEMES[color] || THEMES.pink;

    var root = document.documentElement;
    root.style.setProperty('--accent', c.accent);
    root.style.setProperty('--accent2', c.accent2);

    if (mode === 'light') {
      root.style.setProperty('--bg', '#f7f7f9');
      root.style.setProperty('--card', '#ffffff');
      root.style.setProperty('--border', '#e3e3e8');
      root.style.setProperty('--text', '#16161a');
      root.style.setProperty('--muted', '#777');
      root.style.setProperty('--input-bg', '#f0f0f3');
    } else {
      root.style.setProperty('--bg', '#0d0d0d');
      root.style.setProperty('--card', '#161616');
      root.style.setProperty('--border', '#2a2a2a');
      root.style.setProperty('--text', '#f0f0f0');
      root.style.setProperty('--muted', '#888');
      root.style.setProperty('--input-bg', '#1e1e1e');
    }

    document.body.setAttribute('data-theme-mode', mode);
    document.body.setAttribute('data-theme-color', color);
  }

  function setMode(mode) {
    localStorage.setItem('blizko_mode', mode);
    applyTheme();
  }

  function setColor(color) {
    localStorage.setItem('blizko_color', color);
    applyTheme();
  }

  // Применяем тему сразу, не дожидаясь полной загрузки страницы
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTheme);
  } else {
    applyTheme();
  }

  window.BlizkoTheme = {
    apply: applyTheme,
    setMode: setMode,
    setColor: setColor,
    getMode: getMode,
    getColor: getColor
  };
})();
