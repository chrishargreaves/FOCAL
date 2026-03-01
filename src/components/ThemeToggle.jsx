import { useOntologyStore } from '../store/ontologyStore.js';

export default function ThemeToggle() {
  const theme = useOntologyStore(s => s.theme);
  const toggleTheme = useOntologyStore(s => s.toggleTheme);

  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? '\u2600' : '\u263E'}
    </button>
  );
}
