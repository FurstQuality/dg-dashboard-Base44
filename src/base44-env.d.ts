declare module "base44:document" {
  export const Base44Scripts: import("react").ComponentType;
}
declare module "base44:runtime" {
  export const secrets: { get(name: string): string | undefined };
}
