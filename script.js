const STORAGE_KEY = "plan_mariage_data_v1";
const SERVER_ENDPOINT = "/api/data";
const ADMIN_CHECK_ENDPOINT = "/api/admin/check";
const ADMIN_SESSION_KEY = "plan_mariage_admin_token";
const WEDDING_DATE_ISO = "2027-04-17T14:30:00+02:00";
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
  guestGroups: [],
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
const budgetCategoryFilter = document.getElementById("budgetCategoryFilter");
const budgetSoldeFilter = document.getElementById("budgetSoldeFilter");
const budgetFilterStats = document.getElementById("budgetFilterStats");
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
const guestCategory = document.getElementById("guestCategory");
const guestAttendanceType = document.getElementById("guestAttendanceType");
const guestStatus = document.getElementById("guestStatus");
const guestList = document.getElementById("guestList");
const guestSearch = document.getElementById("guestSearch");
const guestFilter = document.getElementById("guestFilter");
const guestAttendanceFilter = document.getElementById("guestAttendanceFilter");
const guestCategoryFilter = document.getElementById("guestCategoryFilter");
const guestStats = document.getElementById("guestStats");
const guestCategoryStats = document.getElementById("guestCategoryStats");
const guestVinStats = document.getElementById("guestVinStats");
const guestMealStats = document.getElementById("guestMealStats");
const guestHebergStats = document.getElementById("guestHebergStats");
const guestGroupForm  = document.getElementById("guestGroupForm");
const guestGroupName  = document.getElementById("guestGroupName");
const guestGroupColor = document.getElementById("guestGroupColor");
const guestGroupList  = document.getElementById("guestGroupList");

const metricBudgetTotal = document.getElementById("metricBudgetTotal");
const metricBudgetLeft = document.getElementById("metricBudgetLeft");
const metricBudgetPaid = document.getElementById("metricBudgetPaid");
const metricBudgetDue = document.getElementById("metricBudgetDue");
const metricBudgetDueSub = document.getElementById("metricBudgetDueSub");
const metricTasks = document.getElementById("metricTasks");
const metricRsvp = document.getElementById("metricRsvp");
const syncStatus = document.getElementById("syncStatus");
const budgetChartCanvas = document.getElementById("budgetChartCanvas");
const budgetChartLegend = document.getElementById("budgetChartLegend");
const budgetChartEmpty = document.getElementById("budgetChartEmpty");

const budgetTemplate = document.getElementById("budgetItemTemplate");
const taskTemplate = document.getElementById("taskItemTemplate");
const guestTemplate = document.getElementById("guestItemTemplate");

const taskPrioritySelect = document.getElementById("taskPriority");
const budgetDueDateInput  = document.getElementById("budgetDueDate");

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
let _persistDebounceTimer = 0;
let _hasUnsavedChanges = false;
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
initDarkMode();
initStickyNav();
initScrollReveal();

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
        dueDate: budgetDueDateInput?.value || "",
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
        priority: taskPrioritySelect?.value || "normal",
      });

      taskForm.reset();
      refresh();
    });
  }

  if (budgetCategoryFilter) {
    budgetCategoryFilter.addEventListener("change", () => renderBudget());
  }

  if (budgetSoldeFilter) {
    budgetSoldeFilter.addEventListener("change", () => renderBudget());
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
      const attendanceType = normalizeGuestAttendanceType(guestAttendanceType?.value ?? "vin_repas");
      const status = guestStatus.value;
      if (!name) {
        return;
      }

      state.guests.push({
        id: createId(),
        name,
        groupType: "single",
        guestCategory: guestCategory?.value === "child" ? "child" : "adult",
        attendanceType,
        partySize: 1,
        status: VALID_GUEST_STATUS.has(status) ? status : "pending",
        rsvpToken: createGuestToken(),
        hebergement: false,
        hebergementInfo: false,
        rsvpSubmittedAt: 0,
        musicSuggestion: "",
        allergies: "",
        otherQuestion: "",
      });

      guestForm.reset();
      refresh();
    });
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

  if (guestCategoryFilter) {
    guestCategoryFilter.addEventListener("change", () => {
      renderGuests();
    });
  }

  if (guestGroupForm) {
    guestGroupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!isAdminUnlocked) return;
      const name  = guestGroupName?.value.trim();
      const color = guestGroupColor?.value || "#888888";
      if (!name) return;
      if (!Array.isArray(state.guestGroups)) state.guestGroups = [];
      state.guestGroups.push({ id: createId(), name, color });
      guestGroupForm.reset();
      if (guestGroupColor) guestGroupColor.value = "#7c6ae6";
      refresh();
    });
  }

  document.getElementById("btnExportGuestsCSV")?.addEventListener("click", () => {
    if (!isAdminUnlocked) return;
    exportGuestsCSV();
  });

  document.getElementById("btnAddHosts")?.addEventListener("click", () => {
    if (!isAdminUnlocked) return;
    const alreadyHasHosts = state.guests.some((g) => g.isHost);
    if (alreadyHasHosts) return;
    const hostBase = { groupType: "single", attendanceType: "vin_repas", partySize: 1, status: "yes", isHost: true, hebergement: false, hebergementInfo: false, rsvpSubmittedAt: 0, guestCategory: "adult", musicSuggestion: "", allergies: "", otherQuestion: "", colorGroupId: null };
    state.guests.unshift({ ...hostBase, id: createId(), name: "Le marié", rsvpToken: createGuestToken() });
    state.guests.unshift({ ...hostBase, id: createId(), name: "La mariée", rsvpToken: createGuestToken() });
    refresh();
  });
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
  bindMetricCardNavigation();
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
      renderRsvpChart();
      renderBudgetBarChart();
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
  countdownNote.textContent = "Avant de célébrer ensemble.";
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
  renderGuestGroups();
  renderMetrics();
  renderBudgetChart();
  renderUpcomingPayments();
  renderRsvpChart();
  renderBudgetBarChart();

  if (persist) {
    schedulePersist();
  }
}

function schedulePersist() {
  persistQueued = true;
  _hasUnsavedChanges = true;
  if (_persistDebounceTimer) clearTimeout(_persistDebounceTimer);
  _persistDebounceTimer = setTimeout(() => {
    _persistDebounceTimer = 0;
    if (!persistInProgress) void flushPersistQueue();
  }, 1000);
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

  // Mettre à jour le filtre catégorie
  if (budgetCategoryFilter) {
    const prev = budgetCategoryFilter.value;
    budgetCategoryFilter.innerHTML = '<option value="all">Toutes les catégories</option><option value="__none__">Sans catégorie</option>';
    for (const cat of categories) {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      budgetCategoryFilter.appendChild(opt);
    }
    budgetCategoryFilter.value = prev && (prev === "all" || prev === "__none__" || categories.some((c) => c.id === prev)) ? prev : "all";
  }

  // Filtrer les items
  const catMode = budgetCategoryFilter?.value ?? "all";
  const soldeMode = budgetSoldeFilter?.value ?? "all";
  const filteredItems = state.budgetItems.filter((item) => {
    if (catMode === "__none__" && item.categoryId) return false;
    if (catMode !== "all" && catMode !== "__none__" && item.categoryId !== catMode) return false;
    if (soldeMode === "settled" && !item.solde) return false;
    if (soldeMode === "unsettled" && item.solde) return false;
    return true;
  });

  if (budgetFilterStats) {
    const totalShown = filteredItems.reduce((s, i) => s + Number(i.amountTotal ?? 0), 0);
    budgetFilterStats.textContent = filteredItems.length === state.budgetItems.length
      ? `${state.budgetItems.length} poste${state.budgetItems.length > 1 ? "s" : ""}`
      : `${filteredItems.length} / ${state.budgetItems.length} postes — ${formatMoney(totalShown)}`;
  }

  budgetList.innerHTML = "";
  for (const [index, item] of filteredItems.entries()) {
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

    // Afficher la date d'échéance
    const dueDateEl = node.querySelector(".budget-item-due-date");
    if (dueDateEl) {
      if (item.dueDate && !item.solde) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(item.dueDate + "T00:00:00");
        const diffDays = Math.round((due - today) / 86400000);
        const formatted = due.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
        if (diffDays < 0) {
          dueDateEl.textContent = `⚠ En retard : ${formatted}`;
          dueDateEl.classList.add("is-overdue");
        } else if (diffDays <= 30) {
          dueDateEl.textContent = `⏰ Échéance : ${formatted}`;
          dueDateEl.classList.add("is-soon");
        } else {
          dueDateEl.textContent = `📅 Échéance : ${formatted}`;
        }
      } else {
        dueDateEl.style.display = "none";
      }
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
          const editDue = editPanel.querySelector(".edit-due-date");
          if (editDue) editDue.value = item.dueDate || "";
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
        const editDue = editPanel.querySelector(".edit-due-date");
        if (editDue) item.dueDate = editDue.value || "";
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

    // ── Versements partiels ────────────────────────────────────────
    const paymentsWrap = node.querySelector(".budget-payments-wrap");
    if (paymentsWrap) {
      renderPayments(item, paymentsWrap);
    }

    budgetList.appendChild(node);
  }
}

function renderPayments(item, container) {
  container.innerHTML = "";
  const payments = Array.isArray(item.payments) ? item.payments : [];

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "payments-toggle-btn";
  toggleBtn.textContent = payments.length
    ? `🔸 ${payments.length} versement${payments.length > 1 ? "s" : ""}`
    : "＋ Ajouter versements";
  container.appendChild(toggleBtn);

  const inner = document.createElement("div");
  inner.className = "payments-inner is-hidden";
  container.appendChild(inner);

  toggleBtn.addEventListener("click", () => {
    const open = inner.classList.toggle("is-hidden");
    toggleBtn.classList.toggle("is-active", !open);
  });

  function rebuildInner() {
    inner.innerHTML = "";
    const pmts = Array.isArray(item.payments) ? item.payments : [];

    for (const pmt of pmts) {
      const row = document.createElement("div");
      row.className = "payment-row";
      const rest = Math.max(0, pmt.amountTotal - pmt.amountPaid);
      row.innerHTML = `
        <span class="payment-label">${pmt.label}</span>
        <span class="payment-amounts">
          ${formatMoney(pmt.amountTotal)} — payé ${formatMoney(pmt.amountPaid)}
          ${rest > 0 ? `<span class="payment-rest">(reste ${formatMoney(rest)})</span>` : `<span class="payment-solde">✓</span>`}
          ${pmt.dueDate ? `<span class="payment-due">📅 ${new Date(pmt.dueDate + "T00:00:00").toLocaleDateString("fr-FR", {day:"numeric",month:"short"})}</span>` : ""}
        </span>
        <button type="button" class="payment-del-btn" title="Supprimer ce versement">×</button>`;
      row.querySelector(".payment-del-btn").addEventListener("click", () => {
        item.payments = item.payments.filter(p => p.id !== pmt.id);
        if (item.payments.length === 0) delete item.payments;
        item.amountTotal = item.payments ? item.payments.reduce((s,p) => s+p.amountTotal, 0) : item.amountTotal;
        item.amountPaid  = item.payments ? item.payments.reduce((s,p) => s+p.amountPaid,  0) : item.amountPaid;
        refresh();
      });
      inner.appendChild(row);
    }

    // Formulaire ajout versement
    const form = document.createElement("div");
    form.className = "payment-add-form";
    form.innerHTML = `
      <input type="text"   class="pmt-label"   placeholder="Ex : Acompte" value="">
      <input type="number" class="pmt-total"   placeholder="Montant (€)" min="0" step="1">
      <input type="number" class="pmt-paid"    placeholder="Déjà payé (€)" min="0" step="1">
      <input type="date"   class="pmt-due"     title="Échéance">
      <button type="button" class="pmt-add-btn">Ajouter</button>`;
    form.querySelector(".pmt-add-btn").addEventListener("click", () => {
      const lbl   = form.querySelector(".pmt-label").value.trim() || "Versement";
      const total = Math.max(0, Number(form.querySelector(".pmt-total").value) || 0);
      const paid  = Math.max(0, Number(form.querySelector(".pmt-paid").value)  || 0);
      const due   = form.querySelector(".pmt-due").value;
      if (!item.payments) item.payments = [];
      item.payments.push({ id: createId(), label: lbl, amountTotal: total, amountPaid: paid, dueDate: due, solde: total > 0 && paid >= total });
      item.amountTotal = item.payments.reduce((s,p) => s+p.amountTotal, 0);
      item.amountPaid  = item.payments.reduce((s,p) => s+p.amountPaid,  0);
      item.solde = item.amountTotal > 0 && item.amountPaid >= item.amountTotal;
      refresh();
      // Rouvrir la section
      setTimeout(() => {
        const newBtn = container.querySelector(".payments-toggle-btn");
        const newInner = container.querySelector(".payments-inner");
        if (newBtn && newInner) { newInner.classList.remove("is-hidden"); newBtn.classList.add("is-active"); }
      }, 50);
    });
    inner.appendChild(form);
  }

  rebuildInner();
}

function renderGuestGroups() {
  if (!guestGroupList) return;
  const groups = Array.isArray(state.guestGroups) ? state.guestGroups : [];
  guestGroupList.innerHTML = "";
  if (groups.length === 0) {
    const empty = document.createElement("span");
    empty.className = "category-chip-empty";
    empty.textContent = "Aucun groupe.";
    guestGroupList.appendChild(empty);
    return;
  }
  for (const grp of groups) {
    const chip = document.createElement("span");
    chip.className = "category-chip guest-group-chip";
    chip.style.setProperty("--grp-color", grp.color);
    const swatch = document.createElement("span");
    swatch.className = "guest-group-swatch";
    swatch.style.background = grp.color;
    const label = document.createElement("span");
    label.textContent = grp.name;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "category-chip-delete";
    del.textContent = "×";
    del.setAttribute("aria-label", `Supprimer le groupe ${grp.name}`);
    del.addEventListener("click", () => {
      state.guestGroups = state.guestGroups.filter(g => g.id !== grp.id);
      // Retirer colorGroupId des invités de ce groupe
      for (const guest of state.guests) {
        if (guest.colorGroupId === grp.id) guest.colorGroupId = null;
      }
      refresh();
    });
    chip.appendChild(swatch);
    chip.appendChild(label);
    chip.appendChild(del);
    guestGroupList.appendChild(chip);
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
  const priorityRank = { urgent: 0, normal: 1, faible: 2 };
  const orderedTasks = [...state.tasks].sort((a, b) => {
    const doneDiff = Number(a.done) - Number(b.done);
    if (doneDiff !== 0) return doneDiff;
    return (priorityRank[a.priority || "normal"] ?? 1) - (priorityRank[b.priority || "normal"] ?? 1);
  });
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
    node.dataset.taskId = task.id;
    node.classList.toggle("done", task.done);
    const check = node.querySelector("input[type='checkbox']");
    check.checked = task.done;
    check.addEventListener("change", () => {
      task.done = check.checked;
      refresh();
    });

    node.querySelector(".main-text").textContent = task.text;

    const badge = node.querySelector(".task-priority-badge");
    if (badge) {
      const p = task.priority || "normal";
      const labels = { urgent: "🔴 Urgent", normal: "⚪ Normal", faible: "🟢 Faible" };
      badge.textContent = labels[p] || "";
      badge.className = `task-priority-badge task-priority-${p}`;
      badge.style.display = p === "normal" ? "none" : "";
    }

    node.querySelector("button.danger").addEventListener("click", () => {
      state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
      refresh();
    });

    taskList.appendChild(node);
  }

  initTaskDragAndDrop();
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
    // Les mariés toujours en tête
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    const rankDiff = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  });

  const categoryMode = guestCategoryFilter?.value ?? "all";
  const filteredGuests = orderedGuests.filter((guest) => {
    const attendanceType = normalizeGuestAttendanceType(guest.attendanceType);
    const attendanceLabel = getGuestAttendanceTypeLabel(attendanceType);
    if (mode !== "all" && guest.status !== mode) return false;
    if (attendanceMode !== "all" && attendanceType !== attendanceMode) return false;
    if (categoryMode !== "all" && (guest.guestCategory === "child" ? "child" : "adult") !== categoryMode) return false;
    if (search && !toSearchKey(`${guest.name} ${attendanceLabel}`).includes(search)) return false;
    return true;
  });

  if (guestStats) {
    const invites = state.guests.filter((g) => !g.isHost);
    const pending = invites.filter((g) => g.status === "pending").length;
    const confirmed = invites.filter((g) => g.status === "yes").length;
    guestStats.textContent = `${filteredGuests.length}/${state.guests.length} affichés — ${confirmed} oui — ${pending} en attente (${invites.length} invités + ${state.guests.length - invites.length} marié${state.guests.length - invites.length > 1 ? "s" : ""})`;
  }
  if (guestCategoryStats) {
    const adults = state.guests.filter((g) => g.guestCategory !== "child").length;
    const children = state.guests.filter((g) => g.guestCategory === "child").length;
    guestCategoryStats.textContent = `Adultes: ${adults} — Enfants: ${children}`;
  }
  if (guestVinStats) {
    const totalPersons = state.guests.reduce((s, g) => s + normalizeGuestPartySize(g.partySize, g.groupType), 0);
    const confirmedPersons = state.guests.filter((g) => g.status === "yes").reduce((s, g) => s + normalizeGuestPartySize(g.partySize, g.groupType), 0);
    guestVinStats.textContent = `Vin d'honneur: ${state.guests.length} invitations (${totalPersons} pers.) — ${confirmedPersons} pers. confirmées`;
  }
  if (guestMealStats) {
    const meal = state.guests.filter((g) => normalizeGuestAttendanceType(g.attendanceType) === "vin_repas");
    const mealPersons = meal.reduce((s, g) => s + normalizeGuestPartySize(g.partySize, g.groupType), 0);
    const mealConfirmedPersons = meal.filter((g) => g.status === "yes").reduce((s, g) => s + normalizeGuestPartySize(g.partySize, g.groupType), 0);
    guestMealStats.textContent = `Repas: ${meal.length} invitations (${mealPersons} pers.) — ${mealConfirmedPersons} pers. confirmées`;
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
    if (guest.guestCategory === "child") node.classList.add("guest-item-child");
    node.querySelector(".main-text").textContent = guest.name;
    const attendanceType = normalizeGuestAttendanceType(guest.attendanceType);
    const groupMeta = node.querySelector(".guest-meta");
    if (groupMeta) {
      const catLabel = guest.guestCategory === "child" ? "👶 Enfant" : "Adulte";
      const submittedPart = guest.rsvpSubmittedAt > 0
        ? ` — RSVP le ${new Date(guest.rsvpSubmittedAt).toLocaleDateString("fr-FR")}`
        : "";
      groupMeta.textContent = `${catLabel} — ${getGuestAttendanceTypeLabel(attendanceType)}${submittedPart}`;
    }

    const categorySelect = node.querySelector("select.inline-category");
    if (categorySelect) {
      categorySelect.value = guest.guestCategory === "child" ? "child" : "adult";
      categorySelect.addEventListener("change", () => {
        guest.guestCategory = categorySelect.value;
        refresh();
      });
    }

    const hebergCheck = node.querySelector(".hebergement-check");
    if (hebergCheck) {
      hebergCheck.checked = Boolean(guest.hebergement);
      hebergCheck.addEventListener("change", () => {
        guest.hebergement = hebergCheck.checked;
        refresh();
      });
    }

    if (guest.isHost) {
      node.classList.add("guest-item-host");
      const hostBadge = document.createElement("span");
      hostBadge.className = "guest-host-badge";
      hostBadge.textContent = "💍 Marié(e)";
      node.querySelector(".guest-main")?.appendChild(hostBadge);
    }

    const statusSelect = node.querySelector("select.inline-status");
    if (guest.isHost) {
      statusSelect.replaceWith(Object.assign(document.createElement("span"), {
        className: "guest-host-status",
        textContent: "✓ Confirmé",
      }));
    } else {
      statusSelect.value = VALID_GUEST_STATUS.has(guest.status) ? guest.status : "pending";
      statusSelect.addEventListener("change", () => {
        guest.status = statusSelect.value;
        refresh();
      });
    }

    // Badge / sélecteur groupe couleur
    const groupBadgeWrap = node.querySelector(".guest-color-group-wrap");
    if (groupBadgeWrap && Array.isArray(state.guestGroups) && state.guestGroups.length > 0) {
      const sel = document.createElement("select");
      sel.className = "guest-color-group-select";
      sel.title = "Groupe couleur";
      const optNone = document.createElement("option");
      optNone.value = ""; optNone.textContent = "— Groupe —";
      sel.appendChild(optNone);
      for (const grp of state.guestGroups) {
        const opt = document.createElement("option");
        opt.value = grp.id; opt.textContent = grp.name;
        sel.appendChild(opt);
      }
      sel.value = guest.colorGroupId ?? "";
      const currentGroup = state.guestGroups.find(g => g.id === guest.colorGroupId);
      if (currentGroup) {
        sel.style.borderLeft = `4px solid ${currentGroup.color}`;
        sel.style.paddingLeft = "6px";
      }
      sel.addEventListener("change", () => {
        guest.colorGroupId = sel.value || null;
        const grp = state.guestGroups.find(g => g.id === sel.value);
        sel.style.borderLeft = grp ? `4px solid ${grp.color}` : "";
        sel.style.paddingLeft = grp ? "6px" : "";
        refresh();
      });
      groupBadgeWrap.appendChild(sel);
      groupBadgeWrap.classList.remove("is-hidden");
    }

    node.querySelector("button").addEventListener("click", () => {
      state.guests = state.guests.filter((entry) => entry.id !== guest.id);
      refresh();
    });

    const rsvpDetails = node.querySelector(".guest-rsvp-details");
    if (rsvpDetails) {
      const lines = [];
      if (guest.hebergementInfo) lines.push("📋 Souhaite des infos hébergement");
      if (guest.musicSuggestion) lines.push(`🎵 ${guest.musicSuggestion}`);
      if (guest.allergies) lines.push(`🥗 ${guest.allergies}`);
      if (guest.otherQuestion) lines.push(`❓ ${guest.otherQuestion}`);
      if (lines.length > 0) {
        rsvpDetails.innerHTML = lines.map(l => `<span class="guest-rsvp-detail">${l}</span>`).join("");
        rsvpDetails.classList.remove("is-hidden");
      }
    }

    guestList.appendChild(node);
  }
}

function renderMetrics() {
  const budgetTotal = state.budgetItems.reduce((sum, item) => sum + Number(item.amountTotal ?? item.amount ?? 0), 0);
  const budgetPaid = state.budgetItems.reduce((sum, item) => sum + Number(item.amountPaid ?? 0), 0);
  const unsettledItems = state.budgetItems.filter((item) => !item.solde && Number(item.amountTotal ?? 0) > 0);
  const budgetDue = unsettledItems.reduce((sum, item) => sum + Math.max(Number(item.amountTotal ?? 0) - Number(item.amountPaid ?? 0), 0), 0);
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

  const inviteGuests = state.guests.filter((g) => !g.isHost);
  const replied = inviteGuests
    .filter((guest) => guest.status !== "pending")
    .reduce((sum, guest) => sum + normalizeGuestPartySize(guest.partySize, guest.groupType), 0);
  const totalGuests = inviteGuests.reduce(
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
  if (metricBudgetPaid) {
    metricBudgetPaid.textContent = formatMoney(budgetPaid);
  }
  if (metricBudgetDue) {
    metricBudgetDue.textContent = formatMoney(budgetDue);
  }
  if (metricBudgetDueSub) {
    metricBudgetDueSub.textContent = unsettledItems.length > 0
      ? `${unsettledItems.length} prestataire${unsettledItems.length > 1 ? "s" : ""} non soldé${unsettledItems.length > 1 ? "s" : ""}`
      : "Tout est soldé ✓";
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
    guestGroups: [],
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
        // Versements partiels (optionnel)
        let payments = null;
        if (Array.isArray(item.payments) && item.payments.length > 0) {
          payments = item.payments
            .filter((p) => p && typeof p === "object")
            .map((p) => ({
              id:          typeof p.id === "string" && p.id ? p.id : createId(),
              label:       String(p.label ?? "Versement").trim(),
              amountTotal: Math.max(0, Number(p.amountTotal) || 0),
              amountPaid:  Math.max(0, Number(p.amountPaid)  || 0),
              dueDate:     typeof p.dueDate === "string" ? p.dueDate : "",
              solde:       Boolean(p.solde),
            }));
        }
        const amountTotal = payments
          ? payments.reduce((s, p) => s + p.amountTotal, 0)
          : Math.max(0, Number(item.amountTotal ?? item.amount ?? 0));
        const amountPaid = payments
          ? payments.reduce((s, p) => s + p.amountPaid, 0)
          : Math.max(0, Number(item.amountPaid ?? 0));
        const entry = {
          id:          typeof item.id === "string" && item.id ? item.id : createId(),
          label:       String(item.label ?? "").trim(),
          categoryId:  typeof item.categoryId === "string" && item.categoryId ? item.categoryId : null,
          amountTotal: Number.isFinite(amountTotal) ? amountTotal : 0,
          amountPaid:  Number.isFinite(amountPaid)  ? amountPaid  : 0,
          solde:       Boolean(item.solde),
          dueDate:     typeof item.dueDate === "string" ? item.dueDate : "",
          supplier:    normalizeSupplier(item.supplier),
        };
        if (payments) entry.payments = payments;
        return entry;
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
        priority: ["urgent", "normal", "faible"].includes(task.priority) ? task.priority : "normal",
      }))
      .filter((task) => task.text);
  }

  if (Array.isArray(input.guestGroups)) {
    normalized.guestGroups = input.guestGroups
      .filter((g) => g && typeof g === "object" && String(g.name ?? "").trim())
      .map((g) => ({
        id:    typeof g.id === "string" && g.id ? g.id : createId(),
        name:  String(g.name).trim(),
        color: typeof g.color === "string" && g.color.startsWith("#") ? g.color : "#888888",
      }));
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
          status: Boolean(guest.isHost) ? "yes" : (VALID_GUEST_STATUS.has(guest.status) ? guest.status : "pending"),
          isHost: Boolean(guest.isHost),
          rsvpToken: typeof guest.rsvpToken === "string" && guest.rsvpToken.trim() ? guest.rsvpToken.trim() : createGuestToken(),
          hebergement: Boolean(guest.hebergement),
          hebergementInfo: Boolean(guest.hebergementInfo),
          rsvpSubmittedAt: Number(guest.rsvpSubmittedAt) || 0,
          guestCategory: guest.guestCategory === "child" ? "child" : "adult",
          musicSuggestion: String(guest.musicSuggestion ?? "").trim(),
          allergies: String(guest.allergies ?? "").trim(),
          otherQuestion: String(guest.otherQuestion ?? "").trim(),
          colorGroupId: (typeof guest.colorGroupId === "string" && guest.colorGroupId && guest.colorGroupId !== "None") ? guest.colorGroupId : null,
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
    const response = await fetchWithTimeout(ADMIN_CHECK_ENDPOINT, {
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
    const response = await fetchWithTimeout(SERVER_ENDPOINT, {
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
  const response = await fetchWithTimeout(SERVER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 409) {
    setSyncStatus("⚠ Conflit : données modifiées par un autre onglet. Rechargez la page.", true);
    throw new Error("conflict");
  }

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
    _hasUnsavedChanges = false;
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

let _syncPollTimer = null;

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
    startOrgSyncPolling(token);
    return;
  }

  if (isServerMode) {
    setSyncStatus("Mode serveur sans synchronisation de fichier. Sauvegarde navigateur activée.", true);
    return;
  }

  setSyncStatus("Sauvegarde navigateur activée.", false);
}

function startOrgSyncPolling(token) {
  if (_syncPollTimer) clearInterval(_syncPollTimer);
  _syncPollTimer = setInterval(async () => {
    if (!isAdminUnlocked || persistInProgress) return;
    try {
      const res = await fetch(SERVER_ENDPOINT, { cache: "no-store", headers: { "X-Admin-Key": token } });
      if (!res.ok) return;
      const remote = normalizeState(await res.json());
      if (remote.updatedAt > state.updatedAt) {
        Object.assign(state, remote);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
        refresh({ persist: false });
        setSyncStatus("Mis à jour " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), false);
      }
    } catch { /* réseau indisponible */ }
  }, 60_000);
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

// ── Export CSV invités ───────────────────────────────────────────
function exportGuestsCSV() {
  const statusLabel = { pending: "En attente", yes: "Confirmé", no: "Décliné" };
  const rows = [["Nom", "Statut", "Catégorie", "Type", "Nb pers.", "Hébergement", "Allergies", "Suggestion musicale", "Question"]];
  for (const g of state.guests) {
    rows.push([
      g.name,
      statusLabel[g.status] ?? g.status,
      g.guestCategory === "child" ? "Enfant" : "Adulte",
      getGuestAttendanceTypeLabel(g.attendanceType),
      String(normalizeGuestPartySize(g.partySize, g.groupType)),
      g.hebergement ? "Oui" : "",
      g.allergies ?? "",
      g.musicSuggestion ?? "",
      g.otherQuestion ?? "",
    ]);
  }
  const bom = "﻿";
  const csv = bom + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `invites_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Avertissement modifications non sauvegardées ─────────────────
window.addEventListener("beforeunload", (e) => {
  if (_hasUnsavedChanges && isAdminUnlocked) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ── Dark mode ────────────────────────────────────────────────────
function initDarkMode() {
  const isDark = localStorage.getItem("dark-mode") === "true";
  if (isDark) document.body.classList.add("dark-mode");
  updateDarkModeBtnLabels();

  document.querySelectorAll(".dark-mode-toggle-btn").forEach(btn => {
    btn.addEventListener("click", toggleDarkMode);
  });
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("dark-mode", isDark);
  updateDarkModeBtnLabels();
}

function updateDarkModeBtnLabels() {
  const isDark = document.body.classList.contains("dark-mode");
  const label = isDark ? "☀️ Mode clair" : "🌙 Mode sombre";
  document.querySelectorAll(".dark-mode-toggle-btn").forEach(btn => {
    btn.textContent = label;
  });
}

// ── Fetch avec timeout ───────────────────────────────────────────
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// ── Sticky nav ───────────────────────────────────────────────────
function initStickyNav() {
  const stickyNav = document.getElementById("navSticky");
  if (!stickyNav) return;
  const hero = document.querySelector(".hero");
  if (!hero) return;

  const obs = new IntersectionObserver(([entry]) => {
    stickyNav.classList.toggle("is-visible", !entry.isIntersecting);
  }, { threshold: 0 });

  obs.observe(hero);
}

// ── Scroll reveal ────────────────────────────────────────────────
function initScrollReveal() {
  const els = document.querySelectorAll("[data-reveal]");
  if (!els.length) return;

  const obs = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-revealed");
        obs.unobserve(entry.target);
      }
    }
  }, { threshold: 0.06, rootMargin: "0px 0px -30px 0px" });

  els.forEach(el => obs.observe(el));
}

// ── Métriques cliquables ─────────────────────────────────────────
function bindMetricCardNavigation() {
  document.querySelectorAll(".metric-card[data-goto-tab]").forEach(card => {
    const tabId = card.dataset.gotoTab;
    card.addEventListener("click", () => setActiveAdminTab(tabId));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveAdminTab(tabId); }
    });
  });
}

// ── Drag & drop tâches ───────────────────────────────────────────
let _dragSrcTaskId = null;

function initTaskDragAndDrop() {
  if (!taskList) return;
  taskList.removeEventListener("dragstart", _onTaskDragStart);
  taskList.removeEventListener("dragend",   _onTaskDragEnd);
  taskList.removeEventListener("dragover",  _onTaskDragOver);
  taskList.removeEventListener("drop",      _onTaskDrop);
  taskList.addEventListener("dragstart", _onTaskDragStart);
  taskList.addEventListener("dragend",   _onTaskDragEnd);
  taskList.addEventListener("dragover",  _onTaskDragOver);
  taskList.addEventListener("drop",      _onTaskDrop);
}

function _onTaskDragStart(e) {
  const item = e.target.closest(".data-item[draggable]");
  if (!item) return;
  _dragSrcTaskId = item.dataset.taskId;
  item.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function _onTaskDragEnd(e) {
  const item = e.target.closest(".data-item");
  if (item) item.classList.remove("dragging");
  taskList.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  _dragSrcTaskId = null;
}

function _onTaskDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const item = e.target.closest(".data-item[draggable]");
  taskList.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  if (item && item.dataset.taskId !== _dragSrcTaskId) item.classList.add("drag-over");
}

function _onTaskDrop(e) {
  e.preventDefault();
  const item = e.target.closest(".data-item[draggable]");
  if (!item || !_dragSrcTaskId) return;
  const dropId = item.dataset.taskId;
  if (_dragSrcTaskId === dropId) return;

  const srcIdx  = state.tasks.findIndex(t => t.id === _dragSrcTaskId);
  const dropIdx = state.tasks.findIndex(t => t.id === dropId);
  if (srcIdx === -1 || dropIdx === -1) return;

  const newTasks = [...state.tasks];
  const [moved] = newTasks.splice(srcIdx, 1);
  newTasks.splice(dropIdx, 0, moved);
  state.tasks = newTasks;
  refresh();
}

// ── À payer prochainement ────────────────────────────────────────
function renderUpcomingPayments() {
  const panel = document.getElementById("upcomingPaymentsPanel");
  const list  = document.getElementById("upcomingPaymentsList");
  if (!panel || !list) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in60 = new Date(today);
  in60.setDate(in60.getDate() + 60);

  const upcoming = state.budgetItems
    .filter(item => !item.solde && item.dueDate)
    .map(item => {
      const due = new Date(item.dueDate + "T00:00:00");
      const diffDays = Math.round((due - today) / 86400000);
      const rest = Math.max(Number(item.amountTotal || 0) - Number(item.amountPaid || 0), 0);
      return { ...item, due, diffDays, rest };
    })
    .filter(item => item.due <= in60)
    .sort((a, b) => a.due - b.due);

  if (upcoming.length === 0) {
    panel.classList.add("is-hidden");
    return;
  }

  panel.classList.remove("is-hidden");
  list.innerHTML = "";
  for (const item of upcoming) {
    const isOverdue = item.diffDays < 0;
    const formatted = item.due.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const label = isOverdue
      ? `En retard (${Math.abs(item.diffDays)}j)`
      : item.diffDays === 0
        ? "Aujourd'hui"
        : `Dans ${item.diffDays}j — ${formatted}`;

    const row = document.createElement("div");
    row.className = "upcoming-payment-item";
    row.innerHTML = `
      <span class="upcoming-payment-name">${item.label}</span>
      <span class="upcoming-payment-date${isOverdue ? " is-overdue" : ""}">${label}</span>
      <span class="upcoming-payment-amount">${formatMoney(item.rest)}</span>`;
    list.appendChild(row);
  }
}

// ── Graphique évolution RSVP ─────────────────────────────────────
function renderRsvpChart() {
  const canvas = document.getElementById("rsvpChartCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.offsetWidth || 300;
  const h = 130;
  const pr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * pr);
  canvas.height = Math.round(h * pr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(pr, 0, 0, pr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const answered = state.guests
    .filter(g => g.rsvpSubmittedAt > 0)
    .map(g => ({ date: new Date(g.rsvpSubmittedAt), status: g.status }))
    .sort((a, b) => a.date - b.date);

  const isDark = document.body.classList.contains("dark-mode");
  const emptyColor = isDark ? "rgba(240, 160, 168, 0.5)" : "rgba(240, 63, 89, 0.18)";
  const textColor  = isDark ? "rgba(240, 200, 200, 0.7)" : "rgba(90, 40, 55, 0.7)";

  if (answered.length === 0) {
    ctx.fillStyle = textColor;
    ctx.font = "12px Manrope, sans-serif";
    ctx.fillText("Aucun RSVP reçu pour le moment", 16, h / 2 + 4);
    return;
  }

  const monthMap = new Map();
  for (const { date, status } of answered) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(key)) monthMap.set(key, { yes: 0, no: 0 });
    monthMap.get(key)[status === "yes" ? "yes" : "no"]++;
  }

  const labels  = [...monthMap.keys()].sort();
  const yesData = labels.map(k => monthMap.get(k).yes);
  const noData  = labels.map(k => monthMap.get(k).no);
  const maxVal  = Math.max(...labels.map((_, i) => yesData[i] + noData[i]), 1);

  const padL = 28, padR = 8, padT = 10, padB = 22;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const barSpacing = chartW / labels.length;
  const barW = Math.min(26, barSpacing * 0.55);

  for (let i = 0; i < labels.length; i++) {
    const x = padL + i * barSpacing + barSpacing / 2;
    const yH = (yesData[i] / maxVal) * chartH;
    ctx.fillStyle = isDark ? "rgba(111, 207, 151, 0.75)" : "rgba(26, 122, 58, 0.72)";
    ctx.beginPath();
    ctx.roundRect(x - barW / 2, padT + chartH - yH, barW, yH, [3, 3, 0, 0]);
    ctx.fill();

    if (noData[i] > 0) {
      const nH = (noData[i] / maxVal) * chartH;
      ctx.fillStyle = isDark ? "rgba(240, 100, 120, 0.55)" : "rgba(224, 10, 38, 0.5)";
      ctx.beginPath();
      ctx.roundRect(x - barW / 2, padT + chartH - yH - nH, barW, nH, [3, 3, 0, 0]);
      ctx.fill();
    }

    ctx.fillStyle = textColor;
    ctx.font = "9px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(labels[i].slice(5), x, h - padB + 12);
  }

  ctx.strokeStyle = isDark ? "rgba(200, 80, 100, 0.22)" : "rgba(240, 63, 89, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + chartH);
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = "9px Manrope, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(String(maxVal), padL - 3, padT + 8);
}

// ── Graphique budget par catégorie ───────────────────────────────
function renderBudgetBarChart() {
  const canvas = document.getElementById("budgetBarCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.offsetWidth || 300;
  const h = 130;
  const pr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * pr);
  canvas.height = Math.round(h * pr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(pr, 0, 0, pr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const isDark = document.body.classList.contains("dark-mode");
  const textColor = isDark ? "rgba(240, 200, 200, 0.7)" : "rgba(90, 40, 55, 0.7)";

  const categories = Array.isArray(state.budgetCategories) ? state.budgetCategories : [];
  const catTotals = new Map();
  const catPaid   = new Map();
  for (const item of state.budgetItems) {
    const cat = categories.find(c => c.id === item.categoryId);
    const label = cat ? cat.name : "Autres";
    catTotals.set(label, (catTotals.get(label) || 0) + Number(item.amountTotal || 0));
    catPaid.set(label,   (catPaid.get(label)   || 0) + Number(item.amountPaid  || 0));
  }

  if (catTotals.size === 0) {
    ctx.fillStyle = textColor;
    ctx.font = "12px Manrope, sans-serif";
    ctx.fillText("Aucune dépense enregistrée", 16, h / 2 + 4);
    return;
  }

  const labels  = [...catTotals.keys()];
  const totals  = labels.map(k => catTotals.get(k));
  const paids   = labels.map(k => catPaid.get(k) || 0);
  const maxVal  = Math.max(...totals, 1);

  const padL = 8, padR = 8, padT = 8, padB = 34;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const groupW = chartW / labels.length;
  const barW   = Math.min(12, groupW * 0.32);

  for (let i = 0; i < labels.length; i++) {
    const x = padL + i * groupW + groupW / 2;

    const tH = (totals[i] / maxVal) * chartH;
    ctx.fillStyle = isDark ? "rgba(224, 10, 38, 0.28)" : "rgba(224, 10, 38, 0.2)";
    ctx.beginPath();
    ctx.roundRect(x - barW - 1, padT + chartH - tH, barW, tH, [3, 3, 0, 0]);
    ctx.fill();

    const pH = (paids[i] / maxVal) * chartH;
    if (pH > 0) {
      ctx.fillStyle = isDark ? "rgba(111, 207, 151, 0.72)" : "rgba(26, 122, 58, 0.68)";
      ctx.beginPath();
      ctx.roundRect(x + 1, padT + chartH - pH, barW, pH, [3, 3, 0, 0]);
      ctx.fill();
    }

    ctx.fillStyle = textColor;
    ctx.font = "8px Manrope, sans-serif";
    ctx.textAlign = "center";
    const lbl = labels[i].length > 8 ? labels[i].slice(0, 7) + "…" : labels[i];
    ctx.fillText(lbl, x, h - padB + 14);
    ctx.fillText((totals[i] / 1000).toFixed(1) + "k", x, h - padB + 24);
  }

  ctx.strokeStyle = isDark ? "rgba(200, 80, 100, 0.15)" : "rgba(240, 63, 89, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT + chartH);
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.stroke();
}

void init();
