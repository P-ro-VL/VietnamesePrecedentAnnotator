import { proxyGet, sendProxyError, setProxyHeaders } from "../server/proxy.js";

const PDF_BASE_URL = "https://anle.toaan.gov.vn";

const firstValue = (value) => (Array.isArray(value) ? value[0] : value);

export default async function handler(request, response) {
  const path = firstValue(request.query.path);

  if (!path) {
    response.status(400).json({ error: "Missing path" });
    return;
  }

  const target = new URL(path.startsWith("/") ? path : `/${path}`, PDF_BASE_URL);

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
        "User-Agent": "curl/8.7.1",
        Accept: "application/pdf,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        Connection: "close",
        Host: "anle.toaan.gov.vn",
        Referer: "https://anle.toaan.gov.vn/webcenter/portal/anle/anle"
      },
      { attempts: 4, timeoutMs: 15000 }
    );

    setProxyHeaders(
      response,
      result,
      "application/pdf",
      "s-maxage=86400, stale-while-revalidate=604800"
    );
    response.send(result.body);
  } catch (error) {
    sendProxyError(response, error, target);
  }
}
