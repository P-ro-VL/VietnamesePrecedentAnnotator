import crypto from "node:crypto";
import https from "node:https";

const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toError = (error) => {
  if (error instanceof Error) return error;
  return new Error(String(error));
};

const DEFAULT_BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  Connection: "keep-alive"
};

const legacyAgentOptions = {
  keepAlive: false,
  rejectUnauthorized: false,
  ciphers: "DEFAULT:@SECLEVEL=0",
  minVersion: "TLSv1",
  secureOptions:
    (crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT || 0) |
    (crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION || 0)
};

const legacyAgent = new https.Agent(legacyAgentOptions);

const PROXY_BRIDGES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

const fetchViaProxyBridge = async (targetUrl, headers, timeoutMs) => {
  for (const bridgeFn of PROXY_BRIDGES) {
    try {
      const bridgeUrl = bridgeFn(targetUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await globalThis.fetch(bridgeUrl, {
        method: "GET",
        headers: {
          ...DEFAULT_BROWSER_HEADERS,
          ...headers
        },
        signal: controller.signal
      });

      clearTimeout(timer);

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const resHeaders = {};
        res.headers.forEach((val, key) => {
          resHeaders[key] = val;
        });

        const body = Buffer.from(arrayBuf);
        if (body.length > 0) {
          return {
            status: res.status,
            headers: resHeaders,
            body
          };
        }
      }
    } catch {
      // Continue trying next bridge
    }
  }

  return null;
};

const requestOnce = async (target, headers, timeoutMs) => {
  const mergedHeaders = { ...DEFAULT_BROWSER_HEADERS, ...headers };
  const targetUrlStr = target.toString();

  // Custom proxy URL from env if configured
  const customProxy = process.env.PROXY_URL || process.env.FORWARD_PROXY_URL;
  if (customProxy) {
    try {
      const proxyTarget = `${customProxy.endsWith("/") ? customProxy : customProxy + "/"}${encodeURIComponent(targetUrlStr)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await globalThis.fetch(proxyTarget, {
        method: "GET",
        headers: mergedHeaders,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const resHeaders = {};
        res.headers.forEach((val, key) => {
          resHeaders[key] = val;
        });
        return {
          status: res.status,
          headers: resHeaders,
          body: Buffer.from(arrayBuf)
        };
      }
    } catch {
      // continue to direct attempts
    }
  }

  // Attempt 1: Direct https.request with legacy TLS agent
  try {
    return await new Promise((resolve, reject) => {
      const request = https.request(
        target,
        {
          method: "GET",
          servername: target.hostname,
          rejectUnauthorized: false,
          agent: legacyAgent,
          timeout: timeoutMs,
          headers: mergedHeaders
        },
        (upstream) => {
          const chunks = [];

          upstream.on("data", (chunk) => chunks.push(chunk));
          upstream.on("end", () => {
            resolve({
              status: upstream.statusCode || 502,
              headers: upstream.headers,
              body: Buffer.concat(chunks)
            });
          });
        }
      );

      request.on("timeout", () => {
        request.destroy(new Error(`Upstream timeout after ${timeoutMs}ms`));
      });

      request.on("error", (error) => reject(toError(error)));
      request.end();
    });
  } catch (httpsErr) {
    // Attempt 2: Fallback via proxy bridge if direct connection fails (e.g. ECONNRESET due to Vercel IP geoblock)
    const bridgeResult = await fetchViaProxyBridge(targetUrlStr, headers, timeoutMs);
    if (bridgeResult && bridgeResult.status === 200 && bridgeResult.body.length > 0) {
      return bridgeResult;
    }

    // Attempt 3: Direct fetch fallback
    if (typeof globalThis.fetch === "function") {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await globalThis.fetch(targetUrlStr, {
          method: "GET",
          headers: mergedHeaders,
          signal: controller.signal
        });
        clearTimeout(timer);
        const arrayBuf = await res.arrayBuffer();
        const resHeaders = {};
        res.headers.forEach((val, key) => {
          resHeaders[key] = val;
        });
        return {
          status: res.status,
          headers: resHeaders,
          body: Buffer.from(arrayBuf)
        };
      } catch {
        // preserve initial httpsErr
      }
    }

    throw httpsErr;
  }
};

export const proxyGet = async (target, headers, options = {}) => {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 8000;
  let lastError = null;
  let lastResult = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await requestOnce(target, headers, timeoutMs);
      lastResult = result;

      if (!RETRY_STATUSES.has(result.status) || attempt === attempts) {
        return { ...result, attempts: attempt };
      }
    } catch (error) {
      lastError = toError(error);

      if (attempt === attempts) {
        throw Object.assign(lastError, { attempts: attempt });
      }
    }

    await sleep(250 * attempt);
  }

  if (lastResult) return { ...lastResult, attempts };
  throw Object.assign(lastError || new Error("Unknown upstream proxy error"), { attempts });
};

export const setProxyHeaders = (response, result, fallbackContentType, cacheControl) => {
  response.status(result.status);
  response.setHeader("Content-Type", result.headers["content-type"] || fallbackContentType);
  response.setHeader("Cache-Control", cacheControl);
  response.setHeader("X-Proxy-Attempts", String(result.attempts));

  const upstreamServer = result.headers.server;
  if (upstreamServer) response.setHeader("X-Upstream-Server", String(upstreamServer));
};

export const sendProxyError = (response, error, target) => {
  const normalizedError = toError(error);
  response.status(502).json({
    error: "Bad Gateway",
    target: target.toString(),
    message: normalizedError.message,
    code: normalizedError.code,
    attempts: normalizedError.attempts
  });
};
