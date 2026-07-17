import https from "node:https";

const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toError = (error) => {
  if (error instanceof Error) return error;
  return new Error(String(error));
};

const requestOnce = (target, headers, timeoutMs) =>
  new Promise((resolve, reject) => {
    const request = https.request(
      target,
      {
        method: "GET",
        family: 4,
        servername: target.hostname,
        rejectUnauthorized: false,
        timeout: timeoutMs,
        headers
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

export const proxyGet = async (target, headers, options = {}) => {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 12000;
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
