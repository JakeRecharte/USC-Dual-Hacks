// MapLibre 5 needs WebGL2. When the browser can't give it a context, the Map constructor
// throws an Error whose message is JSON ({"requestedAttributes":…,"statusMessage":…}). That
// used to crash the whole page; the maps now catch it and show this instead.

export function describeMapError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? '');
  let status = '';
  try {
    const parsed = JSON.parse(raw) as { statusMessage?: string; requestedAttributes?: unknown };
    if (parsed && typeof parsed === 'object' && 'requestedAttributes' in parsed) {
      status = parsed.statusMessage ? ` (${parsed.statusMessage})` : '';
      return `The map needs WebGL2, and this browser couldn't start it${status}. Turn on hardware ` +
        'acceleration (chrome://settings/system), check chrome://gpu, or open the board in a regular ' +
        'Chrome or Safari window. Everything else on this page still works.';
    }
  } catch {
    // Not MapLibre's JSON: fall through to the plain message.
  }
  return `The map couldn't start: ${raw || 'unknown error'}. Everything else on this page still works.`;
}
