import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Edit3,
  Loader2,
  Save,
  X
} from "lucide-react";
import { downloadCsv } from "./csv";
import { fetchPrecedents } from "./precedentParser";
import { loadAnnotations, saveAnnotations } from "./storage";
import type { Annotation, AnnotationStore, Precedent, RuleDraft } from "./types";

const emptyRule = (index: number): RuleDraft => ({
  id: `R${index}`,
  operator: "AND",
  conditions: "",
  conclusion: "",
  exception: "",
  sourceParagraph: "",
  statutoryProvisions: ""
});

const createAnnotation = (precedent: Precedent): Annotation => ({
  case_id: precedent.attributes.precedentNo
    ? `${precedent.attributes.precedentNo.replace(/[^\dA-Za-z]+/g, "_")}`
    : `AL_${precedent.index}`,
  precedent_no: precedent.attributes.precedentNo,
  precedent_name: precedent.name,
  domain: precedent.attributes.domain,
  adopting_body: "Hội đồng Thẩm phán Tòa án nhân dân tối cao",
  adoption_date: precedent.attributes.adoptionDate,
  publication_decision: "",
  source_judgment: "",
  case_type: "",
  plaintiff: "",
  defendant: "",
  related_persons: "",
  case_facts: "",
  legal_rules: [emptyRule(1)],
  benchmark_question: "",
  ground_truth: "",
  traceability: "",
  status: precedent.attributes.status,
  effective_date: precedent.attributes.effectiveDate,
  publication_date: precedent.attributes.publicationDate
});

const Field = ({
  label,
  value,
  onChange,
  multiline = false,
  placeholder = ""
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
      {label}
    </span>
    {multiline ? (
      <textarea
        className="min-h-24 w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    ) : (
      <input
        className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    )}
  </label>
);

const Step = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-b border-slate-200 pb-5">
    <h3 className="mb-3 text-sm font-semibold text-slate-950">{title}</h3>
    <div className="space-y-3">{children}</div>
  </section>
);

const IconButton = ({
  children,
  onClick,
  disabled = false,
  title
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onClick={onClick}
    className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:border-slate-900 disabled:hover:border-slate-300"
  >
    {children}
  </button>
);

export function App() {
  const [selectedPage, setSelectedPage] = useState(1);
  const [precedents, setPrecedents] = useState<Precedent[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationStore>(() => loadAnnotations());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchPrecedents(selectedPage)
      .then((items) => {
        if (!cancelled) setPrecedents(items);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setPrecedents([]);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPage]);

  useEffect(() => {
    saveAnnotations(annotations);
  }, [annotations]);

  const activePrecedent = activeIndex === null ? null : precedents[activeIndex] ?? null;
  const annotatedCount = useMemo(() => Object.keys(annotations).length, [annotations]);

  const openDialog = (index: number) => {
    const precedent = precedents[index];
    setActiveIndex(index);
    setDraft(annotations[precedent.id] ?? createAnnotation(precedent));
  };

  const moveDialog = (offset: number) => {
    if (activeIndex === null) return;
    const nextIndex = activeIndex + offset;
    if (nextIndex < 0 || nextIndex >= precedents.length) return;
    openDialog(nextIndex);
  };

  const updateDraft = <K extends keyof Annotation>(key: K, value: Annotation[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateRule = (index: number, patch: Partial<RuleDraft>) => {
    setDraft((current) => {
      if (!current) return current;
      const legalRules = current.legal_rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      );
      return { ...current, legal_rules: legalRules };
    });
  };

  const saveDraft = () => {
    if (!activePrecedent || !draft) return;
    setAnnotations((current) => ({
      ...current,
      [activePrecedent.id]: {
        ...draft,
        updated_at: new Date().toISOString()
      }
    }));
  };

  const exportData = () => {
    downloadCsv(Object.values(annotations));
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">VPREC-Eval Annotator</h1>
            <p className="mt-1 text-sm text-slate-600">
              Trang {selectedPage}. Đã gán nhãn {annotatedCount} án lệ.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <IconButton onClick={exportData} title="Xuất CSV">
              <Download size={16} />
              Xuất dữ liệu đã gán nhãn
            </IconButton>
          </div>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <IconButton
              onClick={() => setSelectedPage((page) => Math.max(1, page - 1))}
              disabled={selectedPage === 1 || loading}
            >
              <ArrowLeft size={16} />
              Trang trước
            </IconButton>
            <IconButton onClick={() => setSelectedPage((page) => page + 1)} disabled={loading}>
              Trang tiếp
              <ArrowRight size={16} />
            </IconButton>
          </div>
          {loading && (
            <div className="inline-flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="animate-spin" size={16} />
              Đang tải dữ liệu...
            </div>
          )}
        </section>

        {error && (
          <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-20 border-b border-slate-200 px-4 py-3">STT</th>
                <th className="border-b border-slate-200 px-4 py-3">Tên án lệ</th>
                <th className="w-44 border-b border-slate-200 px-4 py-3">
                  Trạng thái gán nhãn
                </th>
                <th className="w-40 border-b border-slate-200 px-4 py-3">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {!loading && precedents.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                    Không có dữ liệu để hiển thị.
                  </td>
                </tr>
              )}
              {precedents.map((precedent, index) => {
                const isAnnotated = Boolean(annotations[precedent.id]);
                return (
                  <tr key={precedent.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">{precedent.index}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{precedent.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {precedent.attributes.precedentNo} · {precedent.attributes.domain} ·{" "}
                        {precedent.attributes.status}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isAnnotated ? (
                        <Check className="text-emerald-700" size={20} aria-label="Đã gán nhãn" />
                      ) : (
                        <X className="text-slate-500" size={20} aria-label="Chưa gán nhãn" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <IconButton onClick={() => openDialog(index)}>
                        <Edit3 size={16} />
                        Gán nhãn
                      </IconButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {activePrecedent && draft && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 p-3">
          <div className="grid h-full grid-cols-1 overflow-hidden border border-slate-300 bg-white shadow-xl lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
            <section className="flex min-h-0 flex-col border-r border-slate-200">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{activePrecedent.name}</h2>
                  <p className="text-xs text-slate-500">{activePrecedent.attributes.precedentNo}</p>
                </div>
                <button
                  type="button"
                  className="h-9 border border-slate-300 px-3 text-sm hover:border-slate-900"
                  onClick={() => {
                    setActiveIndex(null);
                    setDraft(null);
                  }}
                >
                  Đóng
                </button>
              </div>
              {activePrecedent.pdfUrl ? (
                <iframe
                  title={activePrecedent.name}
                  src={activePrecedent.pdfUrl}
                  className="h-full min-h-[380px] w-full flex-1"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
                  Không tìm thấy liên kết PDF trong dòng dữ liệu này.
                </div>
              )}
            </section>

            <section className="flex min-h-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <div className="flex gap-2">
                  <IconButton onClick={() => moveDialog(-1)} disabled={activeIndex === 0}>
                    <ArrowLeft size={16} />
                    Án lệ trước đó
                  </IconButton>
                  <IconButton
                    onClick={() => moveDialog(1)}
                    disabled={activeIndex === precedents.length - 1}
                  >
                    Án lệ tiếp theo
                    <ArrowRight size={16} />
                  </IconButton>
                </div>
                <IconButton onClick={saveDraft}>
                  <Save size={16} />
                  Lưu
                </IconButton>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
                <Step title="Bước 1. Trích xuất thông tin án lệ">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field
                      label="Mã vụ việc"
                      value={draft.case_id}
                      onChange={(value) => updateDraft("case_id", value)}
                    />
                    <Field
                      label="Số án lệ"
                      value={draft.precedent_no}
                      onChange={(value) => updateDraft("precedent_no", value)}
                    />
                    <Field
                      label="Tên án lệ"
                      value={draft.precedent_name}
                      onChange={(value) => updateDraft("precedent_name", value)}
                    />
                    <Field
                      label="Lĩnh vực pháp luật"
                      value={draft.domain}
                      onChange={(value) => updateDraft("domain", value)}
                    />
                    <Field
                      label="Cơ quan thông qua"
                      value={draft.adopting_body}
                      onChange={(value) => updateDraft("adopting_body", value)}
                    />
                    <Field
                      label="Ngày thông qua"
                      value={draft.adoption_date}
                      onChange={(value) => updateDraft("adoption_date", value)}
                    />
                    <Field
                      label="Quyết định công bố"
                      value={draft.publication_decision}
                      onChange={(value) => updateDraft("publication_decision", value)}
                    />
                    <Field
                      label="Bản án nguồn"
                      value={draft.source_judgment}
                      onChange={(value) => updateDraft("source_judgment", value)}
                    />
                    <Field
                      label="Loại tranh chấp"
                      value={draft.case_type}
                      onChange={(value) => updateDraft("case_type", value)}
                    />
                    <Field
                      label="Nguyên đơn"
                      value={draft.plaintiff}
                      onChange={(value) => updateDraft("plaintiff", value)}
                    />
                    <Field
                      label="Bị đơn"
                      value={draft.defendant}
                      onChange={(value) => updateDraft("defendant", value)}
                    />
                    <Field
                      label="Người có quyền lợi, nghĩa vụ liên quan"
                      value={draft.related_persons}
                      onChange={(value) => updateDraft("related_persons", value)}
                    />
                  </div>
                </Step>

                <Step title="Bước 2. Trích xuất tình tiết vụ án">
                  <Field
                    label="Các tình tiết vụ án"
                    value={draft.case_facts}
                    onChange={(value) => updateDraft("case_facts", value)}
                    multiline
                    placeholder="Mỗi dòng một fact. Có thể ghi F1: ..."
                  />
                </Step>

                <Step title="Bước 3. Suy luận quy tắc pháp lý">
                  <div className="space-y-4">
                    {draft.legal_rules.map((rule, index) => (
                      <div key={`${rule.id}-${index}`} className="border border-slate-200 p-3">
                        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
                          <Field
                            label="Mã quy tắc"
                            value={rule.id}
                            onChange={(value) => updateRule(index, { id: value })}
                          />
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                              Toán tử
                            </span>
                            <select
                              className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900"
                              value={rule.operator}
                              onChange={(event) =>
                                updateRule(index, { operator: event.target.value as "AND" | "OR" })
                              }
                            >
                              <option value="AND">AND</option>
                              <option value="OR">OR</option>
                            </select>
                          </label>
                        </div>
                        <div className="space-y-3">
                          <Field
                            label="Điều kiện"
                            value={rule.conditions}
                            onChange={(value) => updateRule(index, { conditions: value })}
                            multiline
                            placeholder="Mỗi dòng một condition"
                          />
                          <Field
                            label="Hệ quả pháp lý"
                            value={rule.conclusion}
                            onChange={(value) => updateRule(index, { conclusion: value })}
                            multiline
                          />
                          <Field
                            label="Ngoại lệ"
                            value={rule.exception}
                            onChange={(value) => updateRule(index, { exception: value })}
                            multiline
                            placeholder="Để trống nếu không có exception"
                          />
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <Field
                              label="Đoạn nguồn"
                              value={rule.sourceParagraph}
                              onChange={(value) => updateRule(index, { sourceParagraph: value })}
                            />
                            <Field
                              label="Quy định pháp luật liên quan"
                              value={rule.statutoryProvisions}
                              onChange={(value) =>
                                updateRule(index, { statutoryProvisions: value })
                              }
                              multiline
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <IconButton
                      onClick={() =>
                        updateDraft("legal_rules", [
                          ...draft.legal_rules,
                          emptyRule(draft.legal_rules.length + 1)
                        ])
                      }
                    >
                      Thêm rule
                    </IconButton>
                  </div>
                </Step>

                <Step title="Bước 4. Xây dựng câu hỏi benchmark">
                  <Field
                    label="Câu hỏi benchmark"
                    value={draft.benchmark_question}
                    onChange={(value) => updateDraft("benchmark_question", value)}
                    multiline
                  />
                </Step>

                <Step title="Bước 5. Xác định đáp án đúng">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                      Đáp án đúng
                    </span>
                    <select
                      className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900"
                      value={String(draft.ground_truth)}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateDraft(
                          "ground_truth",
                          value === "" ? "" : value === "true"
                        );
                      }}
                    >
                      <option value="">Chưa chọn</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </label>
                </Step>

                <Step title="Bước 6. Kiểm tra chất lượng và truy vết">
                  <Field
                    label="Truy vết nguồn"
                    value={draft.traceability}
                    onChange={(value) => updateDraft("traceability", value)}
                    multiline
                    placeholder="Mỗi dòng một mapping. Ví dụ F1: Đoạn [10]"
                  />
                  <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 md:grid-cols-3">
                    <div>Trạng thái: {draft.status || "Chưa có"}</div>
                    <div>Ngày áp dụng: {draft.effective_date || "Chưa có"}</div>
                    <div>Ngày công bố: {draft.publication_date || "Chưa có"}</div>
                  </div>
                </Step>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
