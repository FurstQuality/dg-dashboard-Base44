export type EndpointKind = "tee" | "basket";
export type EndpointRole = "main" | "alternate" | "drop_zone";
export type EndpointIdentity = { name: string; color: string; role?: EndpointRole };

/** Roles come from the endpoint allocation, never from its name or marker color. */
export function endpointRole(kind: EndpointKind, id: string, dropZone = false): EndpointRole {
  if (id === (kind === "tee" ? "main-tee" : "main-basket")) return "main";
  return kind === "tee" && dropZone ? "drop_zone" : "alternate";
}
export function endpointRoleLabel(kind: EndpointKind, role: EndpointRole): string {
  if (kind === "tee" && role === "drop_zone") return "Drop zone";
  return `${role === "main" ? "Main" : "Alternate"} ${kind}`;
}
export function endpointName(kind: EndpointKind, id: string, name: string, dropZone = false): string {
  return name.trim() || endpointRoleLabel(kind, endpointRole(kind, id, dropZone));
}
/** Only legacy/generic labels may fall back to a color group; Elite/Short/Blues
 * remain their own named identities even when they use the same color. */
export function isGenericTeeName(name: string): boolean {
  return !name.trim() || /^(main(?: tee)?|alternate tee|tee \d+)$/i.test(name.trim());
}
