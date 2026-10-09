/** Limit bytes while streaming, including when Content-Length is absent or false. */
export async function readBoundedBody(
  source: Request | Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const length = Number(source.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    await source.body?.cancel();
    throw new Error("payload_too_large");
  }
  const reader = source.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("payload_too_large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readBoundedText(
  source: Request | Response,
  maxBytes: number,
): Promise<string> {
  return new TextDecoder().decode(await readBoundedBody(source, maxBytes));
}
