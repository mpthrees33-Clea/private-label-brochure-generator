// Where headless Chromium should load brochure HTML from.
//
// The public site sits behind nginx HTTP basic auth. Building the PDF
// URL from the incoming Host header (https://brochures.clea-solutions.ai/...)
// makes Chromium request that page with no credentials, which fails as
// net::ERR_INVALID_AUTH_CREDENTIALS. The Node process is already on the
// inside of that proxy, so the renderer should call loopback instead.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function resolveBrochureRenderOrigin(input: {
  hostHeader: string | null;
  forwardedProto: string | null;
  portEnv?: string | null;
  overrideEnv?: string | null;
}): string {
  const override = (input.overrideEnv ?? "").trim().replace(/\/+$/, "");
  if (override) return override;

  const portFromEnv = (input.portEnv ?? "").trim();
  if (/^\d+$/.test(portFromEnv)) {
    return `http://127.0.0.1:${portFromEnv}`;
  }

  // `next dev` often leaves PORT unset and listens on whatever Host
  // the browser used. Only trust that port when it is already loopback —
  // a public Host (brochures.clea-solutions.ai) is the proxy, not Node.
  const loopbackPort = loopbackPortFromHost(input.hostHeader);
  if (loopbackPort) return `http://127.0.0.1:${loopbackPort}`;

  return "http://127.0.0.1:3000";
}

function loopbackPortFromHost(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.trim();
  let hostname = host;
  let port = "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end === -1) return null;
    hostname = host.slice(1, end);
    port = host.slice(end + 1).replace(/^:/, "");
  } else {
    const idx = host.lastIndexOf(":");
    if (idx > -1 && /^\d+$/.test(host.slice(idx + 1))) {
      hostname = host.slice(0, idx);
      port = host.slice(idx + 1);
    }
  }
  if (!LOOPBACK_HOSTS.has(hostname.toLowerCase())) return null;
  return /^\d+$/.test(port) ? port : null;
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return LOOPBACK_HOSTS.has(hostname);
  } catch {
    return false;
  }
}
