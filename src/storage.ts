import type { Annotation } from "./types";

const STORAGE_KEY = "vprec-eval-annotations";
const DB_NAME = "vprec_eval_db";
const STORE_NAME = "annotations_store";

export type AnnotationStore = Record<string, Annotation>;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Synchronous initial load from localStorage
 */
export const loadAnnotations = (): AnnotationStore => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/**
 * Asynchronous load from IndexedDB (large capacity), falling back to localStorage
 */
export const loadAnnotationsAsync = async (): Promise<AnnotationStore> => {
  try {
    const db = await openDB();
    const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
    const getReq = store.get("all");

    const idbData = await new Promise<AnnotationStore | undefined>((resolve, reject) => {
      getReq.onsuccess = () => resolve(getReq.result as AnnotationStore);
      getReq.onerror = () => reject(getReq.error);
    });

    if (idbData && Object.keys(idbData).length > 0) {
      return idbData;
    }
  } catch (err) {
    console.warn("IndexedDB load warning:", err);
  }

  // Fallback to localStorage and migrate to IndexedDB if found
  const localData = loadAnnotations();
  if (Object.keys(localData).length > 0) {
    saveAnnotations(localData);
  }
  return localData;
};

/**
 * Save annotations to IndexedDB (unlimited size) and mirror to localStorage if space allows
 */
export const saveAnnotations = (annotations: AnnotationStore) => {
  // 1. Save to IndexedDB (supports hundreds of MBs/GBs)
  openDB()
    .then((db) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(annotations, "all");
    })
    .catch((err) => {
      console.error("Lỗi khi lưu vào IndexedDB:", err);
    });

  // 2. Mirror to localStorage as backup if size < 4.5MB
  try {
    const json = JSON.stringify(annotations);
    if (json.length < 4.5 * 1024 * 1024) {
      localStorage.setItem(STORAGE_KEY, json);
    }
  } catch (error) {
    console.warn("localStorage hết dung lượng; dữ liệu đã được lưu an toàn trong IndexedDB.", error);
  }
};
