import { generateId, now } from "./utils.js";

const NOTE_KEY = "notes";
const CATEGORY_KEY = "categories";
const SETTINGS_KEY = "settings";

const DEFAULT_CATEGORIES = [
  { id: "learning", label: "学习笔记" },
  { id: "ideas", label: "灵感创意" }
];

const DEFAULT_SETTINGS = {
  theme: "light",
  defaultCategory: DEFAULT_CATEGORIES[0].id,
  shortcut: "Alt+N",
  screenshotQuality: 0.9,
  panelPosition: { top: 72, right: 48 }
};

export async function bootstrapStorage() {
  const store = await chrome.storage.local.get([CATEGORY_KEY, SETTINGS_KEY]);
  if (!store[CATEGORY_KEY]) {
    await chrome.storage.local.set({
      [CATEGORY_KEY]: DEFAULT_CATEGORIES.map((cat) => ({
        ...cat,
        createdAt: now(),
        updatedAt: now()
      }))
    });
  }
  if (!store[SETTINGS_KEY]) {
    await chrome.storage.local.set({
      [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, createdAt: now(), updatedAt: now() }
    });
  }
}

export async function listNotes() {
  const store = await chrome.storage.local.get(NOTE_KEY);
  const notes = Array.isArray(store[NOTE_KEY]) ? store[NOTE_KEY] : [];
  return notes.sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
}

export async function getNote(id) {
  if (!id) return null;
  const notes = await listNotes();
  return notes.find((note) => note.id === id) ?? null;
}

export async function saveNote(payload) {
  if (!payload) throw new Error("Missing note payload");

  const store = await chrome.storage.local.get(NOTE_KEY);
  const notes = Array.isArray(store[NOTE_KEY]) ? store[NOTE_KEY] : [];
  const timestamp = now();
  let nextNotes;

  if (payload.id) {
    nextNotes = notes.map((note) =>
      note.id === payload.id
        ? {
            ...note,
            ...payload,
            title: (payload.title ?? "").trim(),
            updatedAt: timestamp
          }
        : note
    );
  } else {
    const id = generateId("note");
    const fallbackCategory = await ensureDefaultCategory();
    const note = {
      id,
      title: (payload.title ?? "").trim(),
      body: payload.body ?? "",
      category: payload.category ?? fallbackCategory,
      attachments: normalizeAttachments(payload.attachments),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    nextNotes = [note, ...notes];
  }

  await chrome.storage.local.set({ [NOTE_KEY]: nextNotes });
  return payload.id ? payload.id : nextNotes[0].id;
}

export async function deleteNote(id) {
  if (!id) return;
  const store = await chrome.storage.local.get(NOTE_KEY);
  const notes = Array.isArray(store[NOTE_KEY]) ? store[NOTE_KEY] : [];
  const nextNotes = notes.filter((note) => note.id !== id);
  await chrome.storage.local.set({ [NOTE_KEY]: nextNotes });
}

export async function listCategories() {
  const store = await chrome.storage.local.get(CATEGORY_KEY);
  const categories = Array.isArray(store[CATEGORY_KEY]) ? store[CATEGORY_KEY] : [];
  return categories.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
}

export async function ensureCategory(rawLabel) {
  const label = sanitizeLabel(rawLabel);
  if (!label) {
    throw new Error("分类名称不能为空");
  }
  const store = await chrome.storage.local.get(CATEGORY_KEY);
  const categories = Array.isArray(store[CATEGORY_KEY]) ? store[CATEGORY_KEY] : [];
  const existing = categories.find(
    (category) => category.label.toLowerCase() === label.toLowerCase()
  );
  if (existing) {
    return existing;
  }
  const category = {
    id: generateId("category"),
    label,
    createdAt: now(),
    updatedAt: now()
  };
  await chrome.storage.local.set({ [CATEGORY_KEY]: [...categories, category] });
  return category;
}

export async function renameCategory(id, rawLabel) {
  const label = sanitizeLabel(rawLabel);
  if (!id || !label) throw new Error("缺少分类信息");
  const store = await chrome.storage.local.get(CATEGORY_KEY);
  const categories = Array.isArray(store[CATEGORY_KEY]) ? store[CATEGORY_KEY] : [];
  if (!categories.some((category) => category.id === id)) {
    throw new Error("分类不存在");
  }
  if (
    categories.some(
      (category) =>
        category.id !== id && category.label.toLowerCase() === label.toLowerCase()
    )
  ) {
    throw new Error("分类名称已存在");
  }
  const updated = categories.map((category) =>
    category.id === id ? { ...category, label, updatedAt: now() } : category
  );
  await chrome.storage.local.set({ [CATEGORY_KEY]: updated });
  return updated.find((category) => category.id === id);
}

export async function removeCategory(id, force = false) {
  if (!id) throw new Error("缺少分类 ID");
  const [notes, categories] = await Promise.all([listNotes(), listCategories()]);
  const target = categories.find((category) => category.id === id);
  if (!target) {
    throw new Error("分类不存在");
  }

  const nextCategory = await ensureDefaultCategory(id);
  const notesUsing = notes.filter((note) => note.category === id);
  if (notesUsing.length && !force) {
    return { blocked: true, usage: notesUsing.length };
  }

  if (notesUsing.length) {
    const reassigned = notes.map((note) =>
      note.category === id ? { ...note, category: nextCategory, updatedAt: now() } : note
    );
    await chrome.storage.local.set({ [NOTE_KEY]: reassigned });
  }

  const remaining = categories.filter((category) => category.id !== id);
  await chrome.storage.local.set({ [CATEGORY_KEY]: remaining });
  return { removed: true };
}

export async function getSettings() {
  const store = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(store[SETTINGS_KEY] ?? {}) };
}

export async function updateSettings(patch = {}) {
  const current = await getSettings();
  const next = {
    ...current,
    ...patch,
    updatedAt: now()
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getFullSnapshot() {
  const store = await chrome.storage.local.get([NOTE_KEY, CATEGORY_KEY, SETTINGS_KEY]);
  const notes = Array.isArray(store[NOTE_KEY]) ? store[NOTE_KEY] : [];
  const categories = Array.isArray(store[CATEGORY_KEY]) ? store[CATEGORY_KEY] : [];
  const settings = store[SETTINGS_KEY] ? store[SETTINGS_KEY] : { ...DEFAULT_SETTINGS };
  return {
    notes,
    categories: categories.length ? categories : DEFAULT_CATEGORIES,
    settings: { ...DEFAULT_SETTINGS, ...settings }
  };
}

export async function overwriteData(payload, replace = false) {
  if (!payload || typeof payload !== "object") {
    throw new Error("无效的导入数据");
  }
  const snapshot = await getFullSnapshot();
  const incomingNotes = normalizeNotes(payload.notes);
  const incomingCategories = normalizeCategories(payload.categories);
  const incomingSettings = {
    ...snapshot.settings,
    ...(payload.settings || {})
  };

  let notes = snapshot.notes;
  let categories = snapshot.categories;

  if (replace) {
    notes = incomingNotes;
    categories = incomingCategories.length ? incomingCategories : DEFAULT_CATEGORIES;
  } else {
    notes = mergeById(notes, incomingNotes);
    categories = mergeById(categories, incomingCategories);
  }

  if (!categories.length) {
    categories = DEFAULT_CATEGORIES;
  }

  await chrome.storage.local.set({
    [NOTE_KEY]: notes,
    [CATEGORY_KEY]: categories,
    [SETTINGS_KEY]: { ...incomingSettings, updatedAt: now() }
  });

  return { notes: notes.length, categories: categories.length };
}

function sanitizeLabel(label) {
  return (label ?? "").trim();
}

async function ensureDefaultCategory(excludeId) {
  const categories = await listCategories();
  const filtered = excludeId ? categories.filter((cat) => cat.id !== excludeId) : categories;
  if (!filtered.length) {
    await bootstrapStorage();
    const refreshed = await listCategories();
    const fallback = excludeId
      ? refreshed.filter((cat) => cat.id !== excludeId)
      : refreshed;
    return fallback[0]?.id ?? generateId("category");
  }
  return filtered[0].id;
}

function normalizeAttachments(attachments) {
  if (!attachments || typeof attachments !== "object") {
    return { images: [] };
  }
  const images = Array.isArray(attachments.images) ? attachments.images : [];
  return {
    images: images.map((image) => ({
      id: image.id ?? generateId("img"),
      dataUrl: image.dataUrl,
      mimeType: image.mimeType ?? "image/png",
      width: image.width ?? null,
      height: image.height ?? null,
      createdAt: image.createdAt ?? now()
    }))
  };
}

function normalizeNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes
    .map((note) => ({
      ...note,
      attachments: normalizeAttachments(note.attachments),
      createdAt: note.createdAt ?? now(),
      updatedAt: note.updatedAt ?? note.createdAt ?? now()
    }))
    .filter((note) => !!note.id);
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories)) return [];
  return categories
    .map((category) => ({
      id: category.id ?? generateId("category"),
      label: sanitizeLabel(category.label),
      createdAt: category.createdAt ?? now(),
      updatedAt: category.updatedAt ?? category.createdAt ?? now()
    }))
    .filter((category) => !!category.label);
}

function mergeById(base, incoming) {
  const map = new Map();
  for (const item of base) {
    if (item?.id) {
      map.set(item.id, item);
    }
  }
  for (const item of incoming) {
    if (item?.id) {
      map.set(item.id, { ...map.get(item.id), ...item, updatedAt: item.updatedAt ?? now() });
    }
  }
  return Array.from(map.values());
}
