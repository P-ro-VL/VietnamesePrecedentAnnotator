import type { Annotation } from "./types";

const COLUMNS = [
  "case_id",
  "precedent_no",
  "precedent_name",
  "domain",
  "adopting_body",
  "adoption_date",
  "publication_decision",
  "source_judgment",
  "case_type",
  "plaintiff",
  "defendant",
  "related_persons",
  "case_facts",
  "legal_rules",
  "benchmark_question",
  "ground_truth",
  "traceability"
] as const;

const linesToJsonObject = (value: string, prefix: string) => {
  const entries = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return entries.reduce<Record<string, string>>((acc, entry, index) => {
    const match = entry.match(/^([A-Z]+\d+)\s*[:.-]\s*(.+)$/i);
    if (match) {
      acc[match[1].toUpperCase()] = match[2].trim();
    } else {
      acc[`${prefix}${index + 1}`] = entry;
    }
    return acc;
  }, {});
};

const legalRulesToJson = (annotation: Annotation) =>
  annotation.legal_rules
    .filter(
      (rule) =>
        rule.conditions.trim() ||
        rule.conclusion.trim() ||
        rule.exception.trim() ||
        rule.sourceParagraph.trim() ||
        rule.statutoryProvisions.trim()
    )
    .map((rule, index) => ({
      id: rule.id || `R${index + 1}`,
      rule: {
        operator: rule.operator,
        conditions: rule.conditions
          .split(/\n+/)
          .map((item) => item.trim())
          .filter(Boolean),
        conclusion: rule.conclusion.trim(),
        exception: rule.exception
          .split(/\n+/)
          .map((item) => item.trim())
          .filter(Boolean)
      },
      source: {
        paragraph: rule.sourceParagraph.trim(),
        statutory_provisions: rule.statutoryProvisions
          .split(/\n+/)
          .map((item) => item.trim())
          .filter(Boolean)
      }
    }));

const serializeCell = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const buildCsv = (annotations: Annotation[]) => {
  const rows = annotations.map((annotation) => ({
    ...annotation,
    case_facts: linesToJsonObject(annotation.case_facts, "F"),
    legal_rules: legalRulesToJson(annotation),
    ground_truth: String(annotation.ground_truth),
    traceability: linesToJsonObject(annotation.traceability, "T")
  }));

  return [
    COLUMNS.join(","),
    ...rows.map((row) => COLUMNS.map((column) => serializeCell(row[column])).join(","))
  ].join("\n");
};

export const downloadCsv = (annotations: Annotation[]) => {
  const csv = `\uFEFF${buildCsv(annotations)}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "VPRECEval.csv";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
