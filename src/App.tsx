import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  Edit3,
  Loader2,
  Minus,
  Plus,
  Save,
  Trash2,
  X
} from "lucide-react";
import { downloadCsv } from "./csv";
import { fetchPrecedents, type PrecedentWithInitialAnnotation } from "./precedentParser";
import { loadAnnotations, loadAnnotationsAsync, saveAnnotations } from "./storage";
import type { Annotation, AnnotationStore, RuleDraft } from "./types";

const LABELING_GUIDE_URL =
  "https://docs.google.com/document/d/1GGHw_LtnvD9aOWkEHXPIBMybl5213zyWfWUULVNKJTM/edit?usp=sharing";

const emptyRule = (index: number): RuleDraft => ({
  id: `R${index}`,
  operator: "AND",
  conditions: [""],
  conclusion: "",
  exception: "",
  sourceParagraph: "",
  statutoryProvisions: ""
});

const createAnnotation = (precedent: PrecedentWithInitialAnnotation): Annotation => ({
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
  case_facts: [{ id: "F1", fact: "" }],
  legal_rules: [emptyRule(1)],
  benchmark_question: "",
  ground_truth: "",
  legal_conclusion_source: "",
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
  placeholder = "",
  disabled = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
      {label}
    </span>
    {multiline ? (
      <textarea
        disabled={disabled}
        className="min-h-24 w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    ) : (
      <input
        disabled={disabled}
        className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
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
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [precedents, setPrecedents] = useState<PrecedentWithInitialAnnotation[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationStore>(() => loadAnnotations());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);

  const [showGuideModal, setShowGuideModal] = useState(() => {
    return !sessionStorage.getItem("has_seen_labeling_guide");
  });

  const pendingIndexRef = useRef<number | "LAST" | null>(null);

  const closeGuideModal = () => {
    sessionStorage.setItem("has_seen_labeling_guide", "true");
    setShowGuideModal(false);
  };

  const openLabelingGuide = () => {
    window.open(LABELING_GUIDE_URL, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchPrecedents(selectedPage)
      .then(({ items, totalPages, totalCount }) => {
        if (!cancelled) {
          setPrecedents(items);
          setTotalPages(totalPages);
          setTotalCount(totalCount);

          const pending = pendingIndexRef.current;
          if (pending !== null) {
            pendingIndexRef.current = null;
            const targetIdx = pending === "LAST" ? items.length - 1 : pending;
            if (targetIdx >= 0 && targetIdx < items.length) {
              const precedent = items[targetIdx];
              setActiveIndex(targetIdx);
              setDraft(
                annotations[precedent.id] ?? precedent.initialAnnotation ?? createAnnotation(precedent)
              );
            }
          }
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setPrecedents([]);
          setError(err.message);
          pendingIndexRef.current = null;
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPage, annotations]);

  useEffect(() => {
    loadAnnotationsAsync().then((stored) => {
      if (stored && Object.keys(stored).length > 0) {
        setAnnotations((prev) => ({ ...prev, ...stored }));
      }
    });
  }, []);

  useEffect(() => {
    saveAnnotations(annotations);
  }, [annotations]);

  const activePrecedent = activeIndex === null ? null : precedents[activeIndex] ?? null;
  const annotatedCount = useMemo(() => Object.keys(annotations).length, [annotations]);

  const openDialog = (index: number) => {
    const precedent = precedents[index];
    setActiveIndex(index);
    setDraft(annotations[precedent.id] ?? precedent.initialAnnotation ?? createAnnotation(precedent));
  };

  const moveDialog = (offset: number) => {
    if (activeIndex === null) return;
    const nextIndex = activeIndex + offset;
    if (nextIndex >= 0 && nextIndex < precedents.length) {
      openDialog(nextIndex);
    } else if (offset > 0 && selectedPage < totalPages) {
      pendingIndexRef.current = 0;
      setSelectedPage((page) => page + 1);
    } else if (offset < 0 && selectedPage > 1) {
      pendingIndexRef.current = "LAST";
      setSelectedPage((page) => page - 1);
    }
  };

  const updateDraft = <K extends keyof Annotation>(key: K, value: Annotation[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  // Facts handlers
  const updateFact = (index: number, value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const updated = current.case_facts.map((item, i) =>
        i === index ? { ...item, fact: value } : item
      );
      return { ...current, case_facts: updated };
    });
  };

  const addFact = () => {
    setDraft((current) => {
      if (!current) return current;
      const nextId = `F${current.case_facts.length + 1}`;
      return {
        ...current,
        case_facts: [...current.case_facts, { id: nextId, fact: "" }]
      };
    });
  };

  const removeFact = (index: number) => {
    setDraft((current) => {
      if (!current || current.case_facts.length <= 1) return current;
      const updated = current.case_facts.filter((_, i) => i !== index);
      return { ...current, case_facts: updated };
    });
  };

  // Rules handlers
  const updateRule = (index: number, patch: Partial<RuleDraft>) => {
    setDraft((current) => {
      if (!current) return current;
      const legalRules = current.legal_rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      );
      return { ...current, legal_rules: legalRules };
    });
  };

  const addRuleSection = () => {
    setDraft((current) => {
      if (!current) return current;
      const nextIndex = current.legal_rules.length + 1;
      const newRule: RuleDraft = {
        id: `R${nextIndex}`,
        operator: "AND",
        conditions: [""],
        conclusion: "",
        exception: "",
        sourceParagraph: "",
        statutoryProvisions: ""
      };
      return { ...current, legal_rules: [...current.legal_rules, newRule] };
    });
  };

  const removeRuleSection = (index: number) => {
    setDraft((current) => {
      if (!current || current.legal_rules.length <= 1) return current;
      const updated = current.legal_rules.filter((_, i) => i !== index);
      const reindexed = updated.map((rule, idx) => ({ ...rule, id: `R${idx + 1}` }));
      return { ...current, legal_rules: reindexed };
    });
  };

  const addRuleCondition = (ruleIndex: number) => {
    setDraft((current) => {
      if (!current) return current;
      const updatedRules = current.legal_rules.map((rule, rIdx) => {
        if (rIdx !== ruleIndex) return rule;
        return { ...rule, conditions: [...rule.conditions, ""] };
      });
      return { ...current, legal_rules: updatedRules };
    });
  };

  const updateRuleCondition = (ruleIndex: number, condIndex: number, value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const updatedRules = current.legal_rules.map((rule, rIdx) => {
        if (rIdx !== ruleIndex) return rule;
        const updatedConds = rule.conditions.map((c, cIdx) => (cIdx === condIndex ? value : c));
        return { ...rule, conditions: updatedConds };
      });
      return { ...current, legal_rules: updatedRules };
    });
  };

  const removeRuleCondition = (ruleIndex: number, condIndex: number) => {
    setDraft((current) => {
      if (!current) return current;
      const updatedRules = current.legal_rules.map((rule, rIdx) => {
        if (rIdx !== ruleIndex || rule.conditions.length <= 1) return rule;
        const updatedConds = rule.conditions.filter((_, cIdx) => cIdx !== condIndex);
        return { ...rule, conditions: updatedConds };
      });
      return { ...current, legal_rules: updatedRules };
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
              Trang {selectedPage} / {totalPages}. Đã gán nhãn {annotatedCount} / {totalCount} án lệ.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <IconButton onClick={openLabelingGuide} title="Xem hướng dẫn gán nhãn">
              <BookOpen size={16} />
              Xem hướng dẫn gán nhãn
            </IconButton>
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
            <IconButton
              onClick={() => setSelectedPage((page) => Math.min(totalPages, page + 1))}
              disabled={selectedPage === totalPages || loading}
            >
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
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                    <span className="truncate font-mono">
                      {decodeURIComponent(activePrecedent.pdfUrl.split("/").pop() || "")}
                    </span>
                    <a
                      href={activePrecedent.pdfUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-slate-900 underline hover:text-slate-600"
                    >
                      <Download size={14} /> Tải văn bản gốc
                    </a>
                  </div>
                  {activePrecedent.pdfUrl.toLowerCase().endsWith(".pdf") ? (
                    <iframe
                      title={activePrecedent.name}
                      src={activePrecedent.pdfUrl}
                      className="h-full min-h-[380px] w-full flex-1"
                    />
                  ) : (
                    <div className="flex h-full flex-1 flex-col items-center justify-center p-6 text-center text-sm text-slate-600">
                      <p className="mb-3 font-medium">Tập tin văn bản dạng Word (.docx / .doc)</p>
                      <p className="mb-4 text-xs text-slate-500">
                        Văn bản án lệ này được lưu trữ dưới dạng file Word trong thư mục data local.
                      </p>
                      <a
                        href={activePrecedent.pdfUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center gap-2 border border-slate-900 bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
                      >
                        <Download size={16} /> Tải xuống file văn bản (
                        {activePrecedent.pdfUrl.split(".").pop()?.toUpperCase()})
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
                  Không tìm thấy liên kết văn bản cho án lệ này.
                </div>
              )}
            </section>

            <section className="flex min-h-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <div className="flex gap-2">
                  <IconButton
                    onClick={() => moveDialog(-1)}
                    disabled={loading || (selectedPage === 1 && activeIndex === 0)}
                  >
                    <ArrowLeft size={16} />
                    Án lệ trước đó
                  </IconButton>
                  <IconButton
                    onClick={() => moveDialog(1)}
                    disabled={
                      loading ||
                      (selectedPage === totalPages && activeIndex === precedents.length - 1)
                    }
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
                      disabled
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
                  <div className="space-y-3">
                    {draft.case_facts.map((factItem, index) => (
                      <div key={factItem.id || index} className="flex items-center gap-2">
                        <span className="inline-flex h-10 w-12 shrink-0 items-center justify-center border border-slate-300 bg-slate-100 font-mono text-xs font-semibold uppercase text-slate-700">
                          {`F${index + 1}`}
                        </span>
                        <input
                          className="h-10 flex-1 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900"
                          value={factItem.fact}
                          onChange={(e) => updateFact(index, e.target.value)}
                          placeholder={`Nhập tình tiết F${index + 1}...`}
                        />
                        <button
                          type="button"
                          onClick={() => removeFact(index)}
                          disabled={draft.case_facts.length <= 1}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-slate-300 bg-white text-slate-600 hover:border-slate-900 hover:text-slate-900 disabled:opacity-40 disabled:hover:border-slate-300"
                          title="Xóa tình tiết"
                        >
                          <Minus size={16} />
                        </button>
                      </div>
                    ))}
                    <IconButton onClick={addFact}>
                      <Plus size={16} /> Thêm tình tiết
                    </IconButton>
                  </div>
                </Step>

                <Step title="Bước 3. Suy luận quy tắc pháp lý">
                  <div className="space-y-4">
                    {draft.legal_rules.map((rule, index) => (
                      <div
                        key={`${rule.id}-${index}`}
                        className="relative border border-slate-300 bg-white p-4"
                      >
                        <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-semibold text-slate-900">Quy tắc {`R${index + 1}`}</h4>
                          <button
                            type="button"
                            onClick={() => removeRuleSection(index)}
                            disabled={draft.legal_rules.length <= 1}
                            className="inline-flex h-8 w-8 items-center justify-center text-slate-500 hover:text-red-600 disabled:opacity-30 disabled:hover:text-slate-500"
                            title="Xóa quy tắc này"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[110px_1fr_190px]">
                          <Field label="Mã quy tắc" value={`R${index + 1}`} onChange={() => { }} disabled />
                          <Field
                            label="Tên quy tắc"
                            value={rule.name || ""}
                            onChange={(val) => updateRule(index, { name: val })}
                            placeholder="Nhập tên quy tắc..."
                          />
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                              Toán tử
                            </span>
                            <select
                              className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900"
                              value={rule.operator}
                              onChange={(event) =>
                                updateRule(index, {
                                  operator: event.target.value as "AND" | "OR"
                                })
                              }
                            >
                              <option value="AND">VÀ (tất cả đều thoả mãn)</option>
                              <option value="OR">HOẶC (một trong các điều kiện thoả mãn)</option>
                            </select>
                          </label>
                        </div>

                        {/* Conditions section */}
                        <div className="mb-3 space-y-2 border-t border-slate-100 pt-3">
                          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                            Các điều kiện
                          </span>
                          {rule.conditions.map((cond, cIdx) => {
                            const trimmedCond = cond.trim();

                            let selectedRuleId = "";
                            if (trimmedCond) {
                              const matchedRule = draft.legal_rules.find(
                                (r) => r.id !== rule.id && (
                                  (r.name && r.name.trim() === trimmedCond) ||
                                  (r.name && `${r.id}: ${r.name}`.trim() === trimmedCond) ||
                                  r.conclusion.trim() === trimmedCond ||
                                  `${r.id}: ${r.conclusion}`.trim() === trimmedCond ||
                                  r.id === trimmedCond
                                )
                              );
                              if (matchedRule) {
                                selectedRuleId = matchedRule.id;
                              }
                            }

                            return (
                              <div key={cIdx} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-slate-300 bg-slate-100 font-mono text-xs font-semibold text-slate-700">
                                    {`C${cIdx + 1}`}
                                  </span>
                                  <select
                                    className="h-10 w-full border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-900 sm:w-48"
                                    value={selectedRuleId}
                                    onChange={(e) => {
                                      const chosenRuleId = e.target.value;
                                      if (chosenRuleId) {
                                        const targetRule = draft.legal_rules.find((r) => r.id === chosenRuleId);
                                        if (targetRule) {
                                          const ruleText = targetRule.name
                                            ? `${targetRule.id}: ${targetRule.name}`
                                            : (targetRule.conclusion ? `${targetRule.id}: ${targetRule.conclusion}` : targetRule.id);
                                          updateRuleCondition(index, cIdx, ruleText);
                                        }
                                      } else {
                                        updateRuleCondition(index, cIdx, "");
                                      }
                                    }}
                                  >
                                    <option value="">-- Không tham chiếu --</option>
                                    {draft.legal_rules.map((r, rIdx) => {
                                      const ruleId = r.id || `R${rIdx + 1}`;
                                      if (ruleId === `R${index + 1}` || ruleId === rule.id) return null;
                                      const ruleDisplayName = r.name
                                        ? r.name
                                        : (r.conclusion ? (r.conclusion.length > 25 ? `${r.conclusion.slice(0, 25)}...` : r.conclusion) : "(Chưa có tên)");
                                      return (
                                        <option key={`rule-${ruleId}`} value={ruleId}>
                                          {`[${ruleId}] ${ruleDisplayName}`}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                                <div className="flex flex-1 items-center gap-2">
                                  <input
                                    className="h-10 flex-1 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900"
                                    value={cond}
                                    onChange={(e) => updateRuleCondition(index, cIdx, e.target.value)}
                                    placeholder={`Điền tên điều kiện C${cIdx + 1}...`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeRuleCondition(index, cIdx)}
                                    disabled={rule.conditions.length <= 1}
                                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-slate-300 bg-white text-slate-600 hover:border-slate-900 hover:text-slate-900 disabled:opacity-40"
                                    title="Xóa điều kiện"
                                  >
                                    <Minus size={16} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          <IconButton onClick={() => addRuleCondition(index)}>
                            <Plus size={16} /> Thêm điều kiện
                          </IconButton>
                        </div>

                        <div className="space-y-3">
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
                            placeholder="Để trống nếu không có ngoại lệ"
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
                    <IconButton onClick={addRuleSection}>
                      <Plus size={16} /> Thêm quy tắc mới
                    </IconButton>
                  </div>
                </Step>

                <Step title="Bước 4. CÂU HỎI PHÁP LÝ CẦN TRẢ LỜI">
                  <Field
                    label="Câu hỏi pháp lý cần trả lời"
                    value={draft.benchmark_question}
                    onChange={(value) => updateDraft("benchmark_question", value)}
                    multiline
                  />
                </Step>

                <Step title="Bước 5. Xác định đáp án đúng">
                  <div className="space-y-3">
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
                    <Field
                      label="Đoạn nguồn xác định kết luận"
                      value={draft.legal_conclusion_source || ""}
                      onChange={(value) => updateDraft("legal_conclusion_source", value)}
                      multiline
                      placeholder="Nhập đoạn nguồn xác định kết luận..."
                    />
                  </div>
                </Step>
              </div>
            </section>
          </div>
        </div>
      )}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md border border-slate-300 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <BookOpen size={18} className="text-slate-700" />
                Hướng dẫn gán nhãn
              </h3>
              <button
                type="button"
                onClick={closeGuideModal}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="py-4 text-sm text-slate-700">
              Để đảm bảo nhãn được gán đúng quy trình, vui lòng đảm bảo đã đọc kỹ &quot;Hướng dẫn gán nhãn&quot;.
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeGuideModal}
                className="h-10 border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:border-slate-900"
              >
                Đã hiểu
              </button>
              <button
                type="button"
                onClick={() => {
                  openLabelingGuide();
                  closeGuideModal();
                }}
                className="inline-flex h-10 items-center gap-2 border border-slate-900 bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                <BookOpen size={16} />
                Xem hướng dẫn gán nhãn
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
