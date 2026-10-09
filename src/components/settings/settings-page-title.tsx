/**
 * Heading for a Settings subpage. The Settings layout already renders the
 * page-level <h1>, so every subpage uses this <h2> + one-sentence description
 * so users always know which panel they are in.
 */
export function SettingsPageTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold leading-tight">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground [text-wrap:pretty]">{description}</p>
    </div>
  );
}
