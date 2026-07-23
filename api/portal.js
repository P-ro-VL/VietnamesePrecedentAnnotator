import { proxyGet, sendProxyError, setProxyHeaders } from "../server/proxy.js";

const PORTAL_ORIGIN = "https://anle.toaan.gov.vn";

const getPathString = (value) => {
  if (Array.isArray(value)) return value.join("/");
  return value ? String(value) : "";
};

export default async function handler(request, response) {
  const rawPath = getPathString(request.query.path) || "/anle/anle";
  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const target = new URL(`/webcenter/portal${normalizedPath}`, PORTAL_ORIGIN);

  for (const [key, value] of Object.entries(request.query)) {
    if (key === "path") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => target.searchParams.append(key, item));
    } else if (value !== undefined) {
      target.searchParams.set(key, value);
    }
  }

  try {
    const result = await proxyGet(
      target,
      {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        Host: "anle.toaan.gov.vn",
        Referer: "https://anle.toaan.gov.vn/webcenter/portal/anle/anle"
      },
      { attempts: 2, timeoutMs: 7000 }
    );

    setProxyHeaders(
      response,
      result,
      "text/html; charset=utf-8",
      "s-maxage=300, stale-while-revalidate=3600"
    );
    response.send(result.body);
  } catch (error) {
    sendProxyError(response, error, target);
  }
}
