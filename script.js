const STORAGE_KEY = "plan_mariage_data_v1";
const SERVER_ENDPOINT = "/api/data";
const ADMIN_CHECK_ENDPOINT = "/api/admin/check";
const ADMIN_SESSION_KEY = "plan_mariage_admin_token";
const WEDDING_DATE_ISO = "2027-04-24T14:30:00+02:00";
const QR_API_ENDPOINT = "https://api.qrserver.com/v1/create-qr-code/";

const DEFAULT_BUDGET_CATEGORIES = [
  { id: "cat_traiteurs", name: "Traiteurs" },
  { id: "cat_lieux", name: "Lieux" },
  { id: "cat_photo", name: "Photo/Vidéo" },
  { id: "cat_deco", name: "Décoration" },
  { id: "cat_animations", name: "Animations" },
];

const DEFAULT_STATE = {
  budgetGoal: 15000,
  budgetGuestCount: 150,
  budgetAdultCount: 110,
  budgetItems: [],
  budgetCategories: DEFAULT_BUDGET_CATEGORIES,
  tasks: [],
  guests: [],
  updatedAt: 0,
};

const VALID_GUEST_STATUS = new Set(["pending", "yes", "no"]);
const VALID_GUEST_GROUP_TYPE = new Set(["single", "couple", "family"]);
const GUEST_GROUP_TYPE_LABEL = {
  single: "Invitation individuelle",
  couple: "Invitation couple",
  family: "Invitation famille",
};
const VALID_GUEST_ATTENDANCE_TYPE = new Set(["vin_repas", "vin_only"]);
const GUEST_ATTENDANCE_TYPE_LABEL = {
  vin_repas: "Vin d'honneur + repas",
  vin_only: "Vin d'honneur uniquement",
};

const isServerMode = window.location.protocol === "http:" || window.location.protocol === "https:";
const isAdminPage = document.body?.dataset?.page === "admin";
let serverSyncAvailable = false;
let adminToken = "";
let isAdminUnlocked = false;
let adminInterfaceEnabled = false;
let persistInProgress = false;
let persistQueued = false;

const state = createDefaultState();

const budgetForm = document.getElementById("budgetForm");
const budgetGoalForm = document.getElementById("budgetGoalForm");
const budgetPeopleForm = document.getElementById("budgetPeopleForm");
const budgetGoalInput = document.getElementById("budgetGoal");
const budgetGuestCountInput = document.getElementById("budgetGuestCount");
const budgetAdultCountInput = document.getElementById("budgetAdultCount");
const budgetLabel = document.getElementById("budgetLabel");
const budgetAmountTotal = document.getElementById("budgetAmountTotal");
const budgetAmountPaid = document.getElementById("budgetAmountPaid");
const budgetCategorySelect = document.getElementById("budgetCategory");
const categoryForm = document.getElementById("categoryForm");
const categoryNameInput = document.getElementById("categoryName");
const budgetCategoryList = document.getElementById("budgetCategoryList");
const budgetPerGuestLabel = document.getElementById("budgetPerGuestLabel");
const budgetPerAdultLabel = document.getElementById("budgetPerAdultLabel");
const budgetPerGuest = document.getElementById("budgetPerGuest");
const budgetPerAdult = document.getElementById("budgetPerAdult");
const budgetList = document.getElementById("budgetList");

const taskForm = document.getElementById("taskForm");
const taskText = document.getElementById("taskText");
const taskList = document.getElementById("taskList");
const taskSearch = document.getElementById("taskSearch");
const taskFilter = document.getElementById("taskFilter");
const taskStats = document.getElementById("taskStats");
const taskClearDone = document.getElementById("taskClearDone");

const guestForm = document.getElementById("guestForm");
const guestName = document.getElementById("guestName");
const guestGroupType = document.getElementById("guestGroupType");
const guestAttendanceType = document.getElementById("guestAttendanceType");
const guestPartySize = document.getElementById("guestPartySize");
const guestStatus = document.getElementById("guestStatus");
const guestList = document.getElementById("guestList");
const guestSearch = document.getElementById("guestSearch");
const guestFilter = document.getElementById("guestFilter");
const guestAttendanceFilter = document.getElementById("guestAttendanceFilter");
const guestStats = document.getElementById("guestStats");
const guestVinStats = document.getElementById("guestVinStats");
const guestMealStats = document.getElementById("guestMealStats");
const guestHebergStats = document.getElementById("guestHebergStats");

const metricBudgetTotal = document.getElementById("metricBudgetTotal");
const metricBudgetLeft = document.getElementById("metricBudgetLeft");
const metricTasks = document.getElementById("metricTasks");
const metricRsvp = document.getElementById("metricRsvp");
const syncStatus = document.getElementById("syncStatus");
const budgetChartCanvas = document.getElementById("budgetChartCanvas");
const budgetChartLegend = document.getElementById("budgetChartLegend");
const budgetChartEmpty = document.getElementById("budgetChartEmpty");

const budgetTemplate = document.getElementById("budgetItemTemplate");
const taskTemplate = document.getElementById("taskItemTemplate");
const guestTemplate = document.getElementById("guestItemTemplate");

const adminGate = document.getElementById("adminGate");
const adminContent = document.getElementById("adminContent");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminPassword = document.getElementById("adminPassword");
const adminError = document.getElementById("adminError");
const adminLogout = document.getElementById("adminLogout");
const adminNavLink = document.getElementById("adminNavLink");
const adminTabButtons = Array.from(document.querySelectorAll("[data-admin-tab]"));
const adminTabPanels = Array.from(document.querySelectorAll("[data-admin-tab-panel]"));
const privateZone = document.getElementById("organisation");
const countdownDays = document.getElementById("countdownDays");
const countdownHours = document.getElementById("countdownHours");
const countdownMinutes = document.getElementById("countdownMinutes");
const countdownSeconds = document.getElementById("countdownSeconds");
const countdownNote = document.getElementById("countdownNote");

let countdownTimerId = 0;
let activeAdminTab = "dashboard";
let budgetChartResizeTimerId = 0;
const BUDGET_CHART_COLORS = [
  "#e00a26",
  "#f65d08",
  "#ffbd1c",
  "#8a2c4f",
  "#5f4b8b",
  "#00a6a6",
  "#2f855a",
  "#c05621",
  "#4a5568",
  "#d53f8c",
];

bindPlannerEvents();
bindAdminEvents();
bindBudgetChartResize();
initCountdown();

function bindPlannerEvents() {
  if (budgetForm) {
    budgetForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!isAdminUnlocked) {
        return;
      }

      const label = budgetLabel.value.trim();
      if (!label) {
        return;
      }
      const amountTotal = Math.max(0, Number(budgetAmountTotal?.value) || 0);
      const amountPaid = Math.max(0, Number(budgetAmountPaid?.value) || 0);
      const categoryId = budgetCategorySelect?.value || null;

      state.budgetItems.push({
        id: createId(),
        label,
        categoryId,
        amountTotal,
        amountPaid,
        solde: amountTotal > 0 && amountPaid >= amountTotal,
        supplier: normalizeSupplier(null),
      });

      budgetForm.reset();
      refresh();
    });
  }

  if (budgetGoalForm) {
    budgetGoalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!isAdminUnlocked) {
        return;
      }

      const goal = Number(budgetGoalInput.value);
      if (Number.isNaN(goal) || goal < 0) {
        return;
      }

      state.budgetGoal = goal;
      refresh();
    });
  }

  if (budgetPeopleForm) {
    budgetPeopleForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!isAdminUnlocked) {
        return;
      }

      const guestCount = Math.floor(Number(budgetGuestCountInput?.value));
      const adultCount = Math.floor(Number(budgetAdultCountInput?.value));
      if (!Number.isFinite(guestCount) || !Number.isFinite(adultCount) || guestCount < 1 || adultCount < 1) {
        return;
      }

      state.budgetGuestCount = guestCount;
      state.budgetAdultCount = Math.min(adultCount, guestCount);
      if (budgetAdultCountInput) {
        budgetAdultCountInput.value = String(state.budgetAdultCount);
      }

      refresh();
    });
  }

  if (categoryForm) {
    categoryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!isAdminUnlocked) {
        return;
      }
      const name = categoryNameInput?.value.trim();
      if (!name) {
        return;
      }
      if (!Array.isArray(state.budgetCategories)) {
        state.budgetCategories = [];
      }
      state.budgetCategories.push({ id: createId(), name });
      categoryForm.reset();
      refresh();
    });
  }

  if (taskForm) {
    taskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!isAdminUnlocked) {
        return;
      }

      const text = taskText.value.trim();
      if (!text) {
        return;
      }

      state.tasks.push({
        id: createId(),
        text,
        done: false,
      });

      taskForm.reset();
      refresh();
    });
  }

  if (taskSearch) {
    taskSearch.addEventListener("input", () => {
      renderTasks();
    });
  }

  if (taskFilter) {
    taskFilter.addEventListener("change", () => {
      renderTasks();
    });
  }

  if (taskClearDone) {
    taskClearDone.addEventListener("click", () => {
      if (!isAdminUnlocked) {
        return;
      }

      const remaining = state.tasks.filter((task) => !task.done);
      if (remaining.length === state.tasks.length) {
        return;
      }

      state.tasks = remaining;
      refresh();
    });
  }

  if (guestForm) {
    guestForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!isAdminUnlocked) {
        return;
      }

      const name = guestName.value.trim();
      const groupType = normalizeGuestGroupType(guestGroupType?.value ?? "single");
      const attendanceType = normalizeGuestAttendanceType(guestAttendanceType?.value ?? "vin_repas");
      const partySize = normalizeGuestPartySize(guestPartySize?.value, groupType);
      const status = guestStatus.value;
      if (!name) {
        return;
      }

      state.guests.push({
        id: createId(),
        name,
        groupType,
        attendanceType,
        partySize,
        status: VALID_GUEST_STATUS.has(status) ? status : "pending",
        rsvpToken: createGuestToken(),
        hebergement: false,
        rsvpSubmittedAt: 0,
      });

      guestForm.reset();
      applyGuestTypePreset("single");
      if (guestAttendanceType) {
        guestAttendanceType.value = "vin_repas";
      }
      refresh();
    });
  }

  if (guestGroupType) {
    guestGroupType.addEventListener("change", () => {
      applyGuestTypePreset(guestGroupType.value);
    });
    applyGuestTypePreset(guestGroupType.value);
  }

  if (guestSearch) {
    guestSearch.addEventListener("input", () => {
      renderGuests();
    });
  }

  if (guestFilter) {
    guestFilter.addEventListener("change", () => {
      renderGuests();
    });
  }

  if (guestAttendanceFilter) {
    guestAttendanceFilter.addEventListener("change", () => {
      renderGuests();
    });
  }
}

function bindAdminEvents() {
  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!adminPassword) {
        return;
      }

      const token = adminPassword.value.trim();
      if (!token) {
        setAdminError("Entrez le mot de passe administrateur.");
        return;
      }

      setAdminError("");
      const submitButton = adminLoginForm.querySelector("button[type='submit']");
      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        const check = await verifyAdminToken(token);
        if (!check.ok) {
          if (check.reason === "not_server_mode") {
            setAdminError("Connexion admin indisponible ici. Ouvrez le site via http://127.0.0.1:8000.");
          } else if (check.reason === "endpoint_not_found") {
            setAdminError("Serveur incompatible. Lancez python server.py (pas python -m http.server).");
          } else if (check.reason === "server_unreachable") {
            setAdminError("Serveur indisponible. Lancez server.py puis réessayez.");
          } else {
            setAdminError("Accès refusé. Mot de passe invalide.");
          }
          return;
        }

        localStorage.setItem(ADMIN_SESSION_KEY, token);
        if (adminPassword) {
          adminPassword.value = "";
        }
        await unlockAdmin(token);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }

  if (adminLogout) {
    adminLogout.addEventListener("click", () => {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      adminInterfaceEnabled = isAdminPage;
      lockAdmin({ message: "Session fermée." });
    });
  }

  if (adminNavLink) {
    adminNavLink.addEventListener("click", (event) => {
      event.preventDefault();
      openAdminInterface();
    });
  }

  bindAdminTabs();
}

function bindBudgetChartResize() {
  if (!budgetChartCanvas) {
    return;
  }

  window.addEventListener("resize", () => {
    if (!isAdminUnlocked) {
      return;
    }

    if (budgetChartResizeTimerId) {
      window.clearTimeout(budgetChartResizeTimerId);
    }
    budgetChartResizeTimerId = window.setTimeout(() => {
      renderBudgetChart();
    }, 120);
  });
}

function bindAdminTabs() {
  if (!adminTabButtons.length || !adminTabPanels.length) {
    return;
  }

  for (const button of adminTabButtons) {
    button.addEventListener("click", () => {
      const tabId = button.dataset.adminTab;
      if (!tabId) {
        return;
      }
      setActiveAdminTab(tabId);
    });
  }

  setActiveAdminTab(activeAdminTab);
}

// ── Supplier modal ──────────────────────────────────────────────
const supplierModal = document.getElementById("supplierModal");
const supplierModalTitle = document.getElementById("supplierModalTitle");
const supplierView = document.getElementById("supplierView");
const supplierForm = document.getElementById("supplierForm");
const supplierEditToggle = document.getElementById("supplierEditToggle");
const supplierModalClose = document.getElementById("supplierModalClose");
const supplierCancel = document.getElementById("supplierCancel");

let supplierCurrentItem = null;

const SUPPLIER_LABELS = {
  contact: "Contact",
  phone: "Téléphone",
  email: "Email",
  address: "Adresse",
  website: "Site web",
  notes: "Notes",
};

function renderSupplierView(supplier) {
  if (!supplierView) return;
  supplierView.innerHTML = "";
  const fields = Object.entries(SUPPLIER_LABELS);
  const filled = fields.filter(([key]) => supplier[key]);
  if (!filled.length) {
    const empty = document.createElement("p");
    empty.className = "supplier-empty";
    empty.textContent = "Aucune information renseignée.";
    supplierView.appendChild(empty);
    return;
  }
  for (const [key, label] of filled) {
    const row = document.createElement("div");
    row.className = "supplier-row";
    const lbl = document.createElement("span");
    lbl.className = "supplier-label";
    lbl.textContent = label;
    const val = document.createElement("span");
    val.className = "supplier-value";
    if (key === "website") {
      const a = document.createElement("a");
      a.href = supplier[key];
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = supplier[key];
      val.appendChild(a);
    } else if (key === "email") {
      const a = document.createElement("a");
      a.href = `mailto:${supplier[key]}`;
      a.textContent = supplier[key];
      val.appendChild(a);
    } else if (key === "phone") {
      const a = document.createElement("a");
      a.href = `tel:${supplier[key]}`;
      a.textContent = supplier[key];
      val.appendChild(a);
    } else {
      val.textContent = supplier[key];
    }
    row.appendChild(lbl);
    row.appendChild(val);
    supplierView.appendChild(row);
  }
}

function openSupplierModal(item) {
  if (!supplierModal) return;
  supplierCurrentItem = item;
  supplierModalTitle.textContent = item.label;
  renderSupplierView(item.supplier);
  supplierView.classList.remove("is-hidden");
  supplierForm.classList.add("is-hidden");
  supplierModal.classList.remove("is-hidden");
  document.body.style.overflow = "hidden";
}

function closeSupplierModal() {
  if (!supplierModal) return;
  supplierModal.classList.add("is-hidden");
  supplierCurrentItem = null;
  document.body.style.overflow = "";
}

function fillSupplierForm(supplier) {
  document.getElementById("supplierContact").value = supplier.contact;
  document.getElementById("supplierPhone").value = supplier.phone;
  document.getElementById("supplierEmail").value = supplier.email;
  document.getElementById("supplierAddress").value = supplier.address;
  document.getElementById("supplierWebsite").value = supplier.website;
  document.getElementById("supplierNotes").value = supplier.notes;
}

if (supplierEditToggle) {
  supplierEditToggle.addEventListener("click", () => {
    const isEditing = !supplierForm.classList.contains("is-hidden");
    if (isEditing) {
      supplierView.classList.remove("is-hidden");
      supplierForm.classList.add("is-hidden");
    } else {
      fillSupplierForm(supplierCurrentItem.supplier);
      supplierView.classList.add("is-hidden");
      supplierForm.classList.remove("is-hidden");
    }
  });
}

if (supplierForm) {
  supplierForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!supplierCurrentItem) return;
    supplierCurrentItem.supplier = {
      contact: document.getElementById("supplierContact").value.trim(),
      phone: document.getElementById("supplierPhone").value.trim(),
      email: document.getElementById("supplierEmail").value.trim(),
      address: document.getElementById("supplierAddress").value.trim(),
      website: document.getElementById("supplierWebsite").value.trim(),
      notes: document.getElementById("supplierNotes").value.trim(),
    };
    renderSupplierView(supplierCurrentItem.supplier);
    supplierView.classList.remove("is-hidden");
    supplierForm.classList.add("is-hidden");
    refresh();
  });
}

if (supplierCancel) {
  supplierCancel.addEventListener("click", () => {
    supplierView.classList.remove("is-hidden");
    supplierForm.classList.add("is-hidden");
  });
}

if (supplierModalClose) {
  supplierModalClose.addEventListener("click", closeSupplierModal);
}

if (supplierModal) {
  supplierModal.querySelector(".supplier-modal-backdrop")?.addEventListener("click", closeSupplierModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !supplierModal.classList.contains("is-hidden")) closeSupplierModal();
  });
}
// ────────────────────────────────────────────────────────────────

function setActiveAdminTab(tabId) {
  if (!adminTabButtons.length || !adminTabPanels.length) {
    return;
  }

  const hasPanel = adminTabPanels.some((panel) => panel.dataset.adminTabPanel === tabId);
  if (!hasPanel) {
    tabId = "dashboard";
  }

  activeAdminTab = tabId;
  for (const button of adminTabButtons) {
    const isActive = button.dataset.adminTab === tabId;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }

  for (const panel of adminTabPanels) {
    const panelId = panel.dataset.adminTabPanel;
    const shouldStayVisible = panelId === "dashboard";
    const isActive = panelId === tabId;
    const shouldShow = shouldStayVisible || isActive;
    panel.classList.toggle("is-active", shouldShow);
    panel.classList.toggle("is-hidden", !shouldShow);
    panel.setAttribute("aria-hidden", String(!shouldShow));
  }
}

function initCountdown() {
  if (!countdownDays || !countdownHours || !countdownMinutes || !countdownSeconds || !countdownNote) {
    return;
  }

  const target = new Date(WEDDING_DATE_ISO);
  if (Number.isNaN(target.getTime())) {
    countdownNote.textContent = "Date du mariage indisponible.";
    return;
  }

  updateCountdown(target);
  countdownTimerId = window.setInterval(() => {
    updateCountdown(target);
  }, 1000);
}

function updateCountdown(target) {
  const now = Date.now();
  const delta = target.getTime() - now;

  if (delta <= 0) {
    countdownDays.textContent = "0";
    countdownHours.textContent = "00";
    countdownMinutes.textContent = "00";
    countdownSeconds.textContent = "00";
    countdownNote.textContent = "C'est le grand jour !";

    if (countdownTimerId) {
      window.clearInterval(countdownTimerId);
      countdownTimerId = 0;
    }
    return;
  }

  const totalSeconds = Math.floor(delta / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  countdownDays.textContent = String(days);
  countdownHours.textContent = String(hours).padStart(2, "0");
  countdownMinutes.textContent = String(minutes).padStart(2, "0");
  countdownSeconds.textContent = String(seconds).padStart(2, "0");
  countdownNote.textContent = "Avant de celebrer ensemble.";
}

function refresh(options = {}) {
  if (!isAdminUnlocked) {
    return;
  }

  const persist = options.persist ?? true;
  if (budgetGoalInput) {
    budgetGoalInput.value = String(state.budgetGoal);
  }
  if (budgetGuestCountInput) {
    budgetGuestCountInput.value = String(state.budgetGuestCount);
  }
  if (budgetAdultCountInput) {
    budgetAdultCountInput.value = String(state.budgetAdultCount);
  }

  renderBudget();
  renderTasks();
  renderGuests();
  renderMetrics();
  renderBudgetChart();

  if (persist) {
    schedulePersist();
  }
}

function schedulePersist() {
  persistQueued = true;
  if (persistInProgress) {
    return;
  }

  void flushPersistQueue();
}

async function flushPersistQueue() {
  persistInProgress = true;
  while (persistQueued) {
    persistQueued = false;
    await persistState();
  }
  persistInProgress = false;
}

function renderBudget() {
  if (!budgetList || !budgetTemplate) {
    return;
  }

  const categories = Array.isArray(state.budgetCategories) ? state.budgetCategories : [];

  if (budgetCategorySelect) {
    const prev = budgetCategorySelect.value;
    budgetCategorySelect.innerHTML = '<option value="">— Sans catégorie —</option>';
    for (const cat of categories) {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      budgetCategorySelect.appendChild(opt);
    }
    if (prev && categories.some((c) => c.id === prev)) {
      budgetCategorySelect.value = prev;
    }
  }

  if (budgetCategoryList) {
    budgetCategoryList.innerHTML = "";
    if (categories.length === 0) {
      const empty = document.createElement("span");
      empty.className = "category-chip-empty";
      empty.textContent = "Aucune catégorie.";
      budgetCategoryList.appendChild(empty);
    } else {
      for (const cat of categories) {
        const chip = document.createElement("span");
        chip.className = "category-chip";
        const nameSpan = document.createElement("span");
        nameSpan.textContent = cat.name;
        chip.appendChild(nameSpan);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "category-chip-delete";
        del.textContent = "×";
        del.setAttribute("aria-label", `Supprimer la catégorie ${cat.name}`);
        del.addEventListener("click", () => {
          state.budgetCategories = state.budgetCategories.filter((c) => c.id !== cat.id);
          for (const item of state.budgetItems) {
            if (item.categoryId === cat.id) {
              item.categoryId = null;
            }
          }
          refresh();
        });
        chip.appendChild(del);
        budgetCategoryList.appendChild(chip);
      }
    }
  }

  budgetList.innerHTML = "";
  for (const [index, item] of state.budgetItems.entries()) {
    const node = budgetTemplate.content.firstElementChild.cloneNode(true);
    node.style.setProperty("--stagger", String(index));

    const category = categories.find((c) => c.id === item.categoryId);
    const catBadge = node.querySelector(".budget-item-category");
    if (catBadge) {
      catBadge.textContent = category?.name ?? "";
      catBadge.hidden = !category;
    }
    node.querySelector(".main-text").textContent = item.label;

    const amountTotal = Number(item.amountTotal ?? item.amount ?? 0);
    const amountPaid = Number(item.amountPaid ?? 0);
    const rest = Math.max(amountTotal - amountPaid, 0);

    const totalEl = node.querySelector(".budget-amount-total");
    const paidEl = node.querySelector(".budget-amount-paid");
    const restEl = node.querySelector(".budget-amount-rest");
    if (totalEl) totalEl.textContent = `Prévu : ${formatMoney(amountTotal)}`;
    if (paidEl) paidEl.textContent = `Payé : ${formatMoney(amountPaid)}`;
    if (restEl) restEl.textContent = `Reste : ${formatMoney(rest)}`;

    const soldeCheck = node.querySelector(".solde-check");
    if (soldeCheck) {
      soldeCheck.checked = Boolean(item.solde);
      node.classList.toggle("budget-solde", Boolean(item.solde));
      soldeCheck.addEventListener("change", () => {
        item.solde = soldeCheck.checked;
        if (item.solde && item.amountTotal > 0) {
          item.amountPaid = item.amountTotal;
        }
        refresh();
      });
    }

    const editBtn = node.querySelector(".budget-edit-btn");
    const editPanel = node.querySelector(".budget-item-edit");
    if (editBtn && editPanel) {
      editBtn.addEventListener("click", () => {
        const isOpen = !editPanel.classList.contains("is-hidden");
        if (!isOpen) {
          const editCat = editPanel.querySelector(".edit-category");
          editCat.innerHTML = '<option value="">— Sans catégorie —</option>';
          for (const cat of categories) {
            const opt = document.createElement("option");
            opt.value = cat.id;
            opt.textContent = cat.name;
            editCat.appendChild(opt);
          }
          editCat.value = item.categoryId || "";
          editPanel.querySelector(".edit-amount-total").value = String(amountTotal);
          editPanel.querySelector(".edit-amount-paid").value = String(amountPaid);
        }
        editPanel.classList.toggle("is-hidden");
        editBtn.textContent = isOpen ? "Modifier" : "Annuler";
      });

      const editTotal = editPanel.querySelector(".edit-amount-total");
      const editPaid = editPanel.querySelector(".edit-amount-paid");
      const syncSoldeCheckbox = () => {
        const t = Math.max(0, Number(editTotal.value) || 0);
        const p = Math.max(0, Number(editPaid.value) || 0);
        if (soldeCheck) soldeCheck.checked = t > 0 && p >= t;
      };
      editTotal.addEventListener("input", syncSoldeCheckbox);
      editPaid.addEventListener("input", syncSoldeCheckbox);

      editPanel.querySelector(".save-btn").addEventListener("click", () => {
        item.categoryId = editPanel.querySelector(".edit-category").value || null;
        item.amountTotal = Math.max(0, Number(editPanel.querySelector(".edit-amount-total").value) || 0);
        item.amountPaid = Math.max(0, Number(editPanel.querySelector(".edit-amount-paid").value) || 0);
        item.solde = item.amountTotal > 0 && item.amountPaid >= item.amountTotal;
        refresh();
      });
    }

    node.querySelector(".supplier-info-btn")?.addEventListener("click", () => {
      if (!item.supplier) item.supplier = normalizeSupplier(null);
      openSupplierModal(item);
    });

    node.querySelector(".budget-delete-btn").addEventListener("click", () => {
      state.budgetItems = state.budgetItems.filter((entry) => entry.id !== item.id);
      refresh();
    });

    budgetList.appendChild(node);
  }
}

function renderBudgetChart() {
  if (!budgetChartCanvas || !budgetChartLegend || !budgetChartEmpty) {
    return;
  }

  const categories = Array.isArray(state.budgetCategories) ? state.budgetCategories : [];
  const amountsByLabel = new Map();
  for (const item of state.budgetItems) {
    const amount = Number(item?.amountTotal ?? item?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    let label;
    if (item.categoryId) {
      const cat = categories.find((c) => c.id === item.categoryId);
      label = cat ? cat.name : String(item?.label ?? "").trim();
    } else {
      label = String(item?.label ?? "").trim();
    }
    if (!label) {
      continue;
    }
    amountsByLabel.set(label, (amountsByLabel.get(label) ?? 0) + amount);
  }

  const entries = Array.from(amountsByLabel.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);

  const context = budgetChartCanvas.getContext("2d");
  if (!context) {
    return;
  }

  const cssSize = Math.max(220, Math.min(360, budgetChartCanvas.clientWidth || 320));
  const pixelRatio = window.devicePixelRatio || 1;
  budgetChartCanvas.width = Math.round(cssSize * pixelRatio);
  budgetChartCanvas.height = Math.round(cssSize * pixelRatio);
  budgetChartCanvas.style.width = `${cssSize}px`;
  budgetChartCanvas.style.height = `${cssSize}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, cssSize, cssSize);

  budgetChartLegend.innerHTML = "";
  const hasData = entries.length > 0 && total > 0;
  budgetChartEmpty.classList.toggle("is-hidden", hasData);

  if (!hasData) {
    context.fillStyle = "rgba(240, 63, 89, 0.18)";
    context.beginPath();
    context.arc(cssSize / 2, cssSize / 2, cssSize * 0.42, 0, Math.PI * 2);
    context.fill();
    budgetChartCanvas.setAttribute("aria-label", "Camembert des dépenses indisponible: aucune dépense enregistrée.");
    return;
  }

  const centerX = cssSize / 2;
  const centerY = cssSize / 2;
  const radius = cssSize * 0.42;
  let startAngle = -Math.PI / 2;

  entries.forEach((entry, index) => {
    const angle = (entry.amount / total) * Math.PI * 2;
    const color = BUDGET_CHART_COLORS[index % BUDGET_CHART_COLORS.length];
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, startAngle, startAngle + angle);
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = "rgba(255, 255, 255, 0.86)";
    context.stroke();
    startAngle += angle;
  });

  entries.forEach((entry, index) => {
    const color = BUDGET_CHART_COLORS[index % BUDGET_CHART_COLORS.length];
    const share = (entry.amount / total) * 100;
    const row = document.createElement("li");
    row.className = "budget-chart-legend-item";

    const dot = document.createElement("span");
    dot.className = "budget-chart-dot";
    dot.style.backgroundColor = color;

    const label = document.createElement("span");
    label.className = "budget-chart-label";
    label.textContent = entry.label;

    const value = document.createElement("span");
    value.className = "budget-chart-value";
    value.textContent = `${formatMoney(entry.amount)} (${share.toFixed(1)}%)`;

    row.appendChild(dot);
    row.appendChild(label);
    row.appendChild(value);
    budgetChartLegend.appendChild(row);
  });

  budgetChartCanvas.setAttribute(
    "aria-label",
    `Camembert des dépenses: ${entries.length} poste(s), total ${formatMoney(total)}.`
  );
}

function renderTasks() {
  if (!taskList || !taskTemplate) {
    return;
  }

  taskList.innerHTML = "";
  const search = toSearchKey(taskSearch?.value ?? "");
  const mode = taskFilter?.value ?? "all";
  const orderedTasks = [...state.tasks].sort((a, b) => Number(a.done) - Number(b.done));
  const filteredTasks = orderedTasks.filter((task) => {
    if (mode === "todo" && task.done) {
      return false;
    }
    if (mode === "done" && !task.done) {
      return false;
    }
    if (search && !toSearchKey(task.text).includes(search)) {
      return false;
    }
    return true;
  });

  if (taskStats) {
    const doneCount = state.tasks.filter((task) => task.done).length;
    taskStats.textContent = `${filteredTasks.length}/${state.tasks.length} tâches affichées - ${doneCount} terminées`;
  }

  if (taskClearDone) {
    const hasDone = state.tasks.some((task) => task.done);
    taskClearDone.disabled = !hasDone;
  }

  if (filteredTasks.length === 0) {
    const emptyNode = document.createElement("li");
    emptyNode.className = "list-empty";
    emptyNode.textContent = state.tasks.length ? "Aucune tâche pour ce filtre." : "Aucune tâche pour le moment.";
    taskList.appendChild(emptyNode);
    return;
  }

  for (const [index, task] of filteredTasks.entries()) {
    const node = taskTemplate.content.firstElementChild.cloneNode(true);
    node.style.setProperty("--stagger", String(index));
    node.classList.toggle("done", task.done);
    const check = node.querySelector("input[type='checkbox']");
    check.checked = task.done;
    check.addEventListener("change", () => {
      task.done = check.checked;
      refresh();
    });

    node.querySelector(".main-text").textContent = task.text;
    node.querySelector("button").addEventListener("click", () => {
      state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
      refresh();
    });

    taskList.appendChild(node);
  }
}

function renderGuests() {
  if (!guestList || !guestTemplate) {
    return;
  }

  guestList.innerHTML = "";
  const search = toSearchKey(guestSearch?.value ?? "");
  const mode = guestFilter?.value ?? "all";
  const attendanceMode = guestAttendanceFilter?.value ?? "all";
  const statusRank = { pending: 0, yes: 1, no: 2 };
  const orderedGuests = [...state.guests].sort((a, b) => {
    const rankDiff = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  });

  const filteredGuests = orderedGuests.filter((guest) => {
    const groupType = normalizeGuestGroupType(guest.groupType);
    const groupLabel = getGuestGroupTypeLabel(groupType);
    const attendanceType = normalizeGuestAttendanceType(guest.attendanceType);
    const attendanceLabel = getGuestAttendanceTypeLabel(attendanceType);
    if (mode !== "all" && guest.status !== mode) {
      return false;
    }
    if (attendanceMode !== "all" && attendanceType !== attendanceMode) {
      return false;
    }
    const searchValue = `${guest.name} ${groupLabel} ${attendanceLabel}`;
    if (search && !toSearchKey(searchValue).includes(search)) {
      return false;
    }
    return true;
  });

  if (guestStats) {
    const pending = state.guests.filter((guest) => guest.status === "pending").length;
    const totalPeople = state.guests.reduce(
      (sum, guest) => sum + normalizeGuestPartySize(guest.partySize, guest.groupType),
      0
    );
    guestStats.textContent = `${filteredGuests.length}/${state.guests.length} invitations affichées - ${pending} en attente - ${totalPeople} pers.`;
  }
  if (guestVinStats) {
    const vinInvitations = state.guests.length;
    const vinPeople = state.guests.reduce(
      (sum, guest) => sum + normalizeGuestPartySize(guest.partySize, guest.groupType),
      0
    );
    const vinConfirmed = state.guests
      .filter((guest) => guest.status === "yes")
      .reduce((sum, guest) => sum + normalizeGuestPartySize(guest.partySize, guest.groupType), 0);
    guestVinStats.textContent = `Vin d'honneur: ${vinInvitations} invitations - ${vinPeople} pers. - ${vinConfirmed} oui`;
  }
  if (guestMealStats) {
    const mealGuests = state.guests.filter(
      (guest) => normalizeGuestAttendanceType(guest.attendanceType) === "vin_repas"
    );
    const mealInvitations = mealGuests.length;
    const mealPeople = mealGuests.reduce(
      (sum, guest) => sum + normalizeGuestPartySize(guest.partySize, guest.groupType),
      0
    );
    const mealConfirmed = mealGuests
      .filter((guest) => guest.status === "yes")
      .reduce((sum, guest) => sum + normalizeGuestPartySize(guest.partySize, guest.groupType), 0);
    guestMealStats.textContent = `Repas: ${mealInvitations} invitations - ${mealPeople} pers. - ${mealConfirmed} oui`;
  }
  if (guestHebergStats) {
    const hebergGuests = state.guests.filter((g) => g.hebergement && g.status === "yes");
    const hebergPeople = hebergGuests.reduce((sum, g) => sum + normalizeGuestPartySize(g.partySize, g.groupType), 0);
    const hebergRevenue = hebergGuests.length * 75;
    guestHebergStats.textContent = `Hébergement: ${hebergGuests.length} foyer(s) - ${hebergPeople} pers. — ${formatMoney(hebergRevenue)}`;
  }

  if (filteredGuests.length === 0) {
    const emptyNode = document.createElement("li");
    emptyNode.className = "list-empty";
    emptyNode.textContent = state.guests.length ? "Aucune invitation pour ce filtre." : "Aucune invitation pour le moment.";
    guestList.appendChild(emptyNode);
    return;
  }

  for (const [index, guest] of filteredGuests.entries()) {
    const node = guestTemplate.content.firstElementChild.cloneNode(true);
    node.style.setProperty("--stagger", String(index));
    node.querySelector(".main-text").textContent = guest.name;
    const groupType = normalizeGuestGroupType(guest.groupType);
    const attendanceType = normalizeGuestAttendanceType(guest.attendanceType);
    const partySize = normalizeGuestPartySize(guest.partySize, groupType);
    const groupMeta = node.querySelector(".guest-meta");
    if (groupMeta) {
      const submittedPart = guest.rsvpSubmittedAt > 0
        ? ` — RSVP le ${new Date(guest.rsvpSubmittedAt).toLocaleDateString("fr-FR")}`
        : "";
      groupMeta.textContent = `${getGuestGroupTypeLabel(groupType)} - ${getGuestAttendanceTypeLabel(attendanceType)} - ${formatPartySize(partySize)}${submittedPart}`;
    }

    const hebergCheck = node.querySelector(".hebergement-check");
    if (hebergCheck) {
      hebergCheck.checked = Boolean(guest.hebergement);
      hebergCheck.addEventListener("change", () => {
        guest.hebergement = hebergCheck.checked;
        refresh();
      });
    }

    const statusSelect = node.querySelector("select.inline-status");
    statusSelect.value = VALID_GUEST_STATUS.has(guest.status) ? guest.status : "pending";
    statusSelect.addEventListener("change", () => {
      guest.status = statusSelect.value;
      refresh();
    });

    const qrLink = node.querySelector(".qr-action");
    if (qrLink) {
      const rsvpUrl = buildRsvpUrl(guest.rsvpToken);
      qrLink.href = buildQrImageUrl(rsvpUrl);
      qrLink.title = `QR RSVP pour ${guest.name} (${getGuestGroupTypeLabel(groupType).toLowerCase()})`;
      qrLink.setAttribute("aria-label", `Ouvrir le QR RSVP pour ${guest.name}`);
    }

    node.querySelector("button").addEventListener("click", () => {
      state.guests = state.guests.filter((entry) => entry.id !== guest.id);
      refresh();
    });

    guestList.appendChild(node);
  }
}

function renderMetrics() {
  const budgetTotal = state.budgetItems.reduce((sum, item) => sum + Number(item.amountTotal ?? item.amount ?? 0), 0);
  const budgetGoal = state.budgetGoal || 0;
  const guestCount = Number.isFinite(state.budgetGuestCount) && state.budgetGuestCount > 0
    ? Math.floor(state.budgetGuestCount)
    : DEFAULT_STATE.budgetGuestCount;
  const adultCountRaw = Number.isFinite(state.budgetAdultCount) && state.budgetAdultCount > 0
    ? Math.floor(state.budgetAdultCount)
    : Math.min(DEFAULT_STATE.budgetAdultCount, guestCount);
  const adultCount = Math.min(adultCountRaw, guestCount);
  const budgetLeft = Math.max(budgetGoal - budgetTotal, 0);

  const taskDone = state.tasks.filter((task) => task.done).length;
  const tasksPercent = state.tasks.length ? Math.round((taskDone / state.tasks.length) * 100) : 0;

  const replied = state.guests
    .filter((guest) => guest.status !== "pending")
    .reduce((sum, guest) => sum + normalizeGuestPartySize(guest.partySize, guest.groupType), 0);
  const totalGuests = state.guests.reduce(
    (sum, guest) => sum + normalizeGuestPartySize(guest.partySize, guest.groupType),
    0
  );
  const rsvpPercent = totalGuests ? Math.round((replied / totalGuests) * 100) : 0;

  if (metricBudgetTotal) {
    metricBudgetTotal.textContent = formatMoney(budgetTotal);
  }
  if (metricBudgetLeft) {
    metricBudgetLeft.textContent = formatMoney(budgetLeft);
  }
  if (budgetPerGuestLabel) {
    budgetPerGuestLabel.textContent = `Tarif final par invité (${guestCount} pers.)`;
  }
  if (budgetPerAdultLabel) {
    budgetPerAdultLabel.textContent = `Tarif final par adulte (${adultCount} adultes)`;
  }
  if (budgetPerGuest) {
    const value = guestCount > 0 ? budgetTotal / guestCount : 0;
    budgetPerGuest.textContent = formatMoney(value, 2);
  }
  if (budgetPerAdult) {
    const value = adultCount > 0 ? budgetTotal / adultCount : 0;
    budgetPerAdult.textContent = formatMoney(value, 2);
  }
  if (metricTasks) {
    metricTasks.textContent = `${tasksPercent}%`;
  }
  if (metricRsvp) {
    metricRsvp.textContent = `${rsvpPercent}%`;
  }
}

function clearPrivateUi() {
  if (budgetGoalInput) {
    budgetGoalInput.value = String(DEFAULT_STATE.budgetGoal);
  }
  if (budgetGuestCountInput) {
    budgetGuestCountInput.value = String(DEFAULT_STATE.budgetGuestCount);
  }
  if (budgetAdultCountInput) {
    budgetAdultCountInput.value = String(DEFAULT_STATE.budgetAdultCount);
  }
  if (budgetList) {
    budgetList.innerHTML = "";
  }
  if (taskList) {
    taskList.innerHTML = "";
  }
  if (guestList) {
    guestList.innerHTML = "";
  }
  if (taskSearch) {
    taskSearch.value = "";
  }
  if (taskFilter) {
    taskFilter.value = "all";
  }
  if (taskStats) {
    taskStats.textContent = "0 tâche";
  }
  if (taskClearDone) {
    taskClearDone.disabled = true;
  }
  if (guestSearch) {
    guestSearch.value = "";
  }
  if (guestFilter) {
    guestFilter.value = "all";
  }
  if (guestAttendanceFilter) {
    guestAttendanceFilter.value = "all";
  }
  if (guestGroupType) {
    guestGroupType.value = "single";
  }
  if (guestAttendanceType) {
    guestAttendanceType.value = "vin_repas";
  }
  if (guestPartySize) {
    guestPartySize.value = "1";
    guestPartySize.disabled = true;
  }
  if (guestStats) {
    guestStats.textContent = "0 invitation";
  }
  if (guestVinStats) {
    guestVinStats.textContent = "Vin d'honneur: 0 invitation - 0 pers.";
  }
  if (guestMealStats) {
    guestMealStats.textContent = "Repas: 0 invitation - 0 pers.";
  }
  if (guestHebergStats) {
    guestHebergStats.textContent = "Hébergement: 0 foyer(s) - 0 pers. — 0 €";
  }
  if (metricBudgetTotal) {
    metricBudgetTotal.textContent = "0 EUR";
  }
  if (metricBudgetLeft) {
    metricBudgetLeft.textContent = "0 EUR";
  }
  if (budgetPerGuest) {
    budgetPerGuest.textContent = formatMoney(0, 2);
  }
  if (budgetPerAdult) {
    budgetPerAdult.textContent = formatMoney(0, 2);
  }
  if (budgetPerGuestLabel) {
    budgetPerGuestLabel.textContent = `Tarif final par invité (${DEFAULT_STATE.budgetGuestCount} pers.)`;
  }
  if (budgetPerAdultLabel) {
    budgetPerAdultLabel.textContent = `Tarif final par adulte (${DEFAULT_STATE.budgetAdultCount} adultes)`;
  }
  if (metricTasks) {
    metricTasks.textContent = "0%";
  }
  if (metricRsvp) {
    metricRsvp.textContent = "0%";
  }
  renderBudgetChart();
}

function formatMoney(value, digits = 0) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function toSearchKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

function createGuestToken() {
  return `g_${createId()}${createId()}`;
}

function normalizeGuestGroupType(value) {
  return VALID_GUEST_GROUP_TYPE.has(value) ? value : "single";
}

function normalizeGuestAttendanceType(value) {
  return VALID_GUEST_ATTENDANCE_TYPE.has(value) ? value : "vin_repas";
}

function normalizeGuestPartySize(value, groupType) {
  const normalizedGroupType = normalizeGuestGroupType(groupType);
  if (normalizedGroupType === "single") {
    return 1;
  }
  if (normalizedGroupType === "couple") {
    return 2;
  }

  const size = Math.floor(Number(value));
  if (!Number.isFinite(size) || size < 1) {
    return 3;
  }
  return size;
}

function getGuestGroupTypeLabel(groupType) {
  return GUEST_GROUP_TYPE_LABEL[normalizeGuestGroupType(groupType)];
}

function getGuestAttendanceTypeLabel(attendanceType) {
  return GUEST_ATTENDANCE_TYPE_LABEL[normalizeGuestAttendanceType(attendanceType)];
}

function formatPartySize(value) {
  return value > 1 ? `${value} personnes` : `${value} personne`;
}

function applyGuestTypePreset(groupType) {
  if (!guestPartySize || !guestGroupType) {
    return;
  }

  const normalizedGroupType = normalizeGuestGroupType(groupType);
  guestGroupType.value = normalizedGroupType;

  if (normalizedGroupType === "single") {
    guestPartySize.value = "1";
    guestPartySize.disabled = true;
    return;
  }

  if (normalizedGroupType === "couple") {
    guestPartySize.value = "2";
    guestPartySize.disabled = true;
    return;
  }

  const currentSize = Math.floor(Number(guestPartySize.value));
  if (!Number.isFinite(currentSize) || currentSize < 1) {
    guestPartySize.value = "3";
  }
  guestPartySize.disabled = false;
}

function getPublicBaseUrl() {
  if (isServerMode && window.location.origin) {
    return window.location.origin;
  }
  return "http://127.0.0.1:8000";
}

function buildRsvpUrl(token) {
  return `${getPublicBaseUrl()}/rsvp?token=${encodeURIComponent(token)}`;
}

function buildQrImageUrl(dataUrl) {
  return `${QR_API_ENDPOINT}?size=360x360&data=${encodeURIComponent(dataUrl)}`;
}

function createDefaultState() {
  return {
    budgetGoal: DEFAULT_STATE.budgetGoal,
    budgetGuestCount: DEFAULT_STATE.budgetGuestCount,
    budgetAdultCount: DEFAULT_STATE.budgetAdultCount,
    budgetItems: [],
    budgetCategories: DEFAULT_BUDGET_CATEGORIES.map((c) => ({ ...c })),
    tasks: [],
    guests: [],
    updatedAt: DEFAULT_STATE.updatedAt,
  };
}

function normalizeSupplier(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    contact: String(s.contact ?? "").trim(),
    phone: String(s.phone ?? "").trim(),
    email: String(s.email ?? "").trim(),
    address: String(s.address ?? "").trim(),
    website: String(s.website ?? "").trim(),
    notes: String(s.notes ?? "").trim(),
  };
}

function normalizeState(candidate) {
  const input = candidate && typeof candidate === "object" ? candidate : {};

  const budgetGoal = Number(input.budgetGoal);
  const normalized = createDefaultState();
  normalized.budgetGoal = Number.isFinite(budgetGoal) && budgetGoal >= 0 ? budgetGoal : DEFAULT_STATE.budgetGoal;
  const budgetGuestCount = Math.floor(Number(input.budgetGuestCount));
  normalized.budgetGuestCount = Number.isFinite(budgetGuestCount) && budgetGuestCount >= 1
    ? budgetGuestCount
    : DEFAULT_STATE.budgetGuestCount;
  const budgetAdultCount = Math.floor(Number(input.budgetAdultCount));
  const fallbackAdults = Math.min(DEFAULT_STATE.budgetAdultCount, normalized.budgetGuestCount);
  normalized.budgetAdultCount = Number.isFinite(budgetAdultCount) && budgetAdultCount >= 1
    ? Math.min(budgetAdultCount, normalized.budgetGuestCount)
    : fallbackAdults;
  const updatedAt = Number(input.updatedAt);
  normalized.updatedAt = Number.isFinite(updatedAt) && updatedAt >= 0 ? updatedAt : DEFAULT_STATE.updatedAt;

  if (Array.isArray(input.budgetItems)) {
    normalized.budgetItems = input.budgetItems
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const amountTotal = Number(item.amountTotal ?? item.amount ?? 0);
        const amountPaid = Number(item.amountPaid ?? 0);
        return {
          id: typeof item.id === "string" && item.id ? item.id : createId(),
          label: String(item.label ?? "").trim(),
          categoryId: typeof item.categoryId === "string" && item.categoryId ? item.categoryId : null,
          amountTotal: Number.isFinite(amountTotal) && amountTotal >= 0 ? amountTotal : 0,
          amountPaid: Number.isFinite(amountPaid) && amountPaid >= 0 ? amountPaid : 0,
          solde: Boolean(item.solde),
          supplier: normalizeSupplier(item.supplier),
        };
      })
      .filter((item) => item.label);
  }

  if (Array.isArray(input.budgetCategories)) {
    normalized.budgetCategories = input.budgetCategories
      .filter((cat) => cat && typeof cat === "object")
      .map((cat) => ({
        id: typeof cat.id === "string" && cat.id ? cat.id : createId(),
        name: String(cat.name ?? "").trim(),
      }))
      .filter((cat) => cat.name);
  } else {
    normalized.budgetCategories = DEFAULT_BUDGET_CATEGORIES.map((c) => ({ ...c }));
  }

  if (Array.isArray(input.tasks)) {
    normalized.tasks = input.tasks
      .filter((task) => task && typeof task === "object")
      .map((task) => ({
        id: typeof task.id === "string" && task.id ? task.id : createId(),
        text: String(task.text ?? "").trim(),
        done: Boolean(task.done),
      }))
      .filter((task) => task.text);
  }

  if (Array.isArray(input.guests)) {
    normalized.guests = input.guests
      .filter((guest) => guest && typeof guest === "object")
      .map((guest) => {
        const groupType = normalizeGuestGroupType(guest.groupType);
        return {
          id: typeof guest.id === "string" && guest.id ? guest.id : createId(),
          name: String(guest.name ?? "").trim(),
          groupType,
          attendanceType: normalizeGuestAttendanceType(guest.attendanceType),
          partySize: normalizeGuestPartySize(guest.partySize, groupType),
          status: VALID_GUEST_STATUS.has(guest.status) ? guest.status : "pending",
          rsvpToken: typeof guest.rsvpToken === "string" && guest.rsvpToken.trim() ? guest.rsvpToken.trim() : createGuestToken(),
          hebergement: Boolean(guest.hebergement),
          rsvpSubmittedAt: Number(guest.rsvpSubmittedAt) || 0,
        };
      })
      .filter((guest) => guest.name);

    const usedTokens = new Set();
    for (const guest of normalized.guests) {
      let token = guest.rsvpToken;
      while (!token || usedTokens.has(token)) {
        token = createGuestToken();
      }
      guest.rsvpToken = token;
      usedTokens.add(token);
    }
  }

  return normalized;
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }
    return normalizeState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

function getAuthHeaders() {
  if (!adminToken) {
    return {};
  }

  return {
    "X-Admin-Key": adminToken,
  };
}

async function verifyAdminToken(token) {
  if (!isServerMode) {
    return { ok: false, reason: "not_server_mode" };
  }

  try {
    const response = await fetch(ADMIN_CHECK_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        "X-Admin-Key": token,
      },
    });

    if (response.ok) {
      return { ok: true, reason: "ok" };
    }

    if (response.status === 401) {
      return { ok: false, reason: "unauthorized" };
    }
    if (response.status === 404) {
      return { ok: false, reason: "endpoint_not_found" };
    }

    return { ok: false, reason: "server_error" };
  } catch {
    return { ok: false, reason: "server_unreachable" };
  }
}

async function loadState() {
  const localState = loadFromLocalStorage();
  if (!isServerMode || !adminToken) {
    return localState;
  }

  try {
    const response = await fetch(SERVER_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const serverState = normalizeState(await response.json());
    const useLocalState = localState.updatedAt > serverState.updatedAt;
    const selectedState = useLocalState ? localState : serverState;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedState));
    serverSyncAvailable = true;

    if (useLocalState) {
      try {
        await pushStateToServer(selectedState);
      } catch {
        serverSyncAvailable = false;
      }
    }

    return selectedState;
  } catch (error) {
    serverSyncAvailable = false;
    console.warn("Impossible de charger le fichier serveur.", error);
    return localState;
  }
}

async function pushStateToServer(payload) {
  const response = await fetch(SERVER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      if (json?.error) detail += ` — ${json.error}`;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
}

async function persistState() {
  if (!isAdminUnlocked) {
    return;
  }

  const payload = normalizeState(state);
  payload.updatedAt = Math.max(Date.now(), (state.updatedAt || 0) + 1);
  state.updatedAt = payload.updatedAt;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

  if (!isServerMode || !adminToken) {
    return;
  }

  try {
    await pushStateToServer(payload);
    serverSyncAvailable = true;
    setSyncStatus("Sauvegarde activée : data.json + budget_mariage.xlsx", false);
  } catch (error) {
    serverSyncAvailable = false;
    setSyncStatus(`Erreur serveur : ${error.message}`, true);
    console.warn("Impossible de sauvegarder dans le fichier serveur.", error);
  }
}

function setSyncStatus(message, isError) {
  if (!syncStatus) {
    return;
  }

  syncStatus.textContent = message;
  syncStatus.classList.toggle("error", Boolean(isError));
}

function setAdminError(message) {
  if (!adminError) {
    return;
  }

  adminError.textContent = message;
}

function setPrivateZoneVisible(isVisible) {
  if (!privateZone) {
    return;
  }

  privateZone.classList.toggle("is-hidden", !isVisible);
}

function toggleAdminVisibility(isUnlocked) {
  if (adminGate) {
    adminGate.classList.toggle("is-hidden", isUnlocked);
  }
  if (adminContent) {
    adminContent.classList.toggle("is-hidden", !isUnlocked);
  }
}

function lockAdmin(options = {}) {
  const message = options.message ?? "Connectez-vous en admin pour accéder à l'organisation.";

  isAdminUnlocked = false;
  adminToken = "";
  Object.assign(state, createDefaultState());
  clearPrivateUi();
  toggleAdminVisibility(false);
  setPrivateZoneVisible(adminInterfaceEnabled);
  setAdminError(message);
}

async function unlockAdmin(token) {
  adminToken = token;
  isAdminUnlocked = true;
  setPrivateZoneVisible(true);
  toggleAdminVisibility(true);
  setAdminError("");

  const loadedState = await loadState();
  Object.assign(state, loadedState);
  refresh({ persist: false });

  if (isServerMode && serverSyncAvailable) {
    setSyncStatus("Sauvegarde activée : data.json + budget_mariage.xlsx", false);
    return;
  }

  if (isServerMode) {
    setSyncStatus("Mode serveur sans synchronisation de fichier. Sauvegarde navigateur activée.", true);
    return;
  }

  setSyncStatus("Sauvegarde navigateur activée.", false);
}

function openAdminInterface() {
  adminInterfaceEnabled = true;
  setPrivateZoneVisible(true);

  if (!isAdminUnlocked) {
    if (!isServerMode) {
      setAdminError("Connexion admin indisponible ici. Ouvrez le site via http://127.0.0.1:8000.");
    } else {
      setAdminError("Connectez-vous en admin pour accéder à l'organisation.");
    }
  }

  if (privateZone) {
    privateZone.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function init() {
  lockAdmin({ message: "" });
  const savedToken = localStorage.getItem(ADMIN_SESSION_KEY);
  adminInterfaceEnabled = isAdminPage || Boolean(savedToken);

  if (!adminInterfaceEnabled) {
    setPrivateZoneVisible(false);
    return;
  }

  setPrivateZoneVisible(true);

  if (!isServerMode) {
    setAdminError("L'espace admin est disponible via server.py (http://127.0.0.1:8000).");
    return;
  }

  if (!savedToken) {
    setAdminError("Connectez-vous en admin pour accéder à l'organisation.");
    return;
  }

  const check = await verifyAdminToken(savedToken);
  if (!check.ok) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    adminInterfaceEnabled = false;
    lockAdmin({ message: "" });

    if (check.reason === "server_unreachable") {
      setAdminError("Serveur indisponible. Lancez server.py puis reconnectez-vous.");
      return;
    }
    if (check.reason === "endpoint_not_found") {
      setAdminError("Serveur incompatible. Lancez python server.py (pas python -m http.server).");
      return;
    }

    setAdminError("Session admin expirée. Reconnectez-vous.");
    return;
  }

  await unlockAdmin(savedToken);
}

void init();
