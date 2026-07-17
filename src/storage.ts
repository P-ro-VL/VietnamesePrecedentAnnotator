import type { Annotation } from "./types";

const STORAGE_KEY = "vprec-eval-annotations";

export type AnnotationStore = Record<string, Annotation>;

export const loadAnnotations = (): AnnotationStore => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const saveAnnotations = (annotations: AnnotationStore) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
};
