/** One name-matching rule for course-wide tee colors, with safe CSS values. */
export function teeColor(name: string, own: string | null | undefined, sets: { name: string; color: string }[] = []): string {
  const normalized = name.trim().toLowerCase();
  const value = sets.find(set => set.name.trim().toLowerCase() === normalized)?.color ?? own;
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#2563eb";
}
