// Wrap an external image URL with our same-origin proxy so the browser
// can load it without tripping factory CDN hotlink protections. Local
// (/-rooted) and data: URLs are returned unchanged.
export function proxyImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("data:")) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
}
