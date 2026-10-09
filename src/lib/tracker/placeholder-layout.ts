/**
 * PDGA publishes "Default Layout; 18 holes; Par 54" before a TD posts the real
 * layout. It is a placeholder, not a course — treat it as unpublished.
 */
export function isPlaceholderLayout(name: string | null | undefined): boolean {
  return !!name && /^\s*default layout\b/i.test(name);
}

export function publishedName(name: string | null | undefined): string | null {
  const t = name?.trim();
  return t && !isPlaceholderLayout(t) ? t : null;
}
