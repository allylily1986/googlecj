const state = {
  notes: [],
  categories: [],
  selection: new Set()
};

const elements = {
  categoryFilter: document.querySelector("#category-filter"),
  searchInput: document.querySelector("#search"),
  noteList: document.querySelector("[data-role=notes]"),
  status: document.querySelector("[data-role=status]"),
  toast: document.querySelector("[data-role=toast]"),
  template: document.querySelector("#note-card-template")
};

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await refreshData();
  render();
});

function bindEvents() {
  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    switch (action) {
      case "new-note":
        await openPanel();
        window.close();
        break;
      case "open-options":
        chrome.runtime.openOptionsPage();
        break;
      case "select-all":
        state.notes.forEach((note) => state.selection.add(note.id));
        render();
        break;
      case "clear-selection":
        state.selection.clear();
        render();
        break;
      case "export-markdown":
        await exportSelected("markdown");
        break;
      case "export-docx":
        await exportSelected("docx");
        break;
      default:
        break;
    }
  });

  elements.categoryFilter.addEventListener("change", render);
  elements.searchInput.addEventListener("input", render);

  elements.noteList.addEventListener("click", onListClick);
  elements.noteList.addEventListener("change", onListChange);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshData().then(render);
    }
  });
}

async function refreshData() {
  const [notes, categories] = await Promise.all([
    sendMessage({ type: "notes:list" }),
    sendMessage({ type: "categories:list" })
  ]);
  state.notes = notes;
  state.categories = categories;
  rebuildCategoryFilter();
  updateStatus();
}

function rebuildCategoryFilter() {
  const current = elements.categoryFilter.value || "all";
  elements.categoryFilter.innerHTML = `<option value="all">全部</option>`;
  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.label;
    elements.categoryFilter.appendChild(option);
  });
  elements.categoryFilter.value = current;
}

function render() {
  const filtered = applyFilters(state.notes);
  elements.noteList.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.notes.length
      ? "未找到匹配的笔记"
      : "还没有任何记录，按 Alt+N 即刻捕捉灵感。";
    elements.noteList.appendChild(empty);
    return;
  }

  filtered.forEach((note) => {
    const card = renderNoteCard(note);
    elements.noteList.appendChild(card);
  });
  updateStatus(filtered.length);
}

function applyFilters(notes) {
  const keyword = elements.searchInput.value.trim().toLowerCase();
  const category = elements.categoryFilter.value;
  return notes.filter((note) => {
    const matchCategory = category === "all" || note.category === category;
    if (!matchCategory) return false;
    if (!keyword) return true;
    const haystack = `${note.title || ""} ${note.body || ""}`.toLowerCase();
    return haystack.includes(keyword);
  });
}

function renderNoteCard(note) {
  const fragment = elements.template.content.cloneNode(true);
  const root = fragment.querySelector(".note-card");

  fragment.querySelector("[data-field=title]").textContent =
    note.title || "未命名";

  const categoryLabel = state.categories.find((cat) => cat.id === note.category)?.label;
  fragment.querySelector("[data-field=category]").textContent =
    categoryLabel || "未分类";

  const meta = `更新于 ${formatDate(note.updatedAt)} · 创建 ${formatDate(note.createdAt)}`;
  fragment.querySelector("[data-field=meta]").textContent = meta;

  fragment.querySelector("[data-field=preview]").textContent = createPreview(note.body);

  const checkbox = fragment.querySelector("[data-field=selector]");
  checkbox.dataset.noteId = note.id;
  checkbox.checked = state.selection.has(note.id);

  root.dataset.noteId = note.id;

  return fragment;
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function createPreview(body = "") {
  const plain = body.replace(/\s+/g, " ").trim();
  return plain.length > 140 ? `${plain.slice(0, 140)}…` : plain;
}

async function onListClick(event) {
  const actionButton = event.target.closest(".note-card [data-action]");
  if (!actionButton) return;
  const card = actionButton.closest(".note-card");
  const noteId = card.dataset.noteId;
  switch (actionButton.dataset.action) {
    case "open":
      await openPanel(noteId);
      window.close();
      break;
    case "export-md":
      await sendMessage({ type: "export:note", id: noteId, format: "markdown" });
      showToast("已导出 Markdown");
      break;
    case "export-docx":
      await sendMessage({ type: "export:note", id: noteId, format: "docx" });
      showToast("已导出 DOCX");
      break;
    case "delete":
      await deleteNote(noteId);
      break;
    default:
      break;
  }
}

function onListChange(event) {
  const checkbox = event.target;
  if (checkbox.dataset.noteId) {
    if (checkbox.checked) {
      state.selection.add(checkbox.dataset.noteId);
    } else {
      state.selection.delete(checkbox.dataset.noteId);
    }
  }
}

async function deleteNote(id) {
  if (!window.confirm("确认删除该笔记？操作不可恢复。")) return;
  await sendMessage({ type: "notes:delete", id });
  state.selection.delete(id);
  await refreshData();
  render();
  showToast("已删除");
}

async function exportSelected(format) {
  if (!state.selection.size) {
    showToast("请选择至少一条笔记");
    return;
  }
  await sendMessage({
    type: "export:notes",
    ids: Array.from(state.selection),
    format
  });
  showToast(`已导出 ${format.toUpperCase()}`);
}

async function openPanel(noteId) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) {
    showToast("未找到活动标签页");
    return;
  }
  await sendMessage({ type: "panel:open-note", id: noteId, tabId: tab.id });
}

function updateStatus(visibleCount = state.notes.length) {
  elements.status.textContent = `共 ${state.notes.length} 条笔记 · 当前显示 ${visibleCount} 条`;
}

function showToast(message) {
  const toast = elements.toast;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function sendMessage(message) {
  return chrome.runtime.sendMessage(message).then((response) => {
    if (!response) {
      throw new Error("扩展未响应");
    }
    if (!response.ok) {
      throw new Error(response.error || "操作失败");
    }
    return response.data;
  });
}
