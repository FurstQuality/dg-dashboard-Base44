/** True when a UDisc player cell names a team ("A + B", "A & B", "A and B") — a doubles card. */
export function isTeamPlayerName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return /\S\s*(\+|&)\s*\S/.test(n) || /\S\s+and\s+\S/i.test(n);
}
