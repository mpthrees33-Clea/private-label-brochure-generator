// Content-Type is not a reliable image signal. Factory CDNs often
// answer with application/octet-stream (or nothing) for a real JPEG/PNG/WebP.
export function sniffImageMime(buf: Uint8Array): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function isJunkImage(url: string, alt = ""): boolean {
  const u = url.toLowerCase();
  const a = alt.toLowerCase();
  // Match tokens, not substrings. "11x12" contains "1x1", and "narrow"
  // contains "arrow" — both showed up as real tile filenames.
  if (
    /(?:^|[^a-z])(?:logo|sprite|favicon|placeholder|spacer|badge)(?:[^a-z]|$)|blank\.gif|pixel\.gif|prev-slide|next-slide|social-|icon-|(?:^|[^\d])1x1(?:[^\d]|$)/.test(
      u,
    )
  ) {
    return true;
  }
  if (/^logo\b|^trim image$/.test(a)) return true;
  return false;
}

/** Florida Tile serves a tiny `_public` thumb and a usable `_larger` twin. */
export function largerTwinUrl(url: string): string | null {
  if (!/_public\.(png|jpe?g|webp)$/i.test(url)) return null;
  return url.replace(/_public\.(png|jpe?g|webp)$/i, "_larger.$1");
}
