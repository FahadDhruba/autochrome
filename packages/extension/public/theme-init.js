// Runs before the first paint (a classic script in <head>, because extension pages cannot use
// inline scripts): applies the theme cached by src/ui/theme.ts so there is no flash of the wrong one.
try {
  var theme = localStorage.getItem('autochrome.theme');
  if (theme === 'light' || theme === 'dark' || theme === 'system') {
    document.documentElement.setAttribute('data-theme', theme);
  }
} catch {
  // Storage blocked: the stylesheet falls back to the system theme.
}
