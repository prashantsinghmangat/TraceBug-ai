import { describe, it, expect, beforeEach } from 'vitest';
import { injectTheme, applyThemeToRoot, removeTheme } from '../src/theme';
import { mountDashboard } from '../src/dashboard';

// init() applies the theme before mountDashboard() creates #tracebug-root, and
// applying it without a root is a no-op. From 2026-10-27 until this fix the
// root never got data-tb-theme, so no --tb-* token reached the in-page UI and
// every var() without a fallback resolved to nothing (the ticket's More menu
// rendered transparent over the panel behind it).

beforeEach(() => {
  removeTheme();
  document.getElementById('tracebug-root')?.remove();
  document.getElementById('tracebug-theme-vars')?.remove();
});

describe('theme reaches the in-page UI', () => {
  it('applying the theme before the root exists does nothing; applyThemeToRoot catches up', () => {
    injectTheme('dark');
    const root = document.createElement('div');
    root.id = 'tracebug-root';
    document.documentElement.appendChild(root);
    expect(root.getAttribute('data-tb-theme')).toBeNull();
    applyThemeToRoot();
    expect(root.getAttribute('data-tb-theme')).toBe('dark');
    expect(document.getElementById('tracebug-theme-vars')?.textContent).toContain('--tb-bg-elevated');
  });

  it('mountDashboard applies the theme chosen before the mount', () => {
    injectTheme('dark');
    expect(document.getElementById('tracebug-root')).toBeNull();
    const cleanup = mountDashboard('bottom-right' as never, undefined as never);
    try {
      expect(document.getElementById('tracebug-root')?.getAttribute('data-tb-theme')).toBe('dark');
    } finally {
      try { (cleanup as () => void)?.(); } catch {}
    }
  });
});
