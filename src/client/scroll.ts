export function scrollToPosition(top: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top, left: 0, behavior: 'instant' });
    }
  } catch {
    try {
      window.scrollTo(0, top);
    } catch {
      // ignore
    }
  }
  try {
    (window as unknown as { scrollY: number }).scrollY = top;
  } catch {
    // ignore
  }
  if (typeof document !== 'undefined') {
    if (document.documentElement) {
      document.documentElement.scrollTop = top;
    }
    if (document.body) {
      document.body.scrollTop = top;
    }
  }
}

export function restoreScroll(top: number): void {
  scrollToPosition(top);
  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function'
  ) {
    window.requestAnimationFrame(() => {
      scrollToPosition(top);
    });
  }
}
