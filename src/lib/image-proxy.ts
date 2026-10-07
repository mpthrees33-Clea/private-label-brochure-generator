// Wrap an external image URL with our same-origin proxy so the browser
// can load it without tripping factory CDN hotlink protections. Local
// (/-rooted) and data: URLs are returned unchanged.
export function proxyImageUrl(
  url: string | null | undefined,
  opts?: { trim?: boolean },
): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("data:")) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
  // tv busts the immutable image cache when the trim changes.
  return opts?.trim ? `${base}&trim=1&tv=2` : base;
}
