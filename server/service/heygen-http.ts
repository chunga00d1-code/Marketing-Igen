import { ProxyAgent } from "undici";

let proxyAgent: ProxyAgent | null | undefined;

function getProxyAgent(): ProxyAgent | null {
  if (proxyAgent !== undefined) return proxyAgent;
  // Read after dotenv loads; restart to change proxy configuration.
  const proxyUrl = process.env.HEYGEN_PROXY_URL?.trim();
  if (!proxyUrl) {
    proxyAgent = null;
    return proxyAgent;
  }
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Unsupported proxy protocol");
    }
    proxyAgent = new ProxyAgent(proxyUrl);
  } catch {
    // Do not expose proxy credentials in configuration errors.
    throw new Error("HEYGEN_PROXY_URL must be a valid HTTP or HTTPS proxy URL.");
  }
  return proxyAgent;
}

export function fetchHeyGen(url: string, init?: RequestInit): Promise<Response> {
  const dispatcher = getProxyAgent();
  if (!dispatcher) return fetch(url, init);
  const proxyInit: RequestInit & { dispatcher: ProxyAgent } = { ...init, dispatcher };
  return fetch(url, proxyInit);
}
