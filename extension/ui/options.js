const state = {
  settings: null,
  categories: []
};

const elements = {
  themeRadios: Array.from(document.querySelectorAll('input[name="theme"]')),
  defaultCategory: document.querySelector("#default-category"),
  categoryList: document.querySelector("[data-role=categories]"),
  addCategory: document.querySelector('[data-action="add-category"]'),
  qualitySlider: document.querySelector("#quality"),
  qualityValue: document.querySelector("#quality-value"),
  replaceMode: document.querySelector("#replace-mode"),
  importFile: document.querySelector('[data-role="import-file"]'),
  saveButton: document.querySelector('[data-action="save"]'),
  exportButton: document.querySelector('[data-action="export-backup"]'),
  status: document.querySelector('[data-role="status"]'),
  toast: document.querySelector('[data-role="toast"]')
};

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await loadData();
  render();
});

function bindEvents() {
  elements.addCategory.addEventListener("click", async () => {
    const label = window.prompt("输入新分类名称");
    if (!label) return;
    try {
      const category = await sendMessage({ type: "categories:add", label });
      state.categories.push(category);
      renderCategories();
      showToast(`已添加分类「${category.label}」`);
    } catch (error) {
      showToast(error.message || "无法添加分类");
    }
  });

  elements.categoryList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = button.closest(".category-item");
    const id = item.dataset.id;
    if (!id) return;
    if (button.dataset.action === "rename") {
      const input = item.querySelector("input[type=text]");
      await renameCategory(id, input.value);
    } else if (button.dataset.action === "remove") {
      await deleteCategory(id);
    }
  });

  elements.categoryList.addEventListener("change", (event) => {
    if (event.target.matches(".category-item input[type=text]")) {
      event.target.dataset.dirty = "true";
    }
  });

  elements.qualitySlider.addEventListener("input", () => {
    elements.qualityValue.textContent = `${elements.qualitySlider.value}%`;
  });

  elements.saveButton.addEventListener("click", saveSettings);
  elements.exportButton.addEventListener("click", exportBackup);

  elements.importFile.addEventListener("change", async () => {
    const file = elements.importFile.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await sendMessage({
        type: "import:backup",
        payload: text,
        replace: elements.replaceMode.checked
      });
      await loadData();
      render();
      showToast("已导入备份");
    } catch (error) {
      showToast(error.message || "导入失败");
    } finally {
      elements.importFile.value = "";
    }
  });
}

async function loadData() {
  const [settings, categories] = await Promise.all([
    sendMessage({ type: "settings:get" }),
    sendMessage({ type: "categories:list" })
  ]);
  state.settings = settings;
  state.categories = categories;
  elements.qualitySlider.value = Math.round((settings.screenshotQuality ?? 0.9) * 100);
  elements.qualityValue.textContent = `${elements.qualitySlider.value}%`;
}

function render() {
  renderTheme();
  renderCategories();
  if (state.settings) {
    elements.defaultCategory.value = state.settings.defaultCategory || "";
  }
  updateStatus("设置已加载");
}

function renderTheme() {
  const theme = state.settings?.theme ?? "light";
  elements.themeRadios.forEach((radio) => {
    radio.checked = radio.value === theme;
  });
}

function renderCategories() {
  elements.defaultCategory.innerHTML = "";
  elements.categoryList.innerHTML = "";

  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.label;
    elements.defaultCategory.appendChild(option);

    const row = document.createElement("div");
    row.className = "category-item";
    row.dataset.id = category.id;
    row.innerHTML = `
      <input type="text" value="${escapeHtml(category.label)}" />
      <div class="actions">
        <button data-action="rename">保存</button>
        <button data-action="remove">删除</button>
      </div>
    `;
    row.querySelector("input").value = category.label;
    if (category.id === state.settings?.defaultCategory) {
      row.querySelector('[data-action="remove"]').disabled = true;
    }
    elements.categoryList.appendChild(row);
  });
}

async function renameCategory(id, label) {
  if (!label.trim()) {
    showToast("分类名称不能为空");
    return;
  }
  try {
    const category = await sendMessage({ type: "categories:rename", id, label });
    state.categories = state.categories.map((item) =>
      item.id === id ? category : item
    );
    renderCategories();
    showToast("已更新分类名称");
  } catch (error) {
    showToast(error.message || "更新失败");
  }
}

async function deleteCategory(id) {
  const category = state.categories.find((item) => item.id === id);
  if (!category) return;
  if (id === state.settings?.defaultCategory) {
    showToast("默认分类无法删除");
    return;
  }
  if (!window.confirm(`确认删除分类「${category.label}」？`)) return;
  try {
    const result = await sendMessage({ type: "categories:remove", id, force: true });
    if (result?.blocked) {
      showToast("分类仍在使用，无法删除");
      return;
    }
    state.categories = state.categories.filter((item) => item.id !== id);
    renderCategories();
    showToast("已删除分类");
  } catch (error) {
    showToast(error.message || "删除失败");
  }
}

async function saveSettings() {
  const theme = elements.themeRadios.find((radio) => radio.checked)?.value ?? "light";
  const defaultCategory = elements.defaultCategory.value;
  const screenshotQuality = parseInt(elements.qualitySlider.value, 10) / 100;
  try {
    const settings = await sendMessage({
      type: "settings:update",
      patch: { theme, defaultCategory, screenshotQuality }
    });
    state.settings = settings;
    updateStatus("设置已保存");
    showToast("设置已保存");
  } catch (error) {
    showToast(error.message || "保存失败");
  }
}

async function exportBackup() {
  try {
    await sendMessage({ type: "export:backup" });
    showToast("备份已导出");
  } catch (error) {
    showToast(error.message || "导出失败");
  }
}

function updateStatus(text) {
  elements.status.textContent = text;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  setTimeout(() => elements.toast.classList.remove("show"), 2200);
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

function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
