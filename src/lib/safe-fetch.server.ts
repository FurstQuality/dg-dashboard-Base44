/** Follow only individually validated redirects, with a single time budget for the body too. */
export async function fetchAllowedUrl(
  raw: string,
  validate: (url: string) => string | URL,
  init: { headers?: HeadersInit; timeoutMs?: number } = {},
): Promise<Response> {
  let url = String(validate(raw));
  const signal = AbortSignal.timeout(init.timeoutMs ?? 15_000);
  for (let hop = 0; hop <= 4; hop++) {
    const response = await fetch(url, { headers: init.headers, redirect: "manual", signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || hop === 4) throw new Error("Unsupported source redirect");
    url = String(validate(new URL(location, url).href));
  }
  throw new Error("Too many source redirects");
}
