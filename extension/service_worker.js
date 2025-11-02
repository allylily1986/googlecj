import {
  bootstrapStorage,
  listNotes,
  getNote,
  saveNote,
  deleteNote,
  listCategories,
  ensureCategory,
  renameCategory,
  removeCategory,
  getSettings,
  updateSettings,
  getFullSnapshot,
  overwriteData
} from "./common/storage.js";
import {
  buildMarkdownExport,
  buildDocxExport,
  buildMarkdownArchive
} from "./common/export.js";
import { arrayBufferToBase64, sanitizeFileName, toUint8Array } from "./common/utils.js";

const PANEL_TOGGLE_COMMAND = "toggle-panel";

chrome.runtime.onInstalled.addListener(async () => {
  await bootstrapStorage();
});

chrome.runtime.onStartup.addListener(async () => {
  await bootstrapStorage();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== PANEL_TOGGLE_COMMAND) {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  await togglePanel(tab.id);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    return;
  }
  await togglePanel(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = createMessageHandler(sender);
  const result = handler(message);
  if (result && typeof result.then === "function") {
    result
      .then((value) => sendResponse({ ok: true, data: value }))
      .catch((error) => {
        console.error("[service_worker] message error", error);
        sendResponse({ ok: false, error: error?.message ?? String(error) });
      });
    return true;
  }

  sendResponse({ ok: true, data: result });
  return false;
});

async function togglePanel(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "panel:toggle" });
  } catch (error) {
    if (error?.message?.includes("Receiving end does not exist")) {
      await injectPanelContent(tabId);
      await chrome.tabs.sendMessage(tabId, { type: "panel:toggle" });
    } else {
      console.error("[service_worker] toggle panel error", error);
    }
  }
}

async function injectPanelContent(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/panel.css"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/panel.js"]
  });
}

function createMessageHandler(sender) {
  const senderTabId = sender?.tab?.id;
  return (message) => {
    switch (message?.type) {
      case "notes:list":
        return listNotes();
      case "notes:get":
        return getNote(message.id);
      case "notes:save":
        return saveNote(message.note);
      case "notes:delete":
        return deleteNote(message.id);
      case "categories:list":
        return listCategories();
      case "categories:add":
        return ensureCategory(message.label);
      case "categories:rename":
        return renameCategory(message.id, message.label);
      case "categories:remove":
        return removeCategory(message.id, message.force);
      case "settings:get":
        return getSettings();
      case "settings:update":
        return updateSettings(message.patch);
      case "capture:screenshot":
        return captureScreenshot(senderTabId, message.options);
      case "export:note":
        return exportSingleNote(message.id, message.format);
      case "export:notes":
        return exportMultipleNotes(message.ids, message.format);
      case "panel:open-note":
        return openPanelWithNote(message.id, message.tabId ?? senderTabId);
      case "export:backup":
        return exportBackup();
      case "import:backup":
        return importBackup(message.payload, message.replace);
      default:
        console.warn("[service_worker] unknown message", message);
        return null;
    }
  };
}

async function captureScreenshot(tabId, options) {
  if (!tabId) {
    throw new Error("Missing tabId for screenshot capture");
  }
  const format = "png";
  const quality = Math.round((options?.quality ?? 0.9) * 100);
  const dataUrl = await chrome.tabs.captureVisibleTab({
    format,
    quality
  });
  return { dataUrl, format };
}

async function exportSingleNote(id, format) {
  const note = await getNote(id);
  if (!note) {
    throw new Error("Note not found");
  }
  if (format === "markdown") {
    const content = buildMarkdownExport([note]);
    const filename = sanitizeFileName(`${note.title || "note"}-${note.id}.md`);
    return downloadContent(content, "text/markdown", filename);
  }
  if (format === "docx") {
    const payload = await buildDocxExport(note);
    const filename = sanitizeFileName(`${note.title || "note"}-${note.id}.docx`);
    return downloadBinary(payload, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename);
  }
  throw new Error(`Unsupported format: ${format}`);
}

async function exportMultipleNotes(ids, format) {
  const notes = await listNotes();
  const selected = notes.filter((note) => ids.includes(note.id));
  if (!selected.length) {
    throw new Error("No notes selected");
  }
  if (format === "markdown") {
    const archive = buildMarkdownArchive(selected);
    const filename = sanitizeFileName(`notes-${Date.now()}.zip`);
    return downloadBinary(archive, "application/zip", filename);
  }
  if (format === "docx") {
    const files = [];
    for (const note of selected) {
      const data = await buildDocxExport(note);
      const filename = sanitizeFileName(`${note.title || "note"}-${note.id}.docx`);
      files.push({ name: filename, data });
    }
    const archive = buildMarkdownArchive([], files);
    const filename = sanitizeFileName(`notes-${Date.now()}.zip`);
    return downloadBinary(archive, "application/zip", filename);
  }
  throw new Error(`Unsupported format: ${format}`);
}

async function downloadContent(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);
  const url = `data:${mimeType};base64,${base64}`;
  await chrome.downloads.download({ url, filename });
  return { filename };
}

async function downloadBinary(binary, mimeType, filename) {
  const bytes = toUint8Array(binary);
  const base64 = arrayBufferToBase64(bytes);
  const url = `data:${mimeType};base64,${base64}`;
  await chrome.downloads.download({ url, filename });
  return { filename };
}

async function openPanelWithNote(noteId, tabId) {
  const targetTabId = tabId ?? (await resolveActiveTabId());
  if (!targetTabId) {
    throw new Error("未找到可用的浏览器标签页");
  }
  await ensurePanelInjected(targetTabId);
  await chrome.tabs.sendMessage(targetTabId, { type: "panel:load-note", id: noteId });
  return { opened: true };
}

async function ensurePanelInjected(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "panel:pulse" });
  } catch (error) {
    if (error?.message?.includes("Receiving end does not exist")) {
      await injectPanelContent(tabId);
    } else {
      throw error;
    }
  }
}

async function resolveActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id ?? null;
}

async function exportBackup() {
  const snapshot = await getFullSnapshot();
  const payload = {
    exportedAt: new Date().toISOString(),
    ...snapshot
  };
  const content = JSON.stringify(payload, null, 2);
  const filename = sanitizeFileName(`quick-notes-backup-${Date.now()}.json`);
  await downloadContent(content, "application/json", filename);
  return { filename };
}

async function importBackup(payload, replace = false) {
  if (!payload) {
    throw new Error("缺少导入数据");
  }
  const data =
    typeof payload === "string"
      ? JSON.parse(payload)
      : payload;
  await overwriteData(data, replace);
  return { restored: true };
}
