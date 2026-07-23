import type { Precedent } from "./types";

const PORTAL_ORIGIN = "https://anle.toaan.gov.vn";
const LIST_PATH = "/api/portal/anle/anle";
const CACHE_PAGE_COUNT = 5;

const normalize = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

const decodeHtml = (value: string) => {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return normalize(textarea.value);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchHtmlWithRetry = async (url: string, attempts = 3) => {
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/html" }
      });

      if (response.ok) return response;

      lastResponse = response;
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
        return response;
      }
    } catch {
      lastResponse = null;
    }

    if (attempt < attempts) {
      await sleep(300 * attempt);
    }
  }

  return lastResponse;
};

const cacheUrlForPage = (selectedPage: number) =>
  `/precedent-cache/page-${selectedPage}.html`;

const fetchCachedHtml = async (selectedPage: number) => {
  const response = await fetch(cacheUrlForPage(selectedPage), {
    cache: "force-cache",
    headers: { Accept: "text/html" }
  });

  return response.ok ? response.text() : "";
};

const getCellText = (row: HTMLTableRowElement, index: number) =>
  normalize(row.cells.item(index)?.textContent);

const looksLikePrecedentTable = (table: HTMLTableElement) => {
  const headers = Array.from(table.querySelectorAll("thead th")).map((cell) =>
    normalize(cell.textContent)
  );

  if (headers.includes("Số án lệ") && headers.includes("Tên án lệ")) {
    return true;
  }

  const firstRow = table.rows.item(0);
  if (!firstRow || firstRow.cells.length < 3) return false;
  return (
    getCellText(firstRow, 0) === "Số án lệ" &&
    getCellText(firstRow, 1) === "Tên án lệ"
  );
};

const parseAttributes = (row: HTMLTableRowElement): Precedent["attributes"] => {
  const fields = new Map<string, string>();
  const attributeRows = row.querySelectorAll<HTMLTableRowElement>(
    ".show-thuoctinh table tr"
  );

  attributeRows.forEach((attributeRow) => {
    const leftKey = normalize(attributeRow.cells.item(0)?.textContent);
    const leftValue = normalize(attributeRow.cells.item(1)?.textContent);
    const rightKey = normalize(attributeRow.cells.item(2)?.textContent);
    const rightValue = normalize(attributeRow.cells.item(3)?.textContent);

    if (leftKey) fields.set(leftKey, leftValue);
    if (rightKey) fields.set(rightKey, rightValue);
  });

  return {
    precedentNo: fields.get("Số án lệ") ?? "",
    domain: fields.get("Lĩnh vực") ?? "",
    status: fields.get("Trạng thái") ?? "",
    adoptionDate: fields.get("Ngày thông qua") ?? "",
    effectiveDate: fields.get("Ngày áp dụng") ?? "",
    publicationDate: fields.get("Ngày công bố") ?? ""
  };
};

const makeAbsolutePdfUrl = (href: string) => {
  if (!href) return "";
  const url = href.startsWith("http")
    ? new URL(href)
    : new URL(`${href.startsWith("/") ? "" : "/"}${href}`, PORTAL_ORIGIN);
  return `/api/precedent-pdf${url.pathname}${url.search}`;
};

const getPrecedentName = (row: HTMLTableRowElement) =>
  normalize(row.cells.item(1)?.querySelector("p a")?.textContent) || getCellText(row, 1);

const parsePrecedentsFromHtmlString = (html: string, selectedPage: number): Precedent[] => {
  const dataRows = html.match(/<tr>\s*<td><a[\s\S]*?<\/td>\s*<\/tr>/g) ?? [];

  return dataRows
    .filter((row) => row.includes("show-thuoctinh") && row.includes("Tải về"))
    .map((row, index) => {
      const nameMatch = row.match(/<td>\s*<p>\s*<a[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
      const hrefMatch = row.match(/<a\s+href=['"]([^'"]+)['"][^>]*>\s*<i[^>]*fa-download[\s\S]*?Tải về\s*<\/a>/i);
      const attributes: Precedent["attributes"] = {
        precedentNo: decodeHtml(row.match(/<td>\s*Số án lệ\s*<\/td>\s*<td>\s*<span>\s*([\s\S]*?)<\/span>/i)?.[1] ?? ""),
        domain: decodeHtml(row.match(/<td>\s*Lĩnh vực\s*<\/td>\s*<td>\s*([\s\S]*?)<\/td>/i)?.[1] ?? ""),
        status: decodeHtml(row.match(/<td>\s*Trạng thái\s*<\/td>\s*<td>\s*([\s\S]*?)<\/td>/i)?.[1] ?? ""),
        adoptionDate: decodeHtml(row.match(/<td[^>]*>\s*Ngày thông qua\s*<\/td>\s*<td[^>]*>[\s\S]*?<span[^>]*>\s*([\s\S]*?)<\/span>/i)?.[1] ?? ""),
        effectiveDate: decodeHtml(row.match(/<td>\s*Ngày áp dụng\s*<\/td>\s*<td>\s*<span[^>]*>\s*([\s\S]*?)<\/span>/i)?.[1] ?? ""),
        publicationDate: decodeHtml(row.match(/<td>\s*Ngày công bố\s*<\/td>\s*<td>\s*<span[^>]*>\s*([\s\S]*?)<\/span>/i)?.[1] ?? "")
      };
      const name = decodeHtml(nameMatch?.[1] ?? "");
      const downloadHref = hrefMatch?.[1] ?? "";

      return {
        id: attributes.precedentNo || `${selectedPage}-${index + 1}-${name}`,
        index: index + 1,
        name,
        downloadHref,
        pdfUrl: makeAbsolutePdfUrl(downloadHref),
        attributes
      };
    })
    .filter((precedent) => precedent.name);
};

export const listUrlForPage = (selectedPage: number) =>
  `${LIST_PATH}${LIST_PATH.includes("?") ? "&" : "?"}selectedPage=${selectedPage}&docType=AnLe`;

export async function fetchPrecedents(selectedPage: number): Promise<Precedent[]> {
  const response = await fetchHtmlWithRetry(listUrlForPage(selectedPage));

  let html = response?.ok ? await response.text() : await fetchCachedHtml(selectedPage);

  if (!html && selectedPage > CACHE_PAGE_COUNT) {
    return [];
  }

  if (!html) {
    throw new Error(`Không tải được danh sách án lệ (${response?.status ?? "network"})`);
  }

  if (!html.trim()) {
    return [];
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  const table =
    tables.find(looksLikePrecedentTable) ??
    tables.find((candidate) => candidate.querySelector(".show-thuoctinh"));

  if (!table) {
    const fallbackItems = parsePrecedentsFromHtmlString(html, selectedPage);
    if (fallbackItems.length) return fallbackItems;
    throw new Error("Không tìm thấy bảng án lệ trong HTML trả về.");
  }

  const items = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody > tr"))
    .filter((row) => row.querySelector(".show-thuoctinh"))
    .map((row, index) => {
      const link = Array.from(row.querySelectorAll<HTMLAnchorElement>("a")).find(
        (anchor) => normalize(anchor.textContent).includes("Tải về")
      );
      const name = getPrecedentName(row);
      const attributes = parseAttributes(row);
      const downloadHref = link?.getAttribute("href") ?? "";

      return {
        id: attributes.precedentNo || `${selectedPage}-${index + 1}-${name}`,
        index: index + 1,
        name,
        downloadHref,
        pdfUrl: makeAbsolutePdfUrl(downloadHref),
        attributes
      };
    })
    .filter((precedent) => precedent.name);

  return items.length ? items : parsePrecedentsFromHtmlString(html, selectedPage);
}
