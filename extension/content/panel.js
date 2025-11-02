(() => {
  if (window.__quickNotesPanelInjected) {
    return;
  }
  window.__quickNotesPanelInjected = true;

  const state = {
    isOpen: false,
    noteId: null,
    categories: [],
    attachments: [],
    settings: null,
    isSaving: false
  };

  const position = {
    top: 72,
    right: 48
  };

  const root = document.createElement("div");
  root.className = "quick-notes-panel-root";
  root.style.display = "none";
  document.documentElement.appendChild(root);

  const panel = document.createElement("div");
  panel.className = "quick-notes-panel hidden";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "快速笔记面板");
  root.appendChild(panel);

  const toast = document.createElement("div");
  toast.className = "quick-notes-toast";
  document.documentElement.appendChild(toast);

  const header = document.createElement("div");
  header.className = "quick-notes-panel-header";
  header.innerHTML = `
    <div class="quick-notes-panel-title">Quick Insight Notes</div>
    <div class="quick-notes-actions">
      <button class="quick-notes-icon-button" data-action="theme" title="切换主题">🌓</button>
      <button class="quick-notes-icon-button" data-action="close" title="关闭">✕</button>
    </div>
  `;
  panel.appendChild(header);

  const body = document.createElement("div");
  body.className = "quick-notes-body";
  panel.appendChild(body);

  const titleRow = document.createElement("label");
  titleRow.className = "quick-notes-row";
  titleRow.innerHTML = `
    <span class="quick-notes-label">标题</span>
    <input class="quick-notes-input" name="title" placeholder="输入标题（可选）"/>
  `;
  body.appendChild(titleRow);

  const categoryRow = document.createElement("div");
  categoryRow.className = "quick-notes-row";
  categoryRow.innerHTML = `
    <div class="quick-notes-row-header" style="display:flex;align-items:center;justify-content:space-between;">
      <span class="quick-notes-label">分类</span>
      <button class="quick-notes-icon-button" data-action="add-category" title="新建分类">＋</button>
    </div>
    <select class="quick-notes-select" name="category"></select>
  `;
  body.appendChild(categoryRow);

  const textRow = document.createElement("label");
  textRow.className = "quick-notes-row";
  textRow.innerHTML = `
    <span class="quick-notes-label">正文</span>
    <textarea class="quick-notes-textarea" name="body" placeholder="使用 Markdown 记录你的灵感..."></textarea>
  `;
  body.appendChild(textRow);

  const attachmentRow = document.createElement("div");
  attachmentRow.className = "quick-notes-row";
  attachmentRow.innerHTML = `
    <span class="quick-notes-label">附件</span>
    <div class="quick-notes-attachments" data-role="attachments"></div>
  `;
  body.appendChild(attachmentRow);

  const footer = document.createElement("div");
  footer.className = "quick-notes-footer";
  footer.innerHTML = `
    <div class="quick-notes-footer-left">
      <button class="quick-notes-button secondary" data-action="screenshot">截图</button>
      <button class="quick-notes-button secondary" data-action="upload">上传图片</button>
      <button class="quick-notes-button secondary" data-action="export" disabled>导出</button>
    </div>
    <div class="quick-notes-footer-right">
      <button class="quick-notes-button secondary" data-action="cancel">清空</button>
      <button class="quick-notes-button" data-action="save">保存</button>
    </div>
  `;
  panel.appendChild(footer);

  const titleInput = titleRow.querySelector("input[name=title]");
  const bodyInput = textRow.querySelector("textarea[name=body]");
  const categorySelect = categoryRow.querySelector("select[name=category]");
  const attachmentContainer = attachmentRow.querySelector("[data-role=attachments]");
  const exportButton = footer.querySelector("button[data-action=export]");
  const saveButton = footer.querySelector("button[data-action=save]");

  let dragState = null;

  header.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      initialTop: position.top,
      initialRight: position.right
    };
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd, { once: true });
  });

  header.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    dragState = {
      startX: touch.clientX,
      startY: touch.clientY,
      initialTop: position.top,
      initialRight: position.right
    };
    document.addEventListener("touchmove", onDragMove, { passive: false });
    document.addEventListener("touchend", onDragEnd, { once: true });
  });

  panel.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset?.action;
    if (!action) return;
    event.preventDefault();
    switch (action) {
      case "close":
        hidePanel();
        break;
      case "theme":
        await toggleTheme();
        break;
      case "add-category":
        await promptNewCategory();
        break;
      case "screenshot":
        await captureScreenshot();
        break;
      case "upload":
        await pickImage();
        break;
      case "export":
        await exportCurrentNote();
        break;
      case "cancel":
        resetForm();
        break;
      case "save":
        await persistNote();
        break;
      default:
        break;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (state.isOpen && event.key === "Escape") {
      hidePanel();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === "panel:pulse") {
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "panel:toggle") {
      togglePanel();
    } else if (message.type === "panel:load-note") {
      loadNoteById(message.id);
    }
    return undefined;
  });

  function onDragMove(event) {
    const point = event.touches ? event.touches[0] : event;
    if (!dragState || !point) return;
    event.preventDefault();

    const deltaX = point.clientX - dragState.startX;
    const deltaY = point.clientY - dragState.startY;

    position.top = Math.max(24, dragState.initialTop + deltaY);
    position.right = Math.max(24, dragState.initialRight - deltaX);

    applyPosition();
  }

  function onDragEnd() {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("touchmove", onDragMove);
    dragState = null;
    if (state.settings) {
      state.settings.panelPosition = { ...position };
      sendMessage({ type: "settings:update", patch: { panelPosition: { ...position } } });
    }
  }

  function togglePanel() {
    if (state.isOpen) {
      hidePanel();
    } else {
      openPanel();
    }
  }

  async function openPanel() {
    await ensureSettings();
    await ensureCategories();
    if (!state.noteId) {
      categorySelect.value =
        state.settings?.defaultCategory ||
        state.categories[0]?.id ||
        "";
    }
    renderCategories();
    applyTheme();
    applyPosition();
    root.style.display = "block";
    requestAnimationFrame(() => {
      panel.classList.remove("hidden");
      state.isOpen = true;
      titleInput.focus({ preventScroll: true });
    });
  }

  function hidePanel() {
    panel.classList.add("hidden");
    state.isOpen = false;
    setTimeout(() => {
      if (!state.isOpen) {
        root.style.display = "none";
      }
    }, 180);
  }

  async function ensureSettings() {
    if (state.settings) {
      return state.settings;
    }
    const data = await sendMessage({ type: "settings:get" });
    state.settings = data;
    if (data?.panelPosition) {
      position.top = data.panelPosition.top ?? position.top;
      position.right = data.panelPosition.right ?? position.right;
    }
    return state.settings;
  }

  async function ensureCategories() {
    const categories = await sendMessage({ type: "categories:list" });
    state.categories = categories;
    renderCategories();
    return categories;
  }

  function renderCategories() {
    const selected = categorySelect.value;
    categorySelect.innerHTML = state.categories
      .map(
        (category) =>
          `<option value="${category.id}">${escapeHtml(category.label)}</option>`
      )
      .join("");
    if (state.noteId && state.noteCategory) {
      categorySelect.value = state.noteCategory;
    } else if (selected) {
      categorySelect.value = selected;
    } else if (state.settings?.defaultCategory) {
      categorySelect.value = state.settings.defaultCategory;
    }
  }

  async function promptNewCategory() {
    const label = window.prompt("输入新分类名称");
    if (!label) return;
    try {
      const category = await sendMessage({ type: "categories:add", label });
      state.categories.push(category);
      renderCategories();
      categorySelect.value = category.id;
      showToast(`已添加分类「${category.label}」`);
    } catch (error) {
      showToast(error.message || "无法添加分类");
    }
  }

  async function captureScreenshot() {
    const settings = await ensureSettings();
    const quality = settings?.screenshotQuality ?? 0.9;
    try {
      const response = await sendMessage({
        type: "capture:screenshot",
        options: { quality }
      });
      if (response?.dataUrl) {
        await addAttachment(response.dataUrl, `image/${response.format || "png"}`);
        showToast("截图已添加");
      }
    } catch (error) {
      console.error(error);
      showToast("截取屏幕失败，请检查权限");
    }
  }

  async function pickImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => {
      Array.from(input.files || []).forEach((file) => {
        const reader = new FileReader();
        reader.onload = async () => {
          await addAttachment(reader.result, file.type || "image/png");
        };
        reader.readAsDataURL(file);
      });
    };
    input.click();
  }

  async function addAttachment(dataUrl, mimeType) {
    const attachment = await createAttachment(dataUrl, mimeType);
    state.attachments.push(attachment);
    renderAttachments();
  }

  function renderAttachments() {
    attachmentContainer.innerHTML = "";
    for (const image of state.attachments) {
      const card = document.createElement("div");
      card.className = "quick-notes-attachment";
      card.innerHTML = `
        <img src="${image.dataUrl}" alt="附件图片"/>
        <button data-id="${image.id}" title="移除">✕</button>
      `;
      card.querySelector("button").addEventListener("click", () => {
        state.attachments = state.attachments.filter((item) => item.id !== image.id);
        renderAttachments();
      });
      attachmentContainer.appendChild(card);
    }
  }

  async function persistNote() {
    if (state.isSaving) return;
    state.isSaving = true;
    saveButton.disabled = true;
    saveButton.textContent = "保存中...";
    try {
      const payload = {
        id: state.noteId,
        title: titleInput.value,
        body: bodyInput.value,
        category: categorySelect.value,
        attachments: { images: state.attachments }
      };
      const noteId = await sendMessage({ type: "notes:save", note: payload });
      state.noteId = noteId;
      state.noteCategory = payload.category;
      exportButton.disabled = false;
      showToast("已保存");
      await sendMessage({ type: "notes:changed" }).catch(() => {});
      resetForm(true);
    } catch (error) {
      console.error(error);
      showToast(error.message || "保存失败");
    } finally {
      state.isSaving = false;
      saveButton.disabled = false;
      saveButton.textContent = "保存";
    }
  }

  async function exportCurrentNote() {
    if (!state.noteId) {
      showToast("请先保存再导出");
      return;
    }
    const format = window.confirm("确定导出为 DOCX？选择“取消”则导出 Markdown。")
      ? "docx"
      : "markdown";
    try {
      await sendMessage({ type: "export:note", id: state.noteId, format });
      showToast(`已导出为 ${format.toUpperCase()}`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "导出失败");
    }
  }

  function resetForm(keepOpen = false) {
    state.noteId = null;
    state.noteCategory = null;
    titleInput.value = "";
    bodyInput.value = "";
    state.attachments = [];
    renderAttachments();
    exportButton.disabled = true;
    if (!keepOpen) {
      hidePanel();
    } else {
      ensureCategories();
      titleInput.focus({ preventScroll: true });
    }
  }

  async function toggleTheme() {
    const settings = await ensureSettings();
    const nextTheme = settings.theme === "light" ? "dark" : "light";
    state.settings = await sendMessage({
      type: "settings:update",
      patch: { theme: nextTheme }
    });
    applyTheme();
  }

  function applyTheme() {
    if (!state.settings) return;
    if (state.settings.theme === "light") {
      panel.classList.add("light");
    } else {
      panel.classList.remove("light");
    }
  }

  function applyPosition() {
    panel.style.top = `${Math.max(24, position.top)}px`;
    panel.style.right = `${Math.max(24, position.right)}px`;
  }

  async function loadNoteById(id) {
    await ensureSettings();
    await ensureCategories();
    if (!id) {
      resetForm(true);
      openPanel();
      return;
    }
    try {
      const note = await sendMessage({ type: "notes:get", id });
      if (!note) {
        showToast("未找到笔记，已切换到新建模式");
        state.noteId = null;
        state.noteCategory = null;
        state.attachments = [];
        openPanel();
        return;
      }
      state.noteId = note.id;
      state.noteCategory = note.category;
      titleInput.value = note.title || "";
      bodyInput.value = note.body || "";
      state.attachments = Array.isArray(note.attachments?.images)
        ? note.attachments.images
        : [];
      renderAttachments();
      exportButton.disabled = false;
      openPanel();
    } catch (error) {
      console.error(error);
      showToast("无法加载笔记");
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2200);
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

  function createAttachment(dataUrl, mimeType) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        resolve({
          id: generateId("img"),
          dataUrl,
          mimeType,
          width: image.naturalWidth || image.width || null,
          height: image.naturalHeight || image.height || null,
          createdAt: Date.now()
        });
      };
      image.onerror = () => {
        resolve({
          id: generateId("img"),
          dataUrl,
          mimeType,
          width: null,
          height: null,
          createdAt: Date.now()
        });
      };
      image.src = dataUrl;
    });
  }

  function generateId(prefix) {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${random}`;
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
