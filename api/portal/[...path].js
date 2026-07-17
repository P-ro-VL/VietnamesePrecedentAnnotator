const PORTAL_BASE_URL = "https://anle.toaan.gov.vn/webcenter/portal";

const getPath = (value) => {
  if (Array.isArray(value)) return value.join("/");
  return value || "";
};

export default async function handler(request, response) {
  const path = getPath(request.query.path);
  const target = new URL(`${PORTAL_BASE_URL}/${path}`);

  for (const [key, value] of Object.entries(request.query)) {
    if (key === "path") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => target.searchParams.append(key, item));
    } else if (value !== undefined) {
      target.searchParams.set(key, value);
    }
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "curl/8.7.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        Referer: "https://anle.toaan.gov.vn/webcenter/portal/anle/anle"
      }
    });
    const body = await upstream.arrayBuffer();

    response.status(upstream.status);
    response.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "text/html; charset=utf-8"
    );
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    response.send(Buffer.from(body));
  } catch (error) {
    response.status(502).json({
      error: "Bad Gateway",
      message: error instanceof Error ? error.message : "Cannot fetch upstream portal"
    });
  }
}
