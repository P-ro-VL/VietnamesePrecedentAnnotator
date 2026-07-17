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
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "curl/8.7.1",
        Accept: "application/pdf,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        Referer: "https://anle.toaan.gov.vn/webcenter/portal/anle/anle"
      }
    });
    const body = await upstream.arrayBuffer();

    response.status(upstream.status);
    response.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/pdf"
    );
    response.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    response.send(Buffer.from(body));
  } catch (error) {
    response.status(502).json({
      error: "Bad Gateway",
      message: error instanceof Error ? error.message : "Cannot fetch upstream PDF"
    });
  }
}
