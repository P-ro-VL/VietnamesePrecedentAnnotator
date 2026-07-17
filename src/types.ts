export type Precedent = {
  id: string;
  index: number;
  name: string;
  downloadHref: string;
  pdfUrl: string;
  attributes: {
    precedentNo: string;
    domain: string;
    status: string;
    adoptionDate: string;
    effectiveDate: string;
    publicationDate: string;
  };
};

export type RuleDraft = {
  id: string;
  operator: "AND" | "OR";
  conditions: string;
  conclusion: string;
  exception: string;
  sourceParagraph: string;
  statutoryProvisions: string;
};

export type Annotation = {
  case_id: string;
  precedent_no: string;
  precedent_name: string;
  domain: string;
  adopting_body: string;
  adoption_date: string;
  publication_decision: string;
  source_judgment: string;
  case_type: string;
  plaintiff: string;
  defendant: string;
  related_persons: string;
  case_facts: string;
  legal_rules: RuleDraft[];
  benchmark_question: string;
  ground_truth: boolean | "";
  traceability: string;
  status?: string;
  effective_date?: string;
  publication_date?: string;
  updated_at?: string;
};
