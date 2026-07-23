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

const caseFactsToJson = (annotation: Annotation) => {
  if (Array.isArray(annotation.case_facts)) {
    return JSON.stringify(
      annotation.case_facts
        .filter((item) => item.fact.trim())
        .map((item, idx) => ({
          id: item.id || `F${idx + 1}`,
          fact: item.fact.trim()
        }))
    );
  }
  return String(annotation.case_facts || "");
};

const legalRulesToJson = (annotation: Annotation) => {
  const rootChildren = annotation.legal_rules
    .filter(
      (rule) =>
        rule.conditions.some((c) => c.trim()) ||
        rule.conclusion.trim() ||
        rule.exception.trim() ||
        rule.sourceParagraph.trim() ||
        rule.statutoryProvisions.trim()
    )
    .map((rule, idx) => {
      const ruleId = `R0.${idx + 1}`;
      const childFacts = rule.conditions
        .filter((c) => c.trim())
        .map((cond, cIdx) => ({
          id: `${ruleId}.${cIdx + 1}`,
          predicate: `condition_${cIdx + 1}`,
          description: cond.trim(),
          node_type: "fact",
          operator: "",
          children: [],
          fact_reference: `F${cIdx + 1}`,
          exceptions: [],
          source: {
            paragraph: rule.sourceParagraph.trim(),
            statutory_provisions: rule.statutoryProvisions
              .split(/\n+/)
              .map((s) => s.trim())
              .filter(Boolean)
          }
        }));

      return {
        id: ruleId,
        predicate: rule.name ? rule.name.trim() : `rule_${idx + 1}`,
        description: rule.conclusion.trim(),
        node_type: "rule",
        operator: rule.operator,
        children: childFacts,
        fact_reference: "",
        exceptions: rule.exception
          .split(/\n+/)
          .map((e) => e.trim())
          .filter(Boolean),
        source: {
          paragraph: rule.sourceParagraph.trim(),
          statutory_provisions: rule.statutoryProvisions
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean)
        }
      };
    });

  const rootObject = {
    root: {
      id: "R0",
      predicate: "main_rule",
      description: annotation.precedent_name || "",
      node_type: "rule",
      operator: "AND",
      children: rootChildren
    }
  };

  return JSON.stringify(rootObject);
};

const traceabilityToJson = (annotation: Annotation) => {
  const factRefs = Array.isArray(annotation.case_facts)
    ? annotation.case_facts
        .filter((f) => f.fact.trim())
        .map((f, idx) => ({
          fact_id: f.id || `F${idx + 1}`,
          reference: "Phần Nhận định của Tòa án"
        }))
    : [];

  return JSON.stringify({
    facts: factRefs,
    legal_conclusion: annotation.legal_conclusion_source || ""
  });
};

const serializeCell = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const buildCsv = (annotations: Annotation[]) => {
  const rows = annotations.map((annotation) => ({
    ...annotation,
    case_facts: caseFactsToJson(annotation),
    legal_rules: legalRulesToJson(annotation),
    ground_truth: String(annotation.ground_truth),
    traceability: traceabilityToJson(annotation)
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
