// Apply saved theme and frame-embed flag synchronously before first paint.
try {
  if (window.top !== window.self) document.documentElement.setAttribute('data-framed', '1');
} catch (e) {
  document.documentElement.setAttribute('data-framed', '1');
}
try {
  var saved = localStorage.getItem('rd.theme');
  var theme = saved === 'dark' || saved === 'light'
    ? saved
    : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
} catch (e) { /* storage blocked */ }
