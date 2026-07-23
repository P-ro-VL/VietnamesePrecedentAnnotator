import type { Annotation, FactItem, Precedent, RuleDraft } from "./types";
import { getDocumentUrl } from "./dataManifest";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseCaseFacts(factsStr: string): FactItem[] {
  if (!factsStr || !factsStr.trim()) return [{ id: "F1", fact: "" }];
  try {
    const parsed = JSON.parse(factsStr);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item, idx) => ({
        id: item.id || `F${idx + 1}`,
        fact: item.fact || String(item)
      }));
    }
  } catch {
    // Plain string parsing
  }

  const lines = factsStr
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [{ id: "F1", fact: "" }];

  return lines.map((line, idx) => {
    const match = line.match(/^(F\d+)\s*[:.-]\s*(.+)$/i);
    if (match) {
      return { id: match[1].toUpperCase(), fact: match[2].trim() };
    }
    return { id: `F${idx + 1}`, fact: line };
  });
}

const emptyRule = (index: number): RuleDraft => ({
  id: `R${index}`,
  operator: "AND",
  conditions: [""],
  conclusion: "",
  exception: "",
  sourceParagraph: "",
  statutoryProvisions: ""
});

export function parseLegalRules(rulesStr: string): RuleDraft[] {
  if (!rulesStr || !rulesStr.trim()) return [emptyRule(1)];
  try {
    const parsed = JSON.parse(rulesStr);

    function collectConditionsAndMeta(node: any) {
      const conds: string[] = [];
      let sourcePara = node.source?.paragraph || "";
      let statProvs = Array.isArray(node.source?.statutory_provisions)
        ? node.source.statutory_provisions.join("\n")
        : "";
      let exception = Array.isArray(node.exceptions) ? node.exceptions.join("\n") : "";

      function collectLeafs(n: any) {
        if (!n) return;
        const text = n.description || n.fact || "";
        if (text && (!n.children || n.children.length === 0)) {
          conds.push(text);
        } else if (text && n.node_type === "fact") {
          conds.push(text);
        }

        if (n.source?.paragraph && !sourcePara) sourcePara = n.source.paragraph;
        if (
          Array.isArray(n.source?.statutory_provisions) &&
          n.source.statutory_provisions.length &&
          !statProvs
        ) {
          statProvs = n.source.statutory_provisions.join("\n");
        }

        if (Array.isArray(n.children)) {
          n.children.forEach(collectLeafs);
        }
      }

      if (Array.isArray(node.children)) {
        node.children.forEach(collectLeafs);
      }

      return {
        name: node.predicate || node.name || "",
        conditions: conds.length ? conds : [node.description || ""],
        conclusion: node.description || "",
        exception,
        sourceParagraph: sourcePara,
        statutoryProvisions: statProvs,
        operator: (node.operator === "OR" ? "OR" : "AND") as "AND" | "OR"
      };
    }

    const sections: RuleDraft[] = [];
    if (parsed.root) {
      const res = collectConditionsAndMeta(parsed.root);
      sections.push({
        id: "R1",
        name: res.name,
        operator: res.operator,
        conditions: res.conditions,
        conclusion: res.conclusion,
        exception: res.exception,
        sourceParagraph: res.sourceParagraph,
        statutoryProvisions: res.statutoryProvisions
      });
    } else if (Array.isArray(parsed)) {
      parsed.forEach((item, idx) => {
        const res = collectConditionsAndMeta(item);
        sections.push({
          id: `R${idx + 1}`,
          name: res.name,
          operator: res.operator,
          conditions: res.conditions,
          conclusion: res.conclusion,
          exception: res.exception,
          sourceParagraph: res.sourceParagraph,
          statutoryProvisions: res.statutoryProvisions
        });
      });
    }

    return sections.length ? sections : [emptyRule(1)];
  } catch {
    return [emptyRule(1)];
  }
}

export function parseTraceabilityLegalConclusion(traceabilityStr: string): string {
  if (!traceabilityStr || !traceabilityStr.trim()) return "";
  try {
    const parsed = JSON.parse(traceabilityStr);
    if (parsed && typeof parsed.legal_conclusion === "string") {
      return parsed.legal_conclusion;
    }
  } catch {
    // plain text
  }
  return traceabilityStr;
}

export type PrecedentWithInitialAnnotation = Precedent & {
  initialAnnotation: Annotation;
};

let cachedPrecedents: PrecedentWithInitialAnnotation[] | null = null;

export async function fetchAllPrecedentsFromCsv(): Promise<PrecedentWithInitialAnnotation[]> {
  if (cachedPrecedents) return cachedPrecedents;

  const response = await fetch("/data/data.csv");
  if (!response.ok) {
    throw new Error(`Không thể tải file /data/data.csv (HTTP ${response.status})`);
  }

  const text = await response.text();
  const rawRows = parseCsv(text);

  if (rawRows.length <= 1) {
    throw new Error("File /data/data.csv không có dữ liệu.");
  }

  const dataRows = rawRows.slice(1);

  cachedPrecedents = dataRows.map((row, index) => {
    const caseId = row[0] || `CASE_${String(index + 1).padStart(3, "0")}`;
    const precedentNo = row[1] || "";
    const precedentName = row[2] || "";
    const domain = row[3] || "";
    const adoptingBody = row[4] || "";
    const adoptionDate = row[5] || "";
    const publicationDecision = row[6] || "";
    const sourceJudgment = row[7] || "";
    const caseType = row[8] || "";
    const plaintiff = row[9] || "";
    const defendant = row[10] || "";
    const relatedPersons = row[11] || "";
    const caseFactsStr = row[12] || "";
    const legalRulesStr = row[13] || "";
    const benchmarkQuestion = row[14] || "";
    const groundTruthRaw = (row[15] || "").trim().toLowerCase();
    const groundTruth: boolean | "" =
      groundTruthRaw === "true" ? true : groundTruthRaw === "false" ? false : "";
    const traceabilityStr = row[16] || "";

    const docUrl = getDocumentUrl(index);

    const precedent: Precedent = {
      id: caseId,
      index: index + 1,
      name: precedentName || `Án lệ ${precedentNo}`,
      downloadHref: docUrl,
      pdfUrl: docUrl,
      attributes: {
        precedentNo,
        domain,
        status: "Đang có hiệu lực",
        adoptionDate,
        effectiveDate: "",
        publicationDate: ""
      }
    };

    const initialAnnotation: Annotation = {
      case_id: caseId,
      precedent_no: precedentNo,
      precedent_name: precedentName,
      domain,
      adopting_body: adoptingBody,
      adoption_date: adoptionDate,
      publication_decision: publicationDecision,
      source_judgment: sourceJudgment,
      case_type: caseType,
      plaintiff,
      defendant,
      related_persons: relatedPersons,
      case_facts: parseCaseFacts(caseFactsStr),
      legal_rules: parseLegalRules(legalRulesStr),
      benchmark_question: benchmarkQuestion,
      ground_truth: groundTruth,
      legal_conclusion_source: parseTraceabilityLegalConclusion(traceabilityStr),
      traceability: traceabilityStr,
      status: "Đang có hiệu lực"
    };

    return {
      ...precedent,
      initialAnnotation
    };
  });

  return cachedPrecedents;
}

export async function fetchPrecedents(
  selectedPage: number,
  pageSize = 10
): Promise<{ items: PrecedentWithInitialAnnotation[]; totalPages: number; totalCount: number }> {
  const all = await fetchAllPrecedentsFromCsv();
  const totalCount = all.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const start = (selectedPage - 1) * pageSize;
  return {
    items: all.slice(start, start + pageSize),
    totalPages,
    totalCount
  };
}

export const listUrlForPage = (selectedPage: number) =>
  `/data/data.csv?page=${selectedPage}`;
