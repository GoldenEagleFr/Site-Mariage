const STORAGE_KEY = "plan_mariage_data_v1";
const SERVER_ENDPOINT = "/api/data";
const ADMIN_CHECK_ENDPOINT = "/api/admin/check";
const ADMIN_SESSION_KEY = "plan_mariage_admin_token";
const WEDDING_DATE_ISO = "2027-05-16T14:30:00+02:00";

const DEFAULT_STATE = {
  budgetGoal: 15000,
  budgetItems: [],
  tasks: [],
  guests: [],
  updatedAt: 0,
};

const VALID_GUEST_STATUS = new Set(["pending", "yes", "no"]);

const isServerMode = window.location.protocol === "http:" || window.location.protocol === "https:";
let serverSyncAvailable = false;
let adminToken = "";
let isAdminUnlocked = false;
let adminInterfaceEnabled = false;
let persistInProgress = false;
let persistQueued = false;

const state = createDefaultState();

const budgetForm = document.getElementById("budgetForm");
const budgetGoalForm = document.getElementById("budgetGoalForm");
const budgetGoalInput = document.getElementById("budgetGoal");
const budgetLabel = document.getElementById("budgetLabel");
const budgetAmount = document.getElementById("budgetAmount");
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
const guestStatus = document.getElementById("guestStatus");
const guestList = document.getElementById("guestList");
const guestSearch = document.getElementById("guestSearch");
const guestFilter = document.getElementById("guestFilter");
const guestStats = document.getElementById("guestStats");

const metricBudgetTotal = document.getElementById("metricBudgetTotal");
const metricBudgetLeft = document.getElementById("metricBudgetLeft");
const metricTasks = document.getElementById("metricTasks");
const metricRsvp = document.getElementById("metricRsvp");
const syncStatus = document.getElementById("syncStatus");

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
const privateZone = document.getElementById("organisation");
const countdownDays = document.getElementById("countdownDays");
const countdownHours = document.getElementById("countdownHours");
const countdownMinutes = document.getElementById("countdownMinutes");
const countdownSeconds = document.getElementById("countdownSeconds");
const countdownNote = document.getElementById("countdownNote");

let countdownTimerId = 0;

bindPlannerEvents();
bindAdminEvents();
initCountdown();

function bindPlannerEvents() {
  if (budgetForm) {
    budgetForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!isAdminUnlocked) {
        return;
      }

      const label = budgetLabel.value.trim();
      const amount = Number(budgetAmount.value);
      if (!label || Number.isNaN(amount) || amount < 0) {
        return;
      }

      state.budgetItems.push({
        id: createId(),
        label,
        amount,
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
      const status = guestStatus.value;
      if (!name) {
        return;
      }

      state.guests.push({
        id: createId(),
        name,
        status: VALID_GUEST_STATUS.has(status) ? status : "pending",
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
          } else if (check.reason === "server_unreachable") {
            setAdminError("Serveur indisponible. Lancez server.py puis réessayez.");
          } else {
            setAdminError("Accès refusé. Mot de passe invalide.");
          }
          return;
        }

        sessionStorage.setItem(ADMIN_SESSION_KEY, token);
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
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      adminInterfaceEnabled = false;
      lockAdmin({ message: "Session fermée." });
    });
  }

  if (adminNavLink) {
    adminNavLink.addEventListener("click", (event) => {
      event.preventDefault();
      openAdminInterface();
    });
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

  renderBudget();
  renderTasks();
  renderGuests();
  renderMetrics();

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

  budgetList.innerHTML = "";
  for (const [index, item] of state.budgetItems.entries()) {
    const node = budgetTemplate.content.firstElementChild.cloneNode(true);
    node.style.setProperty("--stagger", String(index));
    node.querySelector(".main-text").textContent = item.label;
    node.querySelector(".money").textContent = formatMoney(item.amount);
    node.querySelector("button").addEventListener("click", () => {
      state.budgetItems = state.budgetItems.filter((entry) => entry.id !== item.id);
      refresh();
    });
    budgetList.appendChild(node);
  }
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
  const statusRank = { pending: 0, yes: 1, no: 2 };
  const orderedGuests = [...state.guests].sort((a, b) => {
    const rankDiff = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  });

  const filteredGuests = orderedGuests.filter((guest) => {
    if (mode !== "all" && guest.status !== mode) {
      return false;
    }
    if (search && !toSearchKey(guest.name).includes(search)) {
      return false;
    }
    return true;
  });

  if (guestStats) {
    const pending = state.guests.filter((guest) => guest.status === "pending").length;
    guestStats.textContent = `${filteredGuests.length}/${state.guests.length} invités affichés - ${pending} en attente`;
  }

  if (filteredGuests.length === 0) {
    const emptyNode = document.createElement("li");
    emptyNode.className = "list-empty";
    emptyNode.textContent = state.guests.length ? "Aucun invité pour ce filtre." : "Aucun invité pour le moment.";
    guestList.appendChild(emptyNode);
    return;
  }

  for (const [index, guest] of filteredGuests.entries()) {
    const node = guestTemplate.content.firstElementChild.cloneNode(true);
    node.style.setProperty("--stagger", String(index));
    node.querySelector(".main-text").textContent = guest.name;

    const statusSelect = node.querySelector("select");
    statusSelect.value = guest.status;
    statusSelect.addEventListener("change", () => {
      guest.status = statusSelect.value;
      refresh();
    });

    node.querySelector("button").addEventListener("click", () => {
      state.guests = state.guests.filter((entry) => entry.id !== guest.id);
      refresh();
    });

    guestList.appendChild(node);
  }
}

function renderMetrics() {
  const budgetTotal = state.budgetItems.reduce((sum, item) => sum + item.amount, 0);
  const budgetGoal = state.budgetGoal || 0;
  const budgetLeft = Math.max(budgetGoal - budgetTotal, 0);

  const taskDone = state.tasks.filter((task) => task.done).length;
  const tasksPercent = state.tasks.length ? Math.round((taskDone / state.tasks.length) * 100) : 0;

  const replied = state.guests.filter((guest) => guest.status !== "pending").length;
  const rsvpPercent = state.guests.length ? Math.round((replied / state.guests.length) * 100) : 0;

  if (metricBudgetTotal) {
    metricBudgetTotal.textContent = formatMoney(budgetTotal);
  }
  if (metricBudgetLeft) {
    metricBudgetLeft.textContent = formatMoney(budgetLeft);
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
  if (guestStats) {
    guestStats.textContent = "0 invité";
  }
  if (metricBudgetTotal) {
    metricBudgetTotal.textContent = "0 EUR";
  }
  if (metricBudgetLeft) {
    metricBudgetLeft.textContent = "0 EUR";
  }
  if (metricTasks) {
    metricTasks.textContent = "0%";
  }
  if (metricRsvp) {
    metricRsvp.textContent = "0%";
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
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

function createDefaultState() {
  return {
    budgetGoal: DEFAULT_STATE.budgetGoal,
    budgetItems: [],
    tasks: [],
    guests: [],
    updatedAt: DEFAULT_STATE.updatedAt,
  };
}

function normalizeState(candidate) {
  const input = candidate && typeof candidate === "object" ? candidate : {};

  const budgetGoal = Number(input.budgetGoal);
  const normalized = createDefaultState();
  normalized.budgetGoal = Number.isFinite(budgetGoal) && budgetGoal >= 0 ? budgetGoal : DEFAULT_STATE.budgetGoal;
  const updatedAt = Number(input.updatedAt);
  normalized.updatedAt = Number.isFinite(updatedAt) && updatedAt >= 0 ? updatedAt : DEFAULT_STATE.updatedAt;

  if (Array.isArray(input.budgetItems)) {
    normalized.budgetItems = input.budgetItems
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : createId(),
        label: String(item.label ?? "").trim(),
        amount: Number(item.amount),
      }))
      .filter((item) => item.label && Number.isFinite(item.amount) && item.amount >= 0);
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
      .map((guest) => ({
        id: typeof guest.id === "string" && guest.id ? guest.id : createId(),
        name: String(guest.name ?? "").trim(),
        status: VALID_GUEST_STATUS.has(guest.status) ? guest.status : "pending",
      }))
      .filter((guest) => guest.name);
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
    throw new Error(`HTTP ${response.status}`);
  }
}

async function persistState() {
  if (!isAdminUnlocked) {
    return;
  }

  const payload = normalizeState(state);
  payload.updatedAt = Date.now();
  state.updatedAt = payload.updatedAt;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

  if (!isServerMode || !adminToken) {
    return;
  }

  try {
    await pushStateToServer(payload);
    serverSyncAvailable = true;
    setSyncStatus("Sauvegarde du fichier activée : data.json", false);
  } catch (error) {
    serverSyncAvailable = false;
    setSyncStatus("Erreur de synchronisation du fichier. Sauvegarde navigateur activée.", true);
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
    setSyncStatus("Sauvegarde du fichier activée : data.json", false);
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
  const savedToken = sessionStorage.getItem(ADMIN_SESSION_KEY);
  adminInterfaceEnabled = Boolean(savedToken);

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
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    adminInterfaceEnabled = false;
    lockAdmin({ message: "" });

    if (check.reason === "server_unreachable") {
      setAdminError("Serveur indisponible. Lancez server.py puis reconnectez-vous.");
      return;
    }

    setAdminError("Session admin expirée. Reconnectez-vous.");
    return;
  }

  await unlockAdmin(savedToken);
}

void init();
