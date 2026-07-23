import { proxyGet, sendProxyError, setProxyHeaders } from "../server/proxy.js";

const PDF_BASE_URL = "https://anle.toaan.gov.vn";

const getPathString = (value) => {
  if (Array.isArray(value)) return value.join("/");
  return value ? String(value) : "";
};

export default async function handler(request, response) {
  const rawPath = getPathString(request.query.path);

  if (!rawPath) {
    response.status(400).json({ error: "Missing path" });
    return;
  }

  const target = new URL(rawPath.startsWith("/") ? rawPath : `/${rawPath}`, PDF_BASE_URL);

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
        Accept: "application/pdf,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        Host: "anle.toaan.gov.vn",
        Referer: "https://anle.toaan.gov.vn/webcenter/portal/anle/anle"
      },
      { attempts: 2, timeoutMs: 10000 }
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
