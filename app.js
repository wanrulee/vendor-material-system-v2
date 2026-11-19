const SUPABASE_URL = "https://ajfqpiirhsrqcsjbrjln.supabase.co";
const SUPABASE_KEY = "sb_publishable_PaiEugSpjLMXk-QfWTCbmA_-RXVNfPv";
const USE_CLOUD = true;
const LOCAL_STORAGE_KEY = "vendor-material-system-v2-production-v1";
const LOCAL_SEED_DONE_KEY = "vendor-material-system-v2-production-seeded-v1";

const db = USE_CLOUD ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
let state = { items: [], suppliers: [], profile: null, user: null };
let activeView = "dashboard";
let editingItemId = null;
let pendingImportRows = [];
let itemDisplayMode = "simple";
let selectedItemId = null;
let comparisonDetailItemId = null;
let shentaiParsedRows = [];
let shentaiComparisonRows = [];
let shentaiChangeFilter = "all";
let shentaiPdfIsOlder = false;
let duplicateGroups = [];
let keyboardCursorElement = null;
let keyboardEditMode = false;
let searchAllSuppliers = false;
let activeSupplierGroup = "";
let documentRows = [
  {
    name: "電纜槽用 梯型 蓋板夾鉤 鋁合金 表面塗裝漆110μ↑",
    spec: "600mmW x 150mmH，附不鏽鋼SUS316螺栓連帽（台化材料編號：WIGFRV28）",
    quantity: "10",
    unit: "PC",
    unitPrice: "",
    remark: "",
  },
  {
    name: "電纜槽用 直式分隔板 鋁合金 表面塗裝漆50μ↑",
    spec: "100mmH x 3.2mmt x 3000mmL，附不鏽鋼螺栓連帽（台化材料編號：WIGFR887）",
    quantity: "1",
    unit: "PC",
    unitPrice: "",
    remark: "",
  },
  {
    name: "電纜槽用 雙片式內側固定片（附矽膠墊）鋁合金（須陽極處理）",
    spec: "表面塗裝漆50μ↑ 4mmt，附SUS316不鏽鋼螺栓連帽（台化材料編號：WIGFSL10）",
    quantity: "10",
    unit: "PC",
    unitPrice: "",
    remark: "",
  },
  {
    name: "電纜槽用 連接片組件鋁合金 表面塗裝漆50μ↑",
    spec: "150mmH x 4mmt，附SUS316不鏽鋼螺栓連帽（台化材料編號：WIGFRQ09）",
    quantity: "10",
    unit: "PC",
    unitPrice: "",
    remark: "",
  },
];
const ENABLE_ERP_CURSOR = false;

const SUPPLIER_GROUPS = {
  "電纜線廠商": ["伸泰國際", "阿同", "裕泰", "興中"],
};

const $ = (id) => document.getElementById(id);
const today = new Date().toISOString().slice(0, 10);
const money = (value) => Number(value || 0).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isAdmin = () => !USE_CLOUD || state.profile?.role === "admin";

function init() {
  bindEvents();
  if (!USE_CLOUD) {
    startLocalApp();
    return;
  }
  db.auth.getSession().then(({ data }) => {
    if (data.session) startApp(data.session.user);
    else showLogin();
  });
}

function bindEvents() {
  $("loginForm").addEventListener("submit", login);
  $("logoutBtn").addEventListener("click", logout);
  $("refreshBtn").addEventListener("click", loadCloudData);
  $("newItemBtn").addEventListener("click", () => openItemDialog());
  $("dashboardNewItemBtn").addEventListener("click", () => openItemDialog());
  $("saveItemBtn").addEventListener("click", saveItemFromDialog);
  $("deleteItemBtn").addEventListener("click", deleteEditingItem);
  $("editSupplier").addEventListener("change", () => {
    toggleCustomSupplierField();
    setCategoryField("");
    setProductField("");
  });
  $("editCategory").addEventListener("change", () => {
    toggleCustomCategoryField();
    setProductField("");
  });
  $("editProduct").addEventListener("change", syncProductNameFromSelect);
  $("itemSearch").addEventListener("input", renderItems);
  $("globalSearchBtn").addEventListener("click", () => {
    searchAllSuppliers = !searchAllSuppliers;
    selectedItemId = null;
    renderItems();
  });
  $("supplierFilter").addEventListener("change", () => {
    $("categoryFilter").value = "";
    $("productFilter").value = "";
    renderCategoryFilter();
    renderProductFilter();
    renderItems();
  });
  $("categoryFilter").addEventListener("change", () => {
    $("productFilter").value = "";
    renderProductFilter();
    renderItems();
  });
  $("productFilter").addEventListener("change", renderItems);
  $("statusFilter").addEventListener("change", renderItems);
  document.querySelectorAll("[data-display-mode]").forEach((btn) => btn.addEventListener("click", () => {
    itemDisplayMode = btn.dataset.displayMode;
    renderItems();
  }));
  $("saveSupplierBtn").addEventListener("click", saveSupplier);
  $("downloadCsvBtn").addEventListener("click", exportCsv);
  $("seedDataBtn").addEventListener("click", seedInitialData);
  $("excelImportBtn").addEventListener("click", () => $("excelImportInput").click());
  $("excelImportInput").addEventListener("change", previewExcelImport);
  $("shentaiPdfBtn")?.addEventListener("click", () => $("shentaiPdfInput").click());
  $("shentaiPdfInput")?.addEventListener("change", previewShentaiPdf);
  $("shentaiCompareBtn")?.addEventListener("click", buildShentaiComparison);
  document.querySelectorAll("[data-shentai-change]").forEach((button) => button.addEventListener("click", () => {
    shentaiChangeFilter = button.dataset.shentaiChange;
    renderShentaiComparison();
  }));
  $("confirmExcelImportBtn").addEventListener("click", confirmExcelImport);
  $("checkDuplicateBtn").addEventListener("click", checkDuplicateMaterials);
  $("cleanDuplicateBtn").addEventListener("click", cleanDuplicateMaterials);
  $("clearLocalDataBtn")?.addEventListener("click", clearLocalData);
  $("addDocumentRowBtn")?.addEventListener("click", addDocumentRow);
  $("printDocumentBtn")?.addEventListener("click", () => window.print());
  $("saveDocumentSupplierBtn")?.addEventListener("click", saveDocumentSupplier);
  $("documentsView")?.addEventListener("input", handleDocumentInput);
  $("documentsView")?.addEventListener("change", handleDocumentInput);
  $("documentItemEditor")?.addEventListener("click", handleDocumentRowAction);
  $("duplicateSupplierFilter").addEventListener("change", checkDuplicateMaterials);
  if (ENABLE_ERP_CURSOR) {
    document.addEventListener("keydown", handleKeyboardNavigation);
    document.addEventListener("mousedown", (event) => {
      const target = event.target.closest?.(keyboardTargetSelector());
      if (target) setKeyboardCursor(target);
    });
    window.addEventListener("focus", () => {
      if (state.user && isPageRootFocused()) focusViewStart(activeView);
    });
    window.addEventListener("pageshow", () => {
      if (state.user) focusViewStart(activeView);
    });
  }
  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => openViewFromNavigation(btn.dataset.view)));
  document.querySelectorAll("[data-view-link]").forEach((btn) => btn.addEventListener("click", () => openViewFromNavigation(btn.dataset.viewLink)));
}

async function login(event) {
  event.preventDefault();
  if (!USE_CLOUD) {
    startLocalApp();
    return;
  }
  $("loginMessage").textContent = "登入中...";
  const { data, error } = await db.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginPassword").value,
  });
  if (error) {
    $("loginMessage").textContent = `登入失敗：${error.message}`;
    return;
  }
  await startApp(data.user);
}

async function logout() {
  if (!USE_CLOUD) return;
  await db.auth.signOut();
  state = { items: [], suppliers: [], profile: null, user: null };
  showLogin();
}

function showLogin() {
  $("loginView").classList.remove("hidden");
  $("appShell").classList.add("hidden");
  window.requestAnimationFrame(() => $("loginEmail")?.focus());
}

async function startApp(user) {
  state.user = user;
  $("loginView").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("logoutBtn").style.display = "";
  $("userEmail").textContent = user.email || "";
  await loadProfile();
  await loadCloudData();
  if (ENABLE_ERP_CURSOR) focusViewStart(activeView);
}

function startLocalApp() {
  state.user = { id: "local-admin", email: "正式整理版" };
  state.profile = { role: "admin" };
  $("loginView").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("logoutBtn").style.display = "none";
  $("userEmail").textContent = "正式整理版";
  $("userRole").textContent = "管理者";
  loadCloudData();
}

async function loadProfile() {
  if (!USE_CLOUD) {
    state.profile = { role: "admin" };
    $("userRole").textContent = "管理者";
    return;
  }
  const { data, error } = await db.from("profiles").select("*").eq("id", state.user.id).single();
  if (error) throwError(error);
  state.profile = data;
  $("userRole").textContent = data.role === "admin" ? "管理者" : "一般使用者";
}

async function loadCloudData() {
  if (!USE_CLOUD) {
    const localData = loadLocalData();
    state.items = localData.items.map(normalizeLocalItem).filter((item) => !shouldExcludeMaterial(item)).sort(compareImportedOrder);
    state.suppliers = localData.suppliers.map(normalizeLocalSupplier);
    refreshAll();
    return;
  }
  const [materialsData, suppliersData] = await Promise.all([
    fetchAllDbRows("materials", ["supplier_name", "category", "product", "item_code"]),
    fetchAllDbRows("suppliers", ["name"]),
  ]);
  state.items = materialsData.map(fromDbMaterial).sort(compareImportedOrder);
  state.suppliers = suppliersData.map(fromDbSupplier);
  refreshAll();
}

async function fetchAllDbRows(tableName, orderColumns = [], pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = db.from(tableName).select("*");
    orderColumns.forEach((column) => {
      query = query.order(column);
    });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      throwError(error);
      return rows;
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

function loadLocalData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "{}");
    if ((!Array.isArray(parsed.items) || parsed.items.length === 0) && !localStorage.getItem(LOCAL_SEED_DONE_KEY) && window.INITIAL_LOCAL_DATA?.items?.length) {
      localStorage.setItem(LOCAL_SEED_DONE_KEY, "1");
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(window.INITIAL_LOCAL_DATA));
      return {
      items: (window.INITIAL_LOCAL_DATA.items || []).filter((item) => !shouldExcludeMaterial(item)),
        suppliers: window.INITIAL_LOCAL_DATA.suppliers || [],
      };
    }
    return {
      items: Array.isArray(parsed.items) ? parsed.items.filter((item) => !shouldExcludeMaterial(item)) : [],
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
    };
  } catch (error) {
    console.warn(error);
    return { items: [], suppliers: [] };
  }
}

function saveLocalData() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
    items: state.items,
    suppliers: state.suppliers,
  }));
}

function makeLocalId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeLocalItem(item) {
  return {
    id: item.id || makeLocalId("mat"),
    itemCode: item.itemCode || "",
    supplier: item.supplier || "",
    category: item.category || "",
    product: item.product || "",
    materialCode: item.materialCode || "",
    spec: item.spec || "",
    unit: item.unit || "",
    latestPrice: item.latestPrice ?? "",
    highestPrice: item.highestPrice ?? "",
    highestPriceDate: item.highestPriceDate || "",
    priceStatus: item.priceStatus || (item.latestPrice === "" || item.latestPrice == null ? "待詢價" : "可採購"),
    sourceDate: item.sourceDate || "",
    note: item.note || "",
    tpcName: item.tpcName || item.tpcMaterialName || item["台塑材料名稱"] || "",
    originalName: item.originalName || item["原始品名"] || "",
    sourceFile: item.sourceFile || item["來源檔案"] || "",
    stock: item.stock ?? 0,
    location: item.location || "",
    sortOrder: item.sortOrder ?? "",
  };
}

function shouldExcludeMaterial(item) {
  return item?.supplier === "機智" && item?.category === "歷史資料(111之前)";
}

function normalizeLocalSupplier(supplier) {
  return {
    id: supplier.id || makeLocalId("sup"),
    name: supplier.name || "",
    contact: supplier.contact || "",
    phone: supplier.phone || "",
    fax: supplier.fax || "",
    email: supplier.email || "",
    address: supplier.address || "",
    terms: supplier.terms || "",
    leadTime: supplier.leadTime || "",
    note: supplier.note || "",
  };
}

function compareImportedOrder(a, b) {
  return compareText(a.supplier, b.supplier)
    || compareText(a.category, b.category)
    || compareText(a.product, b.product)
    || compareText(a.spec, b.spec)
    || compareText(a.materialCode, b.materialCode)
    || compareItemCode(a.itemCode, b.itemCode);
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "zh-Hant", { numeric: true, sensitivity: "base" });
}

function compareItemCode(a, b) {
  const left = itemCodeParts(a);
  const right = itemCodeParts(b);
  if (left.hasCode !== right.hasCode) return left.hasCode ? -1 : 1;
  return compareText(left.prefix, right.prefix) || left.number - right.number || compareText(a, b);
}

function compareSortOrder(a, b) {
  const left = Number.isFinite(Number(a)) ? Number(a) : Number.MAX_SAFE_INTEGER;
  const right = Number.isFinite(Number(b)) ? Number(b) : Number.MAX_SAFE_INTEGER;
  return left - right;
}

function itemCodeParts(value) {
  const text = String(value || "");
  const match = text.match(/^(.+?)-(\d+)$/);
  return {
    hasCode: Boolean(match),
    prefix: match ? match[1] : text,
    number: match ? Number(match[2]) : Number.MAX_SAFE_INTEGER,
  };
}

function switchView(view) {
  activeView = view;
  const titleMap = { dashboard: "總覽", items: "材料主檔", suppliers: "廠商資料", documents: "單據製作", settings: "資料工具", help: "使用說明" };
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $(`${view}View`).classList.add("active");
  $("viewTitle").textContent = titleMap[view];
  renderForView(view);
  if (ENABLE_ERP_CURSOR) focusViewStart(view);
}

function openViewFromNavigation(view) {
  if (view === "items") resetMaterialFilters();
  switchView(view);
}

function resetMaterialFilters() {
  selectedItemId = null;
  searchAllSuppliers = false;
  activeSupplierGroup = "";
  $("supplierFilter").value = "";
  $("categoryFilter").value = "";
  $("productFilter").value = "";
  $("itemSearch").value = "";
  $("statusFilter").value = "";
  renderCategoryFilter();
  renderProductFilter();
}

function renderForView(view) {
  if (view === "items") renderItems();
  if (view === "suppliers") renderSuppliers();
  if (view === "documents") renderDocumentMaker();
  if (view === "settings") {
    updateImportSteps("upload");
    renderDuplicateSupplierFilter();
  }
}

const DOCUMENT_TYPES = {
  inquiry: { title: "詢價單", party: "詢價廠商" },
  purchase: { title: "訂貨單", party: "訂貨廠商" },
};

function renderDocumentMaker() {
  renderDocumentRows();
  renderDocumentPreview();
}

function addDocumentRow() {
  documentRows.push({ name: "", spec: "", quantity: "", unit: "個", unitPrice: "", remark: "" });
  renderDocumentRows();
  renderDocumentPreview();
}

function handleDocumentRowAction(event) {
  const button = event.target.closest("[data-remove-document-row]");
  if (!button) return;
  documentRows.splice(Number(button.dataset.removeDocumentRow), 1);
  if (!documentRows.length) documentRows.push({ name: "", spec: "", quantity: "", unit: "個", unitPrice: "", remark: "" });
  renderDocumentRows();
  renderDocumentPreview();
}

function handleDocumentInput(event) {
  const rowInput = event.target.closest("[data-document-row]");
  if (rowInput) {
    const row = documentRows[Number(rowInput.dataset.documentRow)];
    if (row) row[rowInput.dataset.field] = rowInput.value;
  }
  if (event.target.id === "documentType") updateDocumentTypeDefaults();
  renderDocumentPreview();
}

function updateDocumentTypeDefaults() {
  const config = DOCUMENT_TYPES[$("documentType").value];
  $("documentPartyLabel").firstChild.nodeValue = config.party;
  renderDocumentRows();
}

function renderDocumentRows() {
  $("documentItemEditor").innerHTML = `
    <div class="document-item-row document-item-row-head">
      <span>材料名稱</span><span>規格</span><span>數量</span><span>單位</span><span>單價</span><span>備註</span><span></span>
    </div>
    ${documentRows.map((row, index) => `
      <div class="document-item-row with-price">
        <input data-document-row="${index}" data-field="name" value="${esc(row.name)}" placeholder="材料名稱">
        <input data-document-row="${index}" data-field="spec" value="${esc(row.spec)}" placeholder="規格">
        <input data-document-row="${index}" data-field="quantity" type="number" min="0" step="0.01" value="${esc(row.quantity)}" placeholder="可留白">
        <input data-document-row="${index}" data-field="unit" value="${esc(row.unit)}">
        <input data-document-row="${index}" data-field="unitPrice" type="number" min="0" step="0.01" value="${esc(row.unitPrice)}" placeholder="詢價時留白">
        <input data-document-row="${index}" data-field="remark" value="${esc(row.remark || "")}" placeholder="備註">
        <button class="icon-btn" type="button" data-remove-document-row="${index}" title="刪除此列">×</button>
      </div>`).join("")}`;
}

function documentField(id) {
  return $(id)?.value?.trim() || "";
}

function renderDocumentPreview() {
  const config = DOCUMENT_TYPES[documentField("documentType")] || DOCUMENT_TYPES.inquiry;
  $("documentPartyLabel").firstChild.nodeValue = config.party;
  const companyInfo = Object.fromEntries(documentField("documentCompanyInfo").split("｜").map((line) => {
    const splitAt = line.indexOf("：");
    return splitAt < 0 ? [line.trim(), ""] : [line.slice(0, splitAt).trim(), line.slice(splitAt + 1).trim()];
  }));
  $("documentPaper").innerHTML = `
    <header class="document-paper-head">
      <h1>${esc(documentField("documentCompany") || "公司名稱")}</h1>
      <div class="document-company-lines">
        <div><span>統一編號：${esc(companyInfo["統一編號"] || "")}</span><span>送貨住址：${esc(companyInfo["送貨住址"] || "")}</span><span>電子郵件：${esc(companyInfo["電子郵件"] || "")}</span></div>
        <div><span>行動電話：${esc(companyInfo["行動電話"] || "")}</span><span>公司TEL：${esc(companyInfo["公司TEL"] || "")}</span></div>
      </div>
      <h2>${config.title}</h2>
    </header>
    <section class="document-meta">
      <div class="document-to-line"><span>TO：</span><strong>${esc(documentField("documentParty") || "")}</strong></div>
      <div class="document-phone-line"><span>TEL：</span><strong>${esc(documentField("documentPartyPhone") || "")}</strong></div>
      <div class="document-fax-line"><span>FAX：</span><strong>${esc(documentField("documentPartyFax") || "")}</strong></div>
      <div class="document-contact-line"><span>聯絡人：</span><strong>${esc(documentField("documentContact") || "")}</strong></div>
    </section>
    <table class="document-paper-table">
      <thead><tr><th>項次</th><th>品名規格</th><th>數量</th><th>單位</th><th>單價</th><th>備註</th></tr></thead>
      <tbody>${documentRows.map((row, index) => `
        <tr><td>${index + 1}</td><td><strong>${esc(row.name || "")}</strong>${row.spec ? `<br>${esc(row.spec)}` : ""}</td><td>${esc(row.quantity || "")}</td><td>${esc(row.unit || "")}</td>
        <td class="number">${documentMoney(row.unitPrice)}</td><td>${esc(row.remark || "")}</td></tr>`).join("")}
      </tbody>
    </table>
    `;
}

function formatDocumentDate(value) {
  return value ? value.replaceAll("-", "/") : "—";
}

function documentMoney(value) {
  if (value === "" || value == null || Number.isNaN(Number(value))) return "";
  return Number(value).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function saveDocumentSupplier() {
  const name = documentField("documentParty");
  const status = $("documentSupplierSaveStatus");
  if (!name) {
    status.textContent = "請先輸入廠商名稱";
    $("documentParty").focus();
    return;
  }
  const existing = state.suppliers.find((supplier) => supplier.name === name);
  const supplier = {
    name,
    contact: documentField("documentContact"),
    phone: documentField("documentPartyPhone"),
    fax: documentField("documentPartyFax"),
    email: existing?.email || "",
    address: existing?.address || "",
    terms: existing?.terms || "",
    lead_time: existing?.leadTime || existing?.lead_time || "",
    note: existing?.note || "",
  };
  status.textContent = "儲存中…";
  if (!USE_CLOUD) {
    const localSupplier = normalizeLocalSupplier({
      id: existing?.id,
      ...fromDbSupplier({ id: existing?.id, ...supplier }),
    });
    state.suppliers = existing
      ? state.suppliers.map((row) => row.id === existing.id ? localSupplier : row)
      : [...state.suppliers, localSupplier];
    state.suppliers.sort((a, b) => compareText(a.name, b.name));
    saveLocalData();
    refreshAll();
    status.textContent = existing ? "已更新廠商資料" : "已新增廠商資料";
    return;
  }
  const result = existing
    ? await db.from("suppliers").update(supplier).eq("id", existing.id)
    : await db.from("suppliers").insert(supplier);
  if (result.error) {
    status.textContent = "儲存失敗";
    return throwError(result.error);
  }
  await loadCloudData();
  status.textContent = existing ? "已更新廠商資料" : "已新增廠商資料";
}

function refreshAll() {
  renderDashboard();
  renderFilters();
  renderOptions();
  renderItems();
  renderSuppliers();
  renderDuplicateSupplierFilter();
  if (ENABLE_ERP_CURSOR && isPageRootFocused()) focusViewStart(activeView);
}

function renderDashboard() {
  const pending = state.items.filter((i) => i.priceStatus === "待詢價").length;
  const recent = [...state.items].filter((i) => i.sourceDate)
    .sort((a, b) => String(b.sourceDate).localeCompare(String(a.sourceDate))).slice(0, 10);
  $("itemCount").textContent = state.items.length;
  $("supplierCount").textContent = supplierNames().length;
  $("pendingPriceCount").textContent = pending;
  $("recentPriceRows").innerHTML = recent.map((i) => `
    <tr><td>${esc(i.supplier)}</td><td>${esc(i.category)}</td><td>${esc(i.product)}</td><td>${esc(i.sourceDate)}</td></tr>
  `).join("") || emptyRow(4);
  $("pendingPreviewRows").innerHTML = state.items.filter((i) => i.priceStatus === "待詢價").slice(0, 8).map((i) => `
    <tr><td>${esc(i.category)}</td><td>${esc(i.spec)}</td><td>${esc(i.supplier)}</td></tr>
  `).join("") || emptyRow(3);
}

function renderFilters() {
  const currentSupplier = $("supplierFilter").value;
  const suppliers = supplierNames();
  $("supplierFilter").innerHTML = `<option value="">請先選擇廠商</option>${suppliers.map((s) => `<option>${esc(s)}</option>`).join("")}`;
  $("supplierFilter").value = suppliers.includes(currentSupplier) ? currentSupplier : "";
  renderCategoryFilter();
  renderProductFilter();
}

function renderCategoryFilter() {
  const current = $("categoryFilter").value;
  const supplier = $("supplierFilter").value;
  if (!supplier) {
    $("categoryFilter").innerHTML = `<option value="">先選廠商</option>`;
    $("categoryFilter").value = "";
    return;
  }
  const categories = uniqueNamesByImportedOrder(state.items.filter((i) => !supplier || i.supplier === supplier), "category");
  $("categoryFilter").innerHTML = `<option value="">全部品類</option>${categories.map((c) => `<option>${esc(c)}</option>`).join("")}`;
  $("categoryFilter").value = categories.includes(current) ? current : "";
}

function renderProductFilter() {
  const current = $("productFilter").value;
  const supplier = $("supplierFilter").value;
  const category = $("categoryFilter").value;
  if (!supplier) {
    $("productFilter").innerHTML = `<option value="">先選廠商</option>`;
    $("productFilter").value = "";
    return;
  }
  const products = uniqueNamesByImportedOrder(state.items
    .filter((i) => (!supplier || i.supplier === supplier) && (!category || i.category === category)), "product");
  $("productFilter").innerHTML = `<option value="">全部材料名稱</option>${products.map((p) => `<option>${esc(p)}</option>`).join("")}`;
  $("productFilter").value = products.includes(current) ? current : "";
}

function renderOptions() {
  const currentSupplier = $("editSupplier").value;
  const supplierOptions = supplierNames().map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  $("editSupplier").innerHTML = `${supplierOptions}<option value="__custom__">＋新增廠商</option>`;
  if (supplierNames().includes(currentSupplier)) $("editSupplier").value = currentSupplier;
  $("itemOptions").innerHTML = state.items.map((i) => `<option value="${esc(itemLabel(i))}"></option>`).join("");
}

function getFilteredItems() {
  const q = $("itemSearch").value.trim();
  const supplier = $("supplierFilter").value;
  const category = $("categoryFilter").value;
  const product = $("productFilter").value;
  const status = $("statusFilter").value;
  const useGlobalSearch = searchAllSuppliers && Boolean(q);
  const effectiveSupplier = useGlobalSearch ? "" : supplier;
  const effectiveCategory = useGlobalSearch ? "" : category;
  const effectiveProduct = useGlobalSearch ? "" : product;
  if (!supplier && !q) return [];
  return state.items.filter((i) => {
    return (!q || itemMatchesSearch(i, q))
      && (!effectiveSupplier || i.supplier === effectiveSupplier)
      && (!effectiveCategory || i.category === effectiveCategory)
      && (!effectiveProduct || i.product === effectiveProduct)
      && (!status || i.priceStatus === status);
  }).sort((a, b) => q
    ? searchResultScore(a, q) - searchResultScore(b, q) || compareImportedOrder(a, b)
    : compareImportedOrder(a, b));
}

function itemSearchFields(item) {
  return [
    item.supplier,
    item.category,
    item.product,
    item.materialCode,
    item.itemCode,
    item.spec,
    item.unit,
    item.note,
    item.tpcName,
    item.originalName,
    item.sourceFile,
  ].map(normalizeSearchText).filter(Boolean);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-Hant")
    .replace(/[\s\-_/\\.,，。()（）\[\]【】'"×*]+/g, " ")
    .trim();
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function itemMatchesSearch(item, query) {
  const fields = itemSearchFields(item);
  const combined = fields.join(" ");
  const compactCombined = combined.replace(/\s+/g, "");
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactSearchText(query);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((token) => combined.includes(token) || compactCombined.includes(token.replace(/\s+/g, "")))
    || Boolean(compactQuery && compactCombined.includes(compactQuery));
}

function searchResultScore(item, query) {
  const fields = itemSearchFields(item);
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactSearchText(query);
  if (fields.some((field) => field === normalizedQuery)) return 0;
  if (fields.some((field) => field.startsWith(normalizedQuery))) return 1;
  if (fields.some((field) => field.includes(normalizedQuery))) return 2;
  if (compactQuery && fields.some((field) => field.replace(/\s+/g, "").includes(compactQuery))) return 3;
  return 4;
}

function renderItems() {
  const canSort = canManualSort();
  const items = getFilteredItems();
  const supplier = $("supplierFilter").value;
  const isGlobalSearch = Boolean($("itemSearch").value.trim()) && (!supplier || searchAllSuppliers);
  $("itemsView").classList.toggle("supplier-selected", Boolean(supplier));
  $("itemsView").classList.toggle("global-searching", isGlobalSearch);
  renderSearchScopeButton();
  renderItemContext(items, canSort);
  renderItemDisplayMode();
  $("itemCards").classList.toggle("hidden", itemDisplayMode !== "simple");
  $("itemTableWrap").classList.toggle("hidden", itemDisplayMode === "simple");
  if (isGlobalSearch) {
    selectedItemId = selectedItemForList(items)?.id || null;
    $("itemCards").classList.remove("hidden");
    $("itemTableWrap").classList.add("hidden");
    $("itemCards").innerHTML = renderGlobalSearchResults(items);
    $("itemRows").innerHTML = "";
  } else if (!supplier) {
    if (!isGlobalSearch) {
      selectedItemId = null;
      $("itemCards").classList.remove("hidden");
      $("itemTableWrap").classList.add("hidden");
      $("itemCards").innerHTML = renderSupplierFolders();
      $("itemRows").innerHTML = "";
      bindSupplierFolders();
    }
  } else if (itemDisplayMode === "simple") {
    selectedItemId = selectedItemForList(items)?.id || null;
    $("itemCards").innerHTML = renderSupplierWorkspace(items, canSort);
    $("itemRows").innerHTML = "";
  } else {
    $("itemTableHead").innerHTML = fullItemHeader();
    $("itemRows").innerHTML = renderFullItemRows(items, canSort);
    $("itemCards").innerHTML = "";
  }
  document.querySelectorAll("[data-select-item]").forEach((row) => row.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    comparisonDetailItemId = null;
    selectedItemId = row.dataset.selectItem;
    renderItems();
  }));
  document.querySelectorAll("[data-comparison-item]").forEach((row) => row.addEventListener("click", () => {
    comparisonDetailItemId = row.dataset.comparisonItem;
    renderItems();
  }));
  document.querySelectorAll("[data-back-suppliers]").forEach((button) => button.addEventListener("click", backToSupplierFolders));
  document.querySelectorAll("[data-pick-category]").forEach((button) => button.addEventListener("click", () => {
    $("categoryFilter").value = button.dataset.pickCategory;
    $("productFilter").value = "";
    renderProductFilter();
    selectedItemId = null;
    renderItems();
  }));
  document.querySelectorAll("[data-pick-product]").forEach((button) => button.addEventListener("click", () => {
    $("productFilter").value = button.dataset.pickProduct;
    selectedItemId = null;
    renderItems();
  }));
  document.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openItemDialog(b.dataset.edit)));
  document.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => moveItemOrder(b.dataset.move, Number(b.dataset.direction))));
  document.querySelectorAll("[data-clear-search]").forEach((b) => b.addEventListener("click", () => {
    $("itemSearch").value = "";
    searchAllSuppliers = false;
    selectedItemId = null;
    renderItems();
  }));
  restoreKeyboardCursor();
}

function renderGlobalSearchHeader(items) {
  const keyword = $("itemSearch").value.trim();
  const supplierCount = new Set(items.map((item) => item.supplier).filter(Boolean)).size;
  const supplier = $("supplierFilter").value;
  return `
    <section class="search-result-head">
      <div>
        <strong>搜尋結果</strong>
        <p>關鍵字「${esc(keyword)}」找到 ${items.length} 筆材料，${searchAllSuppliers || !supplier ? `分布在 ${supplierCount} 間廠商` : `目前只搜尋 ${esc(supplier)}`}。</p>
      </div>
      <button class="ghost" type="button" data-clear-search>清除搜尋</button>
    </section>
  `;
}

function renderGlobalSearchResults(items) {
  const selected = selectedItemForList(items);
  return `
    ${renderGlobalSearchHeader(items)}
    <div class="search-result-workspace">
      <section class="search-result-list-panel">
        <div class="erp-table-wrap search-result-table-wrap">
          <table class="erp-table search-result-table">
            <thead><tr><th>廠商</th><th>品類</th><th>材料名稱</th><th>規格</th><th class="price-heading">最新單價</th><th></th></tr></thead>
            <tbody>${renderSearchResultRows(items)}</tbody>
          </table>
        </div>
      </section>
      <aside class="erp-detail-panel search-result-detail-panel">
        ${renderErpDetail(selected)}
      </aside>
    </div>
  `;
}

function renderSearchResultRows(items) {
  return items.map((item) => `
    <tr class="${item.id === selectedItemId ? "selected" : ""}" data-select-item="${item.id}" tabindex="0" aria-selected="${item.id === selectedItemId ? "true" : "false"}">
      <td>${esc(item.supplier)}</td>
      <td>${esc(item.category)}</td>
      <td>${esc(item.product)}</td>
      <td class="erp-spec">${esc(item.spec || "未填規格")}</td>
      <td class="price-cell">${priceValue(item.latestPrice) || `<span class="muted">未填</span>`}</td>
      <td><button class="small-btn" data-edit="${item.id}" type="button">編輯</button></td>
    </tr>
  `).join("") || emptyRow(6);
}

function renderSearchScopeButton() {
  const button = $("globalSearchBtn");
  const supplier = $("supplierFilter").value;
  const q = $("itemSearch").value.trim();
  button.classList.toggle("active", searchAllSuppliers);
  button.textContent = searchAllSuppliers ? "已搜尋全部廠商" : "搜尋全部廠商";
  button.disabled = !supplier || !q;
  button.title = supplier ? "開啟後，搜尋會跳出目前廠商，改找全部廠商" : "未選廠商時已經是搜尋全部廠商";
}

function renderSupplierFolders() {
  const q = $("itemSearch").value.trim().toLowerCase();
  const groupedNames = new Set(Object.values(SUPPLIER_GROUPS).flat());
  const names = activeSupplierGroup
    ? supplierNames().filter((name) => SUPPLIER_GROUPS[activeSupplierGroup]?.includes(name))
    : supplierNames().filter((name) => !groupedNames.has(name));
  const folders = names.map((name) => {
    const items = state.items.filter((item) => item.supplier === name);
    const hay = items.map((item) => `${item.supplier} ${item.category} ${item.product} ${item.materialCode} ${item.spec} ${item.note} ${item.tpcName}`).join(" ").toLowerCase();
    const categoryCount = new Set(items.map((item) => item.category).filter(Boolean)).size;
    const productCount = new Set(items.map((item) => item.product).filter(Boolean)).size;
    const pendingCount = items.filter((item) => item.priceStatus === "待詢價").length;
    const latestDate = items.map((item) => item.sourceDate).filter(Boolean).sort().at(-1) || "未填日期";
    return { name, itemCount: items.length, categoryCount, productCount, pendingCount, latestDate, visible: !q || hay.includes(q) };
  }).filter((folder) => folder.visible);
  const groupFolders = activeSupplierGroup ? [] : Object.entries(SUPPLIER_GROUPS).map(([name, members]) => {
    const items = state.items.filter((item) => members.includes(item.supplier));
    const hay = items.map((item) => `${item.supplier} ${item.category} ${item.product} ${item.spec}`).join(" ").toLowerCase();
    return {
      name,
      supplierCount: new Set(items.map((item) => item.supplier)).size,
      itemCount: items.length,
      visible: items.length && (!q || hay.includes(q) || name.includes(q)),
    };
  }).filter((group) => group.visible);
  return `
    <section class="supplier-folder-view">
      ${activeSupplierGroup ? `
        <div class="material-breadcrumb">
          <button class="back-folder-btn" data-back-root-suppliers type="button">← 回全部廠商</button>
          <span>材料主檔</span><strong>${esc(activeSupplierGroup)}</strong>
        </div>` : ""}
      <div class="material-guide">
        <div><strong>1</strong><span>${activeSupplierGroup ? "選電線廠商" : "選廠商類型"}</span></div>
        <div><strong>2</strong><span>選品類 / 材料名稱</span></div>
        <div><strong>3</strong><span>看最新單價報價</span></div>
      </div>
      <div class="supplier-folder-head">
        <div>
          <strong>${esc(activeSupplierGroup || "廠商資料夾")}</strong>
          <p>${activeSupplierGroup ? "請選擇電線廠商，再依電線種類與規格查價。" : "先選廠商資料夾；電線請進入電線廠商資料夾。"}</p>
        </div>
        <span>${activeSupplierGroup ? `${folders.length} 間電線廠商` : `${folders.length + groupFolders.length} 個資料夾`}</span>
      </div>
      <div class="supplier-folder-grid">
        ${groupFolders.map((group) => `
          <button class="supplier-folder supplier-group-folder" data-open-supplier-group="${esc(group.name)}" type="button">
            <span class="folder-icon">▣</span>
            <strong>${esc(group.name)}</strong>
            <small>${group.supplierCount} 間廠商集中管理</small>
            <div class="folder-stats"><span>${group.itemCount} 筆電線價格</span></div>
            <em>開啟廠商清單</em>
          </button>
        `).join("")}
        ${folders.map((folder) => `
          <button class="supplier-folder" data-open-supplier="${esc(folder.name)}" type="button">
            <span class="folder-icon">▣</span>
            <strong>${esc(folder.name)}</strong>
            <small>最近價格日期：${esc(folder.latestDate)}</small>
            <div class="folder-stats">
              <span>${folder.categoryCount} 品類</span>
              <span>${folder.productCount} 材料名稱</span>
              <span>${folder.itemCount} 規格</span>
              ${folder.pendingCount ? `<span class="warn">${folder.pendingCount} 待詢價</span>` : ""}
            </div>
            <em>開啟廠商材料</em>
          </button>
        `).join("") || `<div class="empty-card muted">找不到符合的廠商或材料，請換一個關鍵字。</div>`}
      </div>
    </section>
  `;
}

function bindSupplierFolders() {
  document.querySelectorAll("[data-open-supplier-group]").forEach((button) => button.addEventListener("click", () => {
    activeSupplierGroup = button.dataset.openSupplierGroup;
    renderItems();
  }));
  document.querySelectorAll("[data-back-root-suppliers]").forEach((button) => button.addEventListener("click", () => {
    activeSupplierGroup = "";
    renderItems();
  }));
  document.querySelectorAll("[data-open-supplier]").forEach((button) => button.addEventListener("click", () => {
    $("supplierFilter").value = button.dataset.openSupplier;
    $("categoryFilter").value = "";
    $("productFilter").value = "";
    renderCategoryFilter();
    renderProductFilter();
    renderItems();
  }));
}

function backToSupplierFolders() {
  const supplier = $("supplierFilter").value;
  const returnToGroup = Object.entries(SUPPLIER_GROUPS).find(([, members]) => members.includes(supplier))?.[0] || "";
  selectedItemId = null;
  searchAllSuppliers = false;
  $("supplierFilter").value = "";
  $("categoryFilter").value = "";
  $("productFilter").value = "";
  $("itemSearch").value = "";
  $("statusFilter").value = "";
  activeSupplierGroup = returnToGroup;
  renderCategoryFilter();
  renderProductFilter();
  renderItems();
}

function renderItemDisplayMode() {
  document.querySelectorAll("[data-display-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.displayMode === itemDisplayMode);
  });
}

function fullItemHeader() {
  return `<tr><th>廠商</th><th>品類</th><th>材料名稱</th><th>材料編號</th><th>規格</th><th>單位</th><th class="price-heading">最新單價</th><th>價格日期</th><th class="price-heading">最高價格</th><th>最高價格日期</th><th>狀態</th><th></th></tr>`;
}

function selectedItemForList(items) {
  return items.find((item) => item.id === selectedItemId) || items[0] || null;
}

function renderSupplierWorkspace(items, canSort) {
  const comparisonItem = comparisonDetailItemId
    ? state.items.find((item) => item.id === comparisonDetailItemId)
    : null;
  const selected = comparisonItem || selectedItemForList(items);
  const supplier = $("supplierFilter").value;
  const supplierItems = state.items.filter((item) => item.supplier === supplier);
  const activeCategory = $("categoryFilter").value;
  const activeProduct = $("productFilter").value;
  const categories = supplierCategories(supplierItems);
  const products = activeCategory ? supplierProducts(supplierItems, activeCategory) : [];
  if (!supplierItems.length) return `<div class="empty-card muted">目前沒有資料</div>`;
  return `
    <div class="material-breadcrumb">
      <button class="back-folder-btn" data-back-suppliers type="button">← ${activeSupplierGroup ? `回${esc(activeSupplierGroup)}` : "回廠商資料夾"}</button>
      <span>材料主檔</span>
      <strong>${esc(supplier)}</strong>
      ${activeCategory ? `<span>${esc(activeCategory)}</span>` : ""}
      ${activeProduct ? `<span>${esc(activeProduct)}</span>` : ""}
    </div>
    <div class="erp-workspace">
      <section class="erp-category-panel">
        <div class="supplier-workspace-title">
          <span>目前廠商</span>
          <strong>${esc(supplier)}</strong>
          <small>${supplierItems.length} 筆規格</small>
        </div>
        <div class="category-scroll-list" aria-label="品類清單">
          <button class="category-tab ${activeCategory ? "" : "active"}" data-pick-category="" type="button">
            <strong>全部品類</strong><span>${supplierItems.length}</span>
          </button>
          ${categories.map((category) => `
            <button class="category-tab ${category.name === activeCategory ? "active" : ""}" data-pick-category="${esc(category.name)}" type="button">
              <strong>${esc(category.name || "未分類")}</strong><span>${category.count}</span>
            </button>
          `).join("")}
        </div>
      </section>
      <section class="erp-list-panel">
        <div class="erp-panel-head erp-toolbar-head">
          <div>
            <strong>${esc(activeCategory || "全部品類")}</strong>
            <span>${esc(activeProduct || "全部材料名稱")}</span>
          </div>
          <span>點選一筆查看右側詳細資料</span>
        </div>
        ${products.length ? `
          <div class="product-chip-row">
            <button class="product-chip ${activeProduct ? "" : "active"}" data-pick-product="" type="button">全部材料</button>
            ${products.map((product) => `<button class="product-chip ${product.name === activeProduct ? "active" : ""}" data-pick-product="${esc(product.name)}" type="button">${esc(product.name || "未填材料名稱")} <span>${product.count}</span></button>`).join("")}
          </div>
        ` : ""}
        <div class="material-group-list">${renderMaterialGroups(items, canSort)}</div>
      </section>
      <aside class="erp-detail-panel">
        ${renderErpDetail(selected)}
      </aside>
    </div>
  `;
}

function renderMaterialGroups(items, canSort) {
  if (!items.length) return `<div class="empty-card muted">目前沒有資料</div>`;
  const groups = groupItemsByCategoryProduct(items);
  return groups.map((group) => `
    <section class="material-group">
      <div class="material-group-head">
        <div>
          <span>${esc(group.category || "未分類")}</span>
          <strong>${esc(group.product || "未填材料名稱")}</strong>
        </div>
        <small>${group.items.length} 筆規格</small>
      </div>
      <div class="erp-table-wrap compact-table">
        <table class="erp-table material-spec-table">
          <thead>
            <tr><th>規格</th><th>材料編號</th><th>單位</th><th class="price-heading">最新單價</th><th>價格日期</th><th class="price-heading">最高價格</th><th></th></tr>
          </thead>
          <tbody>${renderSupplierWorkspaceRows(group.items, canSort)}</tbody>
        </table>
      </div>
    </section>
  `).join("");
}

function groupItemsByCategoryProduct(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = `${item.category || ""}|||${item.product || ""}`;
    if (!groups.has(key)) groups.set(key, { category: item.category || "", product: item.product || "", items: [], firstOrder: orderValue(item) });
    groups.get(key).items.push(item);
    groups.get(key).firstOrder = Math.min(groups.get(key).firstOrder, orderValue(item));
  });
  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort(compareImportedOrder),
  })).sort((a, b) => compareText(a.category, b.category) || compareText(a.product, b.product));
}

function renderSupplierWorkspaceRows(items, canSort) {
  return items.map((i, index, list) => `
    <tr class="${i.id === selectedItemId ? "selected" : ""}" data-select-item="${i.id}" tabindex="0" aria-selected="${i.id === selectedItemId ? "true" : "false"}">
      <td class="erp-spec">${esc(i.spec || "未填規格")}</td>
      <td>${esc(i.materialCode || "")}</td>
      <td>${esc(i.unit || "")}</td>
      <td class="price-cell">${priceValue(i.latestPrice) || `<span class="muted">未填</span>`}</td>
      <td>${esc(i.sourceDate || "未填")}</td>
      <td class="price-cell">${priceValue(i.highestPrice) || `<span class="muted">未填</span>`}</td>
      <td><div class="row-actions">${itemRowControls(i, index, list, canSort)}</div></td>
    </tr>
  `).join("");
}

function supplierCategories(items) {
  const counts = new Map();
  const firstOrders = new Map();
  items.forEach((item) => {
    const name = item.category || "";
    counts.set(name, (counts.get(name) || 0) + 1);
    firstOrders.set(name, Math.min(firstOrders.get(name) ?? Number.MAX_SAFE_INTEGER, orderValue(item)));
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, firstOrder: firstOrders.get(name) }))
    .sort((a, b) => compareText(a.name, b.name));
}

function supplierProducts(items, category) {
  const counts = new Map();
  const firstOrders = new Map();
  items.filter((item) => item.category === category)
    .forEach((item) => {
      const name = item.product || "";
      counts.set(name, (counts.get(name) || 0) + 1);
      firstOrders.set(name, Math.min(firstOrders.get(name) ?? Number.MAX_SAFE_INTEGER, orderValue(item)));
    });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, firstOrder: firstOrders.get(name) }))
    .sort((a, b) => compareText(a.name, b.name));
}

function uniqueNamesByImportedOrder(items, field) {
  const groups = new Map();
  items.forEach((item) => {
    const name = item[field] || "";
    if (!name) return;
    groups.set(name, Math.min(groups.get(name) ?? Number.MAX_SAFE_INTEGER, orderValue(item)));
  });
  return [...groups.entries()]
    .sort((a, b) => compareText(a[0], b[0]))
    .map(([name]) => name);
}

function orderValue(item) {
  const value = Number(item?.sortOrder);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function handleErpCursorKey(event) {
  if ($("appShell").classList.contains("hidden")) return false;
  if (document.querySelector("dialog[open]")) return false;
  if (keyboardEditMode) {
    if (event.key !== "Escape") return false;
    event.preventDefault();
    keyboardEditMode = false;
    document.activeElement?.blur?.();
    setKeyboardCursor(keyboardCursorElement || keyboardTargets()[0]);
    return true;
  }
  const current = currentKeyboardTarget();
  if (current?.closest(".top-actions")) {
    event.preventDefault();
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      focusFirstKeyboardItem(".nav-item.active, .nav-item");
    } else if (event.key === "ArrowRight") {
      moveKeyboardCursorInGroup(event.key, ".top-actions button", 1);
    } else if (event.key === "ArrowDown") {
      focusViewStart(activeView);
    } else if (event.key === "Enter") {
      activateKeyboardTarget(current);
    }
    return true;
  }
  if (current?.closest(".nav")) {
    event.preventDefault();
    if (event.key === "ArrowRight") focusViewStart(activeView);
    else if (["ArrowUp", "ArrowDown"].includes(event.key)) moveKeyboardCursorInGroup(event.key, ".nav-item", 1);
    else if (event.key === "Enter") activateKeyboardTarget(current);
    else setKeyboardCursor(current);
    return true;
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    moveKeyboardCursor(event.key);
    return true;
  }
  if (event.key === "Enter") {
    const target = currentKeyboardTarget();
    if (!target) return false;
    event.preventDefault();
    activateKeyboardTarget(target);
    return true;
  }
  if (event.key === "Escape") {
    const supplier = $("supplierFilter").value;
    if (activeView === "items" && supplier) {
      event.preventDefault();
      backToSupplierFolders();
      window.requestAnimationFrame(() => setKeyboardCursor(keyboardTargets()[0]));
      return true;
    }
  }
  return false;
}

function moveKeyboardCursorInGroup(key, selector, columns = 1) {
  const items = [...document.querySelectorAll(selector)]
    .filter((item) => item.offsetParent !== null)
    .filter((item) => !item.disabled);
  if (!items.length) return;
  const current = currentKeyboardTarget();
  const currentIndex = Math.max(0, items.indexOf(current?.closest(selector)));
  const deltaMap = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -columns,
    ArrowDown: columns,
  };
  const nextIndex = Math.min(items.length - 1, Math.max(0, currentIndex + (deltaMap[key] || 0)));
  setKeyboardCursor(items[nextIndex]);
}

function moveKeyboardCursor(key) {
  const targets = keyboardTargets();
  if (!targets.length) return;
  const current = currentKeyboardTarget();
  if (!current) {
    setKeyboardCursor(targets[0]);
    return;
  }
  const from = elementCenter(current);
  const candidates = targets
    .filter((target) => target !== current)
    .map((target) => ({ target, center: elementCenter(target) }))
    .filter(({ center }) => isDirectionCandidate(from, center, key))
    .map(({ target, center }) => ({ target, score: directionScore(from, center, key) }))
    .sort((a, b) => a.score - b.score);
  setKeyboardCursor(candidates[0]?.target || current);
}

function currentKeyboardTarget() {
  const targets = keyboardTargets();
  if (!targets.length) return null;
  const active = document.activeElement;
  const visualCursor = document.querySelector(".keyboard-current");
  if (visualCursor && targets.includes(visualCursor)) return visualCursor;
  const activeTarget = targets.includes(active) ? active : targets.find((target) => target.contains(active));
  if (activeTarget) return activeTarget;
  if (keyboardCursorElement && targets.includes(keyboardCursorElement)) return keyboardCursorElement;
  return targets[0];
}

function setKeyboardCursor(target) {
  if (!target) return;
  document.querySelectorAll(".keyboard-current").forEach((node) => node.classList.remove("keyboard-current"));
  keyboardCursorElement = target;
  target.classList.add("keyboard-current");
  const itemRow = target.closest("[data-select-item]");
  if (itemRow) selectedItemId = itemRow.dataset.selectItem;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function restoreKeyboardCursor() {
  if (!ENABLE_ERP_CURSOR) return;
  window.requestAnimationFrame(() => {
    const targets = keyboardTargets();
    if (!targets.length) return;
    if (keyboardCursorElement && targets.includes(keyboardCursorElement)) {
      setKeyboardCursor(keyboardCursorElement);
      return;
    }
    const selectedRow = selectedItemId ? document.querySelector(`[data-select-item="${cssEscape(selectedItemId)}"]`) : null;
    setKeyboardCursor(selectedRow || targets[0]);
  });
}

function activateKeyboardTarget(target) {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
    keyboardEditMode = true;
    target.focus();
    if (target.tagName === "INPUT") target.select?.();
    return;
  }
  const fileInput = target.matches(".file-btn") ? target.querySelector("input[type='file']") : null;
  if (fileInput) {
    fileInput.click();
    return;
  }
  target.click();
  window.requestAnimationFrame(() => {
    const next = currentKeyboardTarget();
    if (next) setKeyboardCursor(next);
  });
}

function handleKeyboardNavigation(event) {
  const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape"];
  if (!keys.includes(event.key)) return;
  if ($("appShell").classList.contains("hidden")) return;
  if (document.querySelector("dialog[open]")) return;

  if (keyboardEditMode) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    keyboardEditMode = false;
    document.activeElement?.blur?.();
    setKeyboardCursor(keyboardCursorElement || keyboardTargets()[0]);
    return;
  }

  const current = currentKeyboardTarget();
  if (!current) return;

  if (event.key === "Escape") {
    const supplier = $("supplierFilter").value;
    event.preventDefault();
    if (activeView === "items" && supplier) backToSupplierFolders();
    else focusFirstKeyboardItem(".nav-item.active, .nav-item");
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    activateKeyboardTarget(current);
    return;
  }

  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();

  if (current.closest(".nav")) {
    handleKeyboardGroup(event, ".nav-item", 1, {
      ArrowRight: () => focusViewStart(activeView),
    });
    return;
  }

  if (current.closest(".top-actions")) {
    handleKeyboardGroup(event, ".top-actions button", 1, {
      ArrowLeft: () => focusFirstKeyboardItem(".nav-item.active, .nav-item"),
      ArrowUp: () => focusFirstKeyboardItem(".nav-item.active, .nav-item"),
      ArrowDown: () => focusViewStart(activeView),
    });
    return;
  }

  if (current.closest(".tool-buttons")) {
    handleKeyboardGroup(event, ".tool-buttons button, .tool-buttons .file-btn", 4);
    return;
  }

  if (current.closest(".panel-head")) {
    handleKeyboardGroup(event, ".view.active .panel-head button", 1);
    return;
  }

  if (activeView === "dashboard") {
    if (current.closest(".quick-actions")) {
      handleKeyboardGroup(event, ".quick-action", 4);
      return;
    }
    if (current.closest(".flow-grid")) {
      handleKeyboardGroup(event, ".flow-grid button", 2);
      return;
    }
  }

  if (activeView === "suppliers" && current.closest("[data-supplier-row]")) {
    handleKeyboardGroup(event, "[data-supplier-row]", 1);
    return;
  }

  if (activeView === "settings" && current.closest("#duplicateRows tr")) {
    handleKeyboardGroup(event, "#duplicateRows tr", 1);
    return;
  }

  if (activeView === "settings" && current.closest("#importPreviewRows tr")) {
    handleKeyboardGroup(event, "#importPreviewRows tr", 1);
    return;
  }

  if (activeView === "items" && itemDisplayMode === "full" && current.closest("#itemRows [data-select-item]")) {
    handleFullTableKeyboard(event);
    return;
  }

  if (activeView !== "items" || itemDisplayMode !== "simple") {
    moveKeyboardCursor(event.key);
    return;
  }

  const supplier = $("supplierFilter").value;
  if (!supplier) {
    handleKeyboardGroup(event, ".supplier-folder", 3);
    return;
  }

  if (current.closest(".toolbar")) {
    if (event.key === "ArrowLeft") focusFirstKeyboardItem(".nav-item.active, .nav-item");
    else if (event.key === "ArrowUp") focusFirstKeyboardItem(".top-actions button");
    else if (event.key === "ArrowDown") focusFirstKeyboardItem(".category-tab.active, .category-tab, .product-chip, [data-select-item]");
    else moveKeyboardCursor(event.key);
    return;
  }

  if (current.closest(".erp-category-panel")) {
    handleKeyboardGroup(event, ".erp-category-panel button", 1, {
      ArrowRight: () => focusFirstKeyboardItem(".product-chip.active, .product-chip, [data-select-item]"),
    });
    return;
  }

  if (current.closest(".product-chip-row")) {
    handleKeyboardGroup(event, ".product-chip", 1, {
      ArrowUp: () => focusActiveCategoryButton(),
      ArrowDown: () => focusSelectedMaterialRow(),
    });
    return;
  }

  if (!current.closest(".erp-table")) {
    if (["ArrowUp", "ArrowDown"].includes(event.key)) {
      focusSelectedMaterialRow();
    } else if (event.key === "ArrowLeft") {
      focusActiveCategoryButton();
    } else if (event.key === "ArrowRight") {
      focusFirstKeyboardItem(".product-chip.active, .product-chip");
    }
    return;
  }

  const items = getFilteredItems();
  if (!items.length) return;
  const currentIndex = Math.max(0, items.findIndex((item) => item.id === selectedItemId));
  if (event.key === "ArrowLeft") {
    focusActiveCategoryButton();
    return;
  }
  if (event.key === "ArrowRight") {
    focusFirstKeyboardItem(".product-chip.active, .product-chip, .detail-edit-btn");
    return;
  }
  if (["ArrowUp", "ArrowDown"].includes(event.key)) {
    const direction = event.key === "ArrowUp" ? -1 : 1;
    const nextIndex = Math.min(items.length - 1, Math.max(0, currentIndex + direction));
    selectedItemId = items[nextIndex].id;
    renderItems();
    focusSelectedMaterialRow();
  }
}

function focusByDirection(event) {
  if ($("appShell").classList.contains("hidden")) return false;
  event.preventDefault();
  if (isPageRootFocused()) {
    focusViewStart(activeView);
    return true;
  }
  const targets = keyboardTargets();
  if (!targets.length) return false;
  const active = document.activeElement;
  const activeTarget = targets.includes(active) ? active : targets.find((target) => target.contains(active));
  if (!activeTarget) {
    focusKeyboardTarget(targets[0]);
    return true;
  }
  const from = elementCenter(activeTarget);
  const candidates = targets
    .filter((target) => target !== activeTarget)
    .map((target) => ({ target, center: elementCenter(target) }))
    .filter(({ center }) => isDirectionCandidate(from, center, event.key))
    .map(({ target, center }) => ({ target, score: directionScore(from, center, event.key) }))
    .sort((a, b) => a.score - b.score);
  if (!candidates.length) return false;
  focusKeyboardTarget(candidates[0].target);
  return true;
}

function keyboardTargets() {
  return [...document.querySelectorAll(keyboardTargetSelector())]
    .filter((target) => target.offsetParent !== null)
    .filter((target) => !target.disabled)
    .filter((target) => target.tabIndex !== -1)
    .sort((a, b) => {
      const left = a.getBoundingClientRect();
      const right = b.getBoundingClientRect();
      return left.top - right.top || left.left - right.left;
    });
}

function keyboardTargetSelector() {
  return [
    ".nav-item",
    ".top-actions button",
    ".quick-action",
    ".flow-grid button",
    "#itemsView .toolbar input",
    "#itemsView .toolbar select",
    ".supplier-folder",
    ".category-tab",
    ".product-chip",
    "[data-select-item]",
    "[data-select-item] button",
    ".detail-edit-btn",
    "#suppliersView input",
    "#saveSupplierBtn",
    "[data-supplier-row]",
    ".tool-buttons button",
    ".tool-buttons .file-btn",
    "#duplicateSupplierFilter",
    "#confirmExcelImportBtn",
    "#cleanDuplicateBtn",
    "#importPreviewRows tr",
    "#duplicateRows tr",
    "#logoutBtn",
  ].join(",");
}

function elementCenter(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function isDirectionCandidate(from, to, key) {
  const tolerance = 8;
  if (key === "ArrowDown") return to.y > from.y + tolerance;
  if (key === "ArrowUp") return to.y < from.y - tolerance;
  if (key === "ArrowRight") return to.x > from.x + tolerance;
  if (key === "ArrowLeft") return to.x < from.x - tolerance;
  return false;
}

function directionScore(from, to, key) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (key === "ArrowDown" || key === "ArrowUp") return Math.abs(dy) * 100 + Math.abs(dx);
  return Math.abs(dx) * 100 + Math.abs(dy);
}

function focusKeyboardTarget(target) {
  if (!target) return;
  const itemRow = target.closest("[data-select-item]");
  if (itemRow) selectedItemId = itemRow.dataset.selectItem;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (itemRow && itemDisplayMode === "simple") {
    renderItems();
    focusSelectedMaterialRow();
  }
}

function handleFullTableKeyboard(event) {
  const rows = [...document.querySelectorAll("#itemRows [data-select-item]")].filter((row) => row.offsetParent !== null);
  if (!rows.length) return;
  const currentRow = document.activeElement.closest("[data-select-item]");
  const currentIndex = Math.max(0, rows.indexOf(currentRow));
  if (event.key === "Enter") {
    event.preventDefault();
    openItemDialog(rows[currentIndex].dataset.selectItem);
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    focusFirstKeyboardItem(".top-actions button");
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "Escape") {
    event.preventDefault();
    focusFirstKeyboardItem(".nav-item.active, .nav-item");
    return;
  }
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === "ArrowUp" ? -1 : 1;
  const nextIndex = Math.min(rows.length - 1, Math.max(0, currentIndex + direction));
  selectedItemId = rows[nextIndex].dataset.selectItem;
  rows[nextIndex].focus();
}

function handleKeyboardGroup(event, selector, columns = 1, custom = {}) {
  if (custom[event.key]) {
    custom[event.key]();
    return;
  }
  const items = [...document.querySelectorAll(selector)].filter((item) => item.offsetParent !== null);
  if (!items.length) return;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  const current = currentKeyboardTarget();
  const currentIndex = Math.max(0, items.indexOf(current?.closest(selector)));
  const deltaMap = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -columns,
    ArrowDown: columns,
  };
  const nextIndex = Math.min(items.length - 1, Math.max(0, currentIndex + deltaMap[event.key]));
  setKeyboardCursor(items[nextIndex]);
}

function handleKeyboardFallback(event) {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  const fallbackMap = {
    dashboard: ".quick-action, .flow-grid button, .top-actions button",
    suppliers: "[data-supplier-row], #saveSupplierBtn",
    settings: ".tool-buttons button, .tool-buttons .file-btn, .view.active .panel-head button",
    help: ".nav-item.active, .nav-item",
  };
  const selector = fallbackMap[activeView];
  if (!selector) return;
  event.preventDefault();
  focusFirstKeyboardItem(selector);
}

function isTypingTarget(element) {
  return ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) || element.isContentEditable;
}

function focusSelectedMaterialRow() {
  window.requestAnimationFrame(() => {
    const row = document.querySelector(`[data-select-item="${cssEscape(selectedItemId)}"]`);
    if (!row) return;
    setKeyboardCursor(row);
  });
}

function focusViewStart(view = activeView) {
  if (!ENABLE_ERP_CURSOR) return;
  window.requestAnimationFrame(() => {
    const selectorMap = {
      dashboard: ".quick-action, .flow-grid button, .top-actions button",
      items: "#itemSearch, #supplierFilter, #categoryFilter, #productFilter, #statusFilter, .supplier-folder, .category-tab.active, .category-tab, [data-select-item]",
      suppliers: "[data-supplier-row], #supplierName",
      settings: ".tool-buttons button, .tool-buttons .file-btn",
      help: ".nav-item.active, .nav-item",
    };
    focusFirstKeyboardItem(selectorMap[view] || ".nav-item.active, .nav-item");
  });
}

function isPageRootFocused() {
  return [document.body, document.documentElement, null].includes(document.activeElement);
}

function focusActiveCategoryButton() {
  focusFirstKeyboardItem(".category-tab.active, .category-tab");
}

function focusFirstKeyboardItem(selector) {
  window.requestAnimationFrame(() => {
    const item = [...document.querySelectorAll(selector)].find((node) => node.offsetParent !== null);
    if (item) setKeyboardCursor(item);
  });
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value || ""));
  return String(value || "").replace(/["\\]/g, "\\$&");
}

function renderErpDetail(item) {
  if (!item) return `<div class="muted">請先選擇材料</div>`;
  return `
    <div class="detail-title">
      <span>材料詳細資料</span>
      ${statusBadge(item.priceStatus)}
    </div>
    <h3>${esc(item.product || item.category || "未填材料名稱")}</h3>
    <p>${esc(item.spec || "未填規格")}</p>
    <div class="detail-price-grid">
      <div class="detail-price primary-price"><span>最新單價</span><strong>${priceValue(item.latestPrice) || `<span class="muted">未填價格</span>`}</strong><small>${esc(item.sourceDate || "未填日期")}</small></div>
      <div class="detail-price"><span>最高價格</span><strong>${priceValue(item.highestPrice) || `<span class="muted">未填價格</span>`}</strong><small>${esc(item.highestPriceDate || "未填日期")}</small></div>
    </div>
    <dl class="detail-list">
      ${detailRow("廠商", item.supplier)}
      ${detailRow("品類", item.category)}
      ${detailRow("材料編號", item.materialCode)}
      ${detailRow("台塑材料名稱", item.tpcName)}
      ${detailRow("原始品名", item.originalName)}
      ${detailRow("來源檔案", item.sourceFile)}
      ${detailRow("單位", item.unit)}
      ${detailRow("備註", item.note)}
    </dl>
    ${renderWireSupplierComparison(item)}
    <button class="primary detail-edit-btn" data-edit="${item.id}">編輯這筆材料</button>
  `;
}

function isWireSupplier(name) {
  return SUPPLIER_GROUPS["電纜線廠商"].includes(name);
}

function wireComparisonKey(item) {
  return `${compactSearchText(item.product)}|${compactSearchText(item.spec)}`;
}

function renderWireSupplierComparison(item) {
  if (!isWireSupplier(item.supplier)) return "";
  const key = wireComparisonKey(item);
  const matches = state.items
    .filter((row) => isWireSupplier(row.supplier) && wireComparisonKey(row) === key)
    .sort((a, b) => Number(a.latestPrice || Number.MAX_SAFE_INTEGER) - Number(b.latestPrice || Number.MAX_SAFE_INTEGER));
  const supplierCount = new Set(matches.map((row) => row.supplier)).size;
  return `
    <section class="wire-comparison">
      <div class="wire-comparison-head">
        <div><strong>同規格其他電纜線廠商價格比較</strong><small>點選廠商報價可查看該筆完整資料</small></div>
        <span>${supplierCount} 間廠商</span>
      </div>
      ${supplierCount > 1 ? `
        <div class="wire-comparison-table-wrap">
          <table class="wire-comparison-table">
            <thead><tr><th>廠商</th><th>品牌</th><th>規格</th><th>最新單價</th><th>價格日期</th><th>最高價格</th><th></th></tr></thead>
            <tbody>${matches.map((row) => `
              <tr class="comparison-row ${row.id === item.id ? "current" : ""}" data-comparison-item="${esc(row.id)}" tabindex="0">
                <td>${esc(row.supplier)}</td>
                <td>${esc(wireBrand(row.note))}</td>
                <td>${esc(row.spec || "未填")}</td>
                <td class="price-cell">${priceValue(row.latestPrice)}</td>
                <td>${esc(row.sourceDate || "未填")}</td>
                <td class="price-cell">${priceValue(row.highestPrice)}</td>
                <td><span class="comparison-view-btn">查看</span></td>
              </tr>`).join("")}</tbody>
          </table>
        </div>` : `<p class="wire-comparison-empty">目前沒有其他電纜線廠商的同規格報價。</p>`}
    </section>`;
}

function wireBrand(note) {
  const match = String(note || "").match(/(?:^|；)品牌：([^；]+)/);
  return match?.[1] || "未標示";
}

function detailRow(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value || "未填")}</dd></div>`;
}

function renderFullItemRows(items, canSort) {
  return items.map((i, index, list) => `
    <tr class="${i.id === selectedItemId ? "selected" : ""}" data-select-item="${i.id}" tabindex="0" aria-selected="${i.id === selectedItemId ? "true" : "false"}">
      <td>${esc(i.supplier)}</td><td>${esc(i.category)}</td><td>${esc(i.product)}</td><td>${esc(i.materialCode)}</td><td>${esc(i.spec)}</td><td>${esc(i.unit)}</td>
      <td class="price-cell">${priceValue(i.latestPrice)}</td><td>${esc(i.sourceDate)}</td>
      <td class="price-cell">${priceValue(i.highestPrice)}</td><td>${esc(i.highestPriceDate)}</td>
      <td>${statusBadge(i.priceStatus)}</td>
      <td><div class="row-actions">
        ${itemRowControls(i, index, list, canSort)}
      </div></td>
    </tr>
  `).join("") || emptyRow(12);
}

function itemRowControls(item, index, list, canSort) {
  return `${canSort ? `<button class="small-btn icon-btn" data-move="${item.id}" data-direction="-1" ${index === 0 ? "disabled" : ""} title="上移">↑</button><button class="small-btn icon-btn" data-move="${item.id}" data-direction="1" ${index === list.length - 1 ? "disabled" : ""} title="下移">↓</button>` : ""}
    <button class="small-btn" data-edit="${item.id}">編輯</button>`;
}

function itemMeta(item) {
  return [
    item.supplier ? `廠商：${item.supplier}` : "",
    item.category ? `品類：${item.category}` : "",
    item.materialCode ? `材料編號：${item.materialCode}` : "",
    item.tpcName ? `台塑：${item.tpcName}` : "",
    item.unit ? `單位：${item.unit}` : "",
  ].filter(Boolean).map(esc).join("　");
}

function itemMetaTags(item) {
  return [
    item.supplier ? `廠商：${item.supplier}` : "",
    item.category ? `品類：${item.category}` : "",
    item.materialCode ? `材料編號：${item.materialCode}` : "",
    item.tpcName ? `台塑：${item.tpcName}` : "",
    item.unit ? `單位：${item.unit}` : "",
  ].filter(Boolean).map((text) => `<span>${esc(text)}</span>`).join("");
}

function renderItemContext(items, canSort) {
  const supplier = $("supplierFilter").value;
  const category = $("categoryFilter").value;
  const product = $("productFilter").value;
  const hasSearch = $("itemSearch").value.trim();
  const status = $("statusFilter").value;
  if (!supplier) {
    if (hasSearch) {
      $("filterCountText").textContent = `目前找到 ${items.length} 筆材料`;
      $("sortHint").classList.remove("ready", "saved");
      $("sortHint").textContent = "搜尋結果會直接列出符合的材料；看廠商分類請按清除搜尋。";
      return;
    }
    const q = "";
    const folderCount = supplierNames().filter((name) => {
      const supplierItems = state.items.filter((item) => item.supplier === name);
      const hay = supplierItems.map((item) => `${item.supplier} ${item.category} ${item.product} ${item.materialCode} ${item.spec} ${item.note} ${item.tpcName}`).join(" ").toLowerCase();
      return !q || hay.includes(q);
    }).length;
    $("filterCountText").textContent = `目前顯示 ${folderCount} 間廠商`;
    $("sortHint").classList.remove("ready", "saved");
    $("sortHint").textContent = "先點廠商資料夾進入；也可以用搜尋欄先找材料關鍵字。";
    return;
  }
  $("filterCountText").textContent = `目前顯示 ${items.length} 筆`;
  if (searchAllSuppliers && hasSearch) {
    $("filterCountText").textContent = `全部廠商找到 ${items.length} 筆`;
    $("sortHint").classList.remove("ready", "saved");
    $("sortHint").textContent = "目前是搜尋全部廠商；關掉按鈕後會回到只搜尋目前廠商。";
    return;
  }
  $("sortHint").classList.remove("ready", "saved");
  $("sortHint").textContent = "品類、材料名稱與規格會依名稱自動排序。";
}

function canManualSort() {
  return false;
}

async function moveItemOrder(itemId, direction) {
  if (!canManualSort()) return;
  const list = getFilteredItems();
  const index = list.findIndex((item) => item.id === itemId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= list.length) return;
  const ordered = normalizeSortOrders(list);
  const item = ordered[index];
  const target = ordered[targetIndex];
  const itemOrder = item.sortOrder;
  item.sortOrder = target.sortOrder;
  target.sortOrder = itemOrder;
  if (!USE_CLOUD) {
    state.items = state.items.map((row) => {
      if (row.id === item.id) return { ...row, sortOrder: item.sortOrder };
      if (row.id === target.id) return { ...row, sortOrder: target.sortOrder };
      return row;
    }).sort(compareImportedOrder);
    saveLocalData();
    renderItems();
    showSortSaved();
    return;
  }
  const [itemResult, targetResult] = await Promise.all([
    db.from("materials").update({ sort_order: item.sortOrder }).eq("id", item.id),
    db.from("materials").update({ sort_order: target.sortOrder }).eq("id", target.id),
  ]);
  if (itemResult.error) return throwError(itemResult.error);
  if (targetResult.error) return throwError(targetResult.error);
  state.items = state.items.map((row) => {
    if (row.id === item.id) return { ...row, sortOrder: item.sortOrder };
    if (row.id === target.id) return { ...row, sortOrder: target.sortOrder };
    return row;
  }).sort(compareImportedOrder);
  renderItems();
  showSortSaved();
}

function showSortSaved() {
  $("sortHint").textContent = "排序已儲存。";
  $("sortHint").classList.add("ready", "saved");
  window.setTimeout(() => {
    if (activeView === "items") renderItems();
  }, 1200);
}

function normalizeSortOrders(list) {
  return list.map((item, index) => ({
    ...item,
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : sortOrderFromItemCode(item.itemCode, index),
  }));
}

function sortOrderFromItemCode(itemCode, fallbackIndex) {
  const parts = itemCodeParts(itemCode);
  return parts.hasCode ? parts.number : fallbackIndex + 1;
}

function nextSortOrder(supplier, category, product) {
  const group = state.items.filter((item) => item.supplier === supplier && item.category === category && item.product === product);
  const maxOrder = group.reduce((max, item, index) => Math.max(max, Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : sortOrderFromItemCode(item.itemCode, index)), 0);
  return maxOrder + 1;
}

function priceValue(value) {
  if (value === "" || value == null) return "";
  return `<span class="price-display"><span class="money-icon">$</span><span>${money(value)}</span></span>`;
}

function renderSuppliers() {
  $("supplierRows").innerHTML = state.suppliers.map((s) => `
    <tr class="clickable-row" data-supplier-row="${esc(s.name)}" tabindex="0"><td>${esc(s.name)}</td><td>${esc(s.contact)}</td><td>${esc(s.phone)}</td><td>${esc(s.fax)}</td><td>${esc(s.email)}</td><td>${esc(s.address)}</td><td>${esc(s.terms)}</td><td>${esc(s.leadTime)}</td><td>${esc(s.note)}</td></tr>
  `).join("");
  document.querySelectorAll("[data-supplier-row]").forEach((row) => row.addEventListener("click", () => editSupplier(row.dataset.supplierRow)));
  restoreKeyboardCursor();
}

function openItemDialog(itemId = null) {
  editingItemId = itemId;
  const contextSupplier = activeView === "items" ? $("supplierFilter").value : "";
  const contextCategory = activeView === "items" ? $("categoryFilter").value : "";
  const item = itemId ? itemById(itemId) : {
    id: "", supplier: contextSupplier || supplierNames()[0] || "", category: contextCategory, product: "", materialCode: "", spec: "", unit: "PC",
    latestPrice: "", highestPrice: "", highestPriceDate: "", sourceDate: today, note: "", tpcName: "", sortOrder: "",
  };
  $("itemDialogTitle").textContent = itemId ? "編輯材料" : "新增材料";
  $("editItemId").value = item.id || "";
  setSupplierField(item.supplier);
  setCategoryField(item.category);
  setProductField(item.product);
  $("editMaterialCode").value = item.materialCode || "";
  $("editTpcName").value = item.tpcName || "";
  $("editSpec").value = item.spec || "";
  $("editUnit").value = item.unit || "";
  $("editPrice").value = item.latestPrice;
  $("editHighestPrice").value = item.highestPrice ?? "";
  $("editDate").value = item.sourceDate || "";
  $("editHighestDate").value = item.highestPriceDate || "";
  $("editNote").value = item.note || "";
  $("deleteItemBtn").style.display = itemId && isAdmin() ? "inline-block" : "none";
  $("itemDialog").showModal();
}

async function saveItemFromDialog(event) {
  event.preventDefault();
  const targetItemId = editingItemId || $("editItemId").value.trim();
  const oldItem = targetItemId ? itemById(targetItemId) : null;
  const item = {
    item_code: oldItem?.itemCode || null,
    supplier_name: selectedSupplierName(),
    category: selectedCategoryName(),
    product: selectedProductName(),
    material_code: $("editMaterialCode").value.trim(),
    tpc_name: $("editTpcName").value.trim(),
    spec: $("editSpec").value.trim(),
    unit: $("editUnit").value.trim(),
    latest_price: numberOrNull($("editPrice").value),
    highest_price: numberOrNull($("editHighestPrice").value),
    highest_price_date: $("editHighestDate").value.trim(),
    price_status: $("editPrice").value === "" ? "待詢價" : "可採購",
    source_date: $("editDate").value.trim(),
    note: $("editNote").value.trim(),
    hidden_stock: true,
    sort_order: oldItem?.sortOrder ?? nextSortOrder(selectedSupplierName(), selectedCategoryName(), selectedProductName()),
  };
  ensureSupplierRecord(item.supplier_name);
  if (!USE_CLOUD) {
    const savedItem = {
      id: targetItemId || makeLocalId("mat"),
      itemCode: oldItem?.itemCode || "",
      supplier: item.supplier_name,
      category: item.category,
      product: item.product,
      materialCode: item.material_code,
      spec: item.spec,
      unit: item.unit,
      latestPrice: item.latest_price ?? "",
      highestPrice: item.highest_price ?? "",
      highestPriceDate: item.highest_price_date,
      priceStatus: item.price_status,
      sourceDate: item.source_date,
      note: item.note,
      tpcName: item.tpc_name,
      originalName: oldItem?.originalName || "",
      sourceFile: oldItem?.sourceFile || "",
      stock: oldItem?.stock ?? 0,
      location: oldItem?.location || "",
      sortOrder: item.sort_order,
    };
    state.items = targetItemId
      ? state.items.map((row) => row.id === targetItemId ? savedItem : row)
      : [...state.items, savedItem];
    state.items.sort(compareImportedOrder);
    saveLocalData();
    $("itemDialog").close();
    refreshAll();
    switchView("items");
    return;
  }
  let result;
  if (targetItemId) result = await db.from("materials").update(item).eq("id", targetItemId).select().single();
  else result = await db.from("materials").insert(item).select().single();
  if (result.error) return throwError(result.error);
  await insertHistory(result.data.id, targetItemId ? "update" : "insert", oldItem ? toDbMaterial(oldItem) : null, result.data);
  $("itemDialog").close();
  await loadCloudData();
  switchView("items");
}

async function deleteEditingItem(event) {
  event.preventDefault();
  if (!editingItemId || !isAdmin()) return;
  const item = itemById(editingItemId);
  if (!item || !confirm(`確定要刪除「${item.supplier} / ${item.product} / ${item.spec}」嗎？`)) return;
  if (!USE_CLOUD) {
    state.items = state.items.filter((row) => row.id !== editingItemId);
    saveLocalData();
    $("itemDialog").close();
    refreshAll();
    return;
  }
  const { error } = await db.from("materials").delete().eq("id", editingItemId);
  if (error) return throwError(error);
  await insertHistory(editingItemId, "delete", toDbMaterial(item), null);
  $("itemDialog").close();
  await loadCloudData();
}

async function saveSupplier() {
  const supplier = {
    name: $("supplierName").value.trim(),
    contact: $("supplierContact").value.trim(),
    phone: $("supplierPhone").value.trim(),
    fax: $("supplierFax").value.trim(),
    email: $("supplierEmail").value.trim(),
    address: $("supplierAddress").value.trim(),
    terms: $("supplierTerms").value.trim(),
    lead_time: $("supplierLeadTime").value.trim(),
    note: $("supplierNote").value.trim(),
  };
  if (!supplier.name) return;
  const existing = state.suppliers.find((s) => s.name === supplier.name);
  if (!USE_CLOUD) {
    const localSupplier = normalizeLocalSupplier({
      id: existing?.id,
      ...fromDbSupplier({ id: existing?.id, ...supplier }),
    });
    state.suppliers = existing
      ? state.suppliers.map((row) => row.id === existing.id ? localSupplier : row)
      : [...state.suppliers, localSupplier];
    state.suppliers.sort((a, b) => compareText(a.name, b.name));
    saveLocalData();
    refreshAll();
    return;
  }
  const result = existing
    ? await db.from("suppliers").update(supplier).eq("id", existing.id)
    : await db.from("suppliers").insert(supplier);
  if (result.error) return throwError(result.error);
  await loadCloudData();
}

function editSupplier(name) {
  const supplier = state.suppliers.find((s) => s.name === name);
  if (!supplier) return;
  $("supplierName").value = supplier.name || "";
  $("supplierContact").value = supplier.contact || "";
  $("supplierPhone").value = supplier.phone || "";
  $("supplierFax").value = supplier.fax || "";
  $("supplierEmail").value = supplier.email || "";
  $("supplierAddress").value = supplier.address || "";
  $("supplierTerms").value = supplier.terms || "";
  $("supplierLeadTime").value = supplier.leadTime || "";
  $("supplierNote").value = supplier.note || "";
  $("supplierName").focus();
}

async function seedInitialData() {
  if (!USE_CLOUD) {
    alert("這個功能只用在正式雲端版。");
    return;
  }
  const seedItems = (window.INITIAL_LOCAL_DATA?.items || []).filter((item) => !shouldExcludeMaterial(item));
  if (!seedItems.length) {
    alert("目前 data.js 裡沒有可匯入的材料資料。");
    return;
  }
  if (!confirm(`確認把目前本機版 ${seedItems.length} 筆材料資料匯入 Supabase？已存在的同廠商、品類、材料名稱、規格會更新，不會重複新增。`)) return;
  const supplierRows = supplierDefaults(seedItems).map(toDbSupplier);
  let inserted = 0;
  let updated = 0;
  for (const batch of chunks(supplierRows, 100)) {
    const { error } = await db.from("suppliers").upsert(batch, { onConflict: "name" });
    if (error) return throwError(error);
  }
  for (const [index, item] of seedItems.entries()) {
    const existing = findMatchingImportItem(item);
    const payload = toDbMaterial({
      ...item,
      sortOrder: item.sortOrder || existing?.sortOrder || nextSortOrder(item.supplier, item.category, item.product) + index / 1000,
    });
    const result = existing
      ? await db.from("materials").update(payload).eq("id", existing.id).select().single()
      : await db.from("materials").insert(payload).select().single();
    if (result.error) return throwError(result.error);
    if (existing) updated += 1;
    else inserted += 1;
  }
  alert(`目前系統資料匯入完成：新增 ${inserted} 筆，更新 ${updated} 筆。`);
  await loadCloudData();
  switchView("items");
}

async function previewExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  updateImportSteps("preview");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames.includes("標準資料") ? "標準資料" : workbook.SheetNames.find((name) => !name.includes("說明")) || workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  pendingImportRows = rows.map(excelRowToItem).filter((row) => row.supplier && (row.product || row.spec));
  $("importPreviewPanel").classList.remove("hidden");
  $("importPreviewSummary").textContent = `讀取 ${sheetName}，共 ${pendingImportRows.length} 筆。確認匯入時，已存在的同廠商、品類、材料名稱、規格會更新，不會重複新增。下方只顯示前 20 筆。`;
  $("importPreviewRows").innerHTML = pendingImportRows.slice(0, 20).map((i) => `
    <tr tabindex="0"><td>${esc(i.supplier)}</td><td>${esc(i.category)}</td><td>${esc(i.product)}</td><td>${esc(i.materialCode)}</td><td>${esc(i.spec)}</td><td>${esc(i.unit)}</td><td class="price-cell">${priceValue(i.latestPrice)}</td><td>${esc(i.sourceDate)}</td></tr>
  `).join("") || emptyRow(8);
}

async function previewShentaiPdf(event) {
  const file = event.target.files[0];
  if (!file) return;
  const preview = $("shentaiPdfPreview");
  preview.classList.remove("hidden");
  $("shentaiPdfName").textContent = file.name;
  $("shentaiPdfPeriod").textContent = detectShentaiPeriod(file.name) || "待辨識";
  $("shentaiPdfPages").textContent = "讀取中";
  $("shentaiPdfStatus").textContent = "辨識中";
  $("shentaiPdfMessage").textContent = "正在讀取 PDF，這個步驟不會修改任何材料資料。";
  $("shentaiPdfText").textContent = "";
  setShentaiSteps(2);
  try {
    if (!window.pdfjsLib) throw new Error("PDF 辨識元件尚未載入，請確認網路後重新整理。");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pageTexts = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => item.str).join(" "));
    }
    const fullText = pageTexts.join("\n");
    const period = detectShentaiPeriod(`${file.name} ${fullText}`);
    const currentPeriod = latestShentaiPeriod();
    shentaiPdfIsOlder = Boolean(period && currentPeriod && periodKey(period) < periodKey(currentPeriod));
    const priceLikeLines = fullText.split(/\n/).filter((line) => /\d/.test(line) && /(?:mm|m²|V|KV|元|\$)/i.test(line));
    $("shentaiPdfPages").textContent = `${pdf.numPages} 頁`;
    $("shentaiPdfPeriod").textContent = period || "未辨識，請人工確認";
    $("shentaiPdfStatus").textContent = shentaiPdfIsOlder ? "舊月份，禁止更新" : fullText.trim() ? "PDF 讀取成功" : "未讀到文字";
    $("shentaiPdfMessage").textContent = fullText.trim()
      ? `已讀取 ${pdf.numPages} 頁，找到約 ${priceLikeLines.length} 行可能包含規格或價格。下一階段才會與目前伸泰 ${state.items.filter((item) => item.supplier === "伸泰國際").length} 筆材料進行新增、漲價、降價比對。`
      : "這份 PDF 可能是掃描圖片，之後需要加入 OCR 才能辨識價格。";
    $("shentaiPdfText").textContent = fullText.trim().slice(0, 6000) || "沒有可顯示的文字內容。";
    shentaiParsedRows = parseShentaiPricePages(pageTexts, period || detectShentaiPeriod(file.name));
    $("shentaiCompareActions").classList.toggle("hidden", !shentaiParsedRows.length);
    $("shentaiCompareBtn").textContent = shentaiPdfIsOlder ? "查看舊月份歷史比較" : "產生價格比對預覽";
    $("shentaiPdfPreview").classList.toggle("older-period", shentaiPdfIsOlder);
    if (shentaiPdfIsOlder) {
      $("shentaiPdfMessage").textContent = `注意：這份是 ${period}，比系統目前的 ${currentPeriod} 舊，只能查看歷史價格差異，不能更新或覆蓋材料主檔。`;
    }
    $("shentaiPdfMessage").textContent += shentaiParsedRows.length
      ? ` 已整理出 ${shentaiParsedRows.length} 筆可比對價格。`
      : " 尚未整理出可比對價格，請先檢查文字預覽。";
  } catch (error) {
    $("shentaiPdfPages").textContent = "-";
    $("shentaiPdfStatus").textContent = "讀取失敗";
    $("shentaiPdfMessage").textContent = error.message || "無法讀取這份 PDF。";
    $("shentaiPdfText").textContent = "";
    $("shentaiCompareActions").classList.add("hidden");
  }
}

function parseShentaiPricePages(pageTexts, period) {
  const rows = [];
  const add = (category, product, spec, price) => rows.push({
    supplier: "伸泰國際", category, product, spec: normalizeShentaiSpec(spec),
    latestPrice: price === "另詢" ? "" : Number(String(price).replace(/,/g, "")), sourceDate: period,
  });
  pageTexts.forEach((source) => {
    const text = String(source || "").replace(/m\s*㎡/g, "m㎡").replace(/\s+/g, " ");
    if (/PVC 電線\s+CNS 679/.test(text)) {
      parseSinglePriceRows(text, (spec, price) => add("PVC電線", "PVC電線 CNS 679", spec, price));
    } else if (/PVC 電纜\s+600V/.test(text)) {
      parseMatrixRows(text, 3, ["2C", "3C", "4C"], (size, core, price) => add("PVC電纜", "PVC電纜 600V CNS 3301", `${core} x ${size}`, price));
    } else if (/25KV/.test(text)) {
      parseSinglePriceRows(text, (spec, price) => add("XLPE高壓電纜", "XLPE電纜 25KV 中性點接地", spec, price));
    } else if (/XLPE 電纜\s+600V/.test(text)) {
      parseMatrixRows(text, 4, ["1C", "2C", "3C", "4C"], (core, spec, price) => add("XLPE電纜", "XLPE電纜 600V CNS 2655", `${spec} x ${core}`, price));
      const tail = text.match(/50m㎡[\s\S]+/)?.[0] || "";
      parseSinglePriceRows(tail, (core, price) => add("XLPE電纜", "XLPE電纜 600V CNS 2655", `1C x ${core}`, price));
    } else if (/380℃/.test(text)) {
      parseSinglePriceRows(text, (spec, price) => add("耐熱電線電纜", "380℃ HR-CV 耐熱電線電纜", spec, price));
    } else if (/950℃/.test(text)) {
      parseSinglePriceRows(text, (spec, price) => add("耐燃電線電纜", "950℃ FR-CV 耐燃電線電纜", spec, price));
    } else if (/鋁箔銅網編織隔離電纜/.test(text)) {
      parseCoreMatrixRows(text, 2, ["1.25m㎡", "2m㎡"], (core, size, price) => add("隔離電纜", "PVC 鋁箔銅網編織隔離電纜 CNS 12726", `${core} x ${size}`, price));
    } else if (/PVC 控制電纜/.test(text)) {
      parseCoreMatrixRows(text, 3, ["1.25m㎡", "2m㎡", "3.5m㎡"], (core, size, price) => add("控制電纜", "PVC控制電纜 CNS 4898", `${core} x ${size}`, price));
    }
  });
  const unique = new Map();
  rows.filter((row) => row.spec).forEach((row) => unique.set(`${row.product}|${row.spec}`, row));
  return [...unique.values()];
}

function parseSinglePriceRows(text, callback) {
  const pattern = /(\d+(?:\.\d+)?\s*(?:mm|m㎡))\s+(另詢|\d[\d,]*(?:\.\d+)?)/g;
  let match;
  while ((match = pattern.exec(text))) callback(match[1], match[2]);
}

function parseMatrixRows(text, columns, labels, callback) {
  const number = "(另詢|\\d[\\d,]*(?:\\.\\d+)?)";
  const pattern = new RegExp("(\\d+(?:\\.\\d+)?m㎡)\\s+" + Array(columns).fill(number).join("\\s+"), "g");
  let match;
  while ((match = pattern.exec(text))) labels.forEach((label, index) => callback(match[1], label, match[index + 2]));
}

function parseCoreMatrixRows(text, columns, sizes, callback) {
  const number = "(另詢|\\d[\\d,]*(?:\\.\\d+)?)";
  const pattern = new RegExp("(\\d+C)\\s+" + Array(columns).fill(number).join("\\s+"), "g");
  let match;
  while ((match = pattern.exec(text))) sizes.forEach((size, index) => callback(match[1], size, match[index + 2]));
}

function normalizeShentaiSpec(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/\s*x\s*/gi, " x ").trim();
}

function shentaiCompareKey(item) {
  return `${compactSearchText(item.product)}|${compactSearchText(normalizeShentaiSpec(item.spec))}`;
}

function buildShentaiComparison() {
  const existing = state.items.filter((item) => item.supplier === "伸泰國際");
  const existingMap = new Map(existing.map((item) => [shentaiCompareKey(item), item]));
  const parsedMap = new Map(shentaiParsedRows.map((item) => [shentaiCompareKey(item), item]));
  shentaiComparisonRows = shentaiParsedRows.map((next) => {
    const current = existingMap.get(shentaiCompareKey(next));
    if (!current) return { type: "new", current: null, next };
    const oldPrice = Number(current.latestPrice || 0);
    const newPrice = Number(next.latestPrice || 0);
    const type = !next.latestPrice ? "missing" : newPrice > oldPrice ? "increase" : newPrice < oldPrice ? "decrease" : "same";
    return { type, current, next };
  });
  existing.forEach((current) => {
    if (!parsedMap.has(shentaiCompareKey(current))) shentaiComparisonRows.push({ type: "missing", current, next: null });
  });
  shentaiChangeFilter = "all";
  $("shentaiComparePanel").classList.remove("hidden");
  setShentaiSteps(3);
  renderShentaiComparison();
  $("shentaiComparePanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderShentaiComparison() {
  const labels = { increase: "漲價", decrease: "降價", new: "新增", missing: "本期未列", same: "價格相同" };
  const counts = Object.fromEntries(Object.keys(labels).map((type) => [type, shentaiComparisonRows.filter((row) => row.type === type).length]));
  $("shentaiCompareSummary").textContent = shentaiPdfIsOlder
    ? `這是舊月份歷史比較，共辨識 ${shentaiParsedRows.length} 筆；系統不會提供更新按鈕，也不會覆蓋目前伸泰資料。`
    : `新價目共辨識 ${shentaiParsedRows.length} 筆；目前伸泰材料 ${state.items.filter((item) => item.supplier === "伸泰國際").length} 筆。請先檢查，不會直接更新。`;
  $("shentaiChangeSummary").innerHTML = Object.entries(labels).map(([type, label]) => `<div class="change-count ${type}"><span>${label}</span><strong>${counts[type]}</strong></div>`).join("");
  document.querySelectorAll("[data-shentai-change]").forEach((button) => button.classList.toggle("active", button.dataset.shentaiChange === shentaiChangeFilter));
  const rows = shentaiComparisonRows.filter((row) => shentaiChangeFilter === "all" || row.type === shentaiChangeFilter);
  $("shentaiCompareRows").innerHTML = rows.map(({ type, current, next }) => {
    const oldPrice = current?.latestPrice;
    const newPrice = next?.latestPrice;
    const difference = oldPrice !== "" && oldPrice != null && newPrice !== "" && newPrice != null ? Number(newPrice) - Number(oldPrice) : null;
    const percent = difference != null && Number(oldPrice) ? difference / Number(oldPrice) * 100 : null;
    return `<tr><td><span class="change-status ${type}">${labels[type]}</span></td><td>${esc(next?.product || current?.product || "")}</td><td>${esc(next?.spec || current?.spec || "")}</td><td class="price-cell">${priceValue(oldPrice)}</td><td class="price-cell">${priceValue(newPrice)}</td><td>${difference == null ? "-" : `${difference > 0 ? "+" : ""}${money(difference)}`}</td><td>${percent == null ? "-" : `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`}</td></tr>`;
  }).join("") || emptyRow(7);
}

function detectShentaiPeriod(value) {
  const text = String(value || "");
  const compact = text.match(/(?:^|\D)(1\d{2})(0[1-9]|1[0-2])(?:[0-3]\d)?(?:\D|$)/);
  if (compact) return `${Number(compact[1]) + 1911}/${compact[2]}`;
  const roc = text.match(/(1\d{2})\s*[年/.\-]\s*(0?[1-9]|1[0-2])\s*月?/);
  if (roc) return `${Number(roc[1]) + 1911}/${String(roc[2]).padStart(2, "0")}`;
  const western = text.match(/(20\d{2})\s*[年/.\-]\s*(0?[1-9]|1[0-2])\s*月?/);
  return western ? `${western[1]}/${String(western[2]).padStart(2, "0")}` : "";
}

function latestShentaiPeriod() {
  return state.items
    .filter((item) => item.supplier === "伸泰國際" && /^\d{4}(?:\/\d{1,2})?/.test(item.sourceDate || ""))
    .map((item) => item.sourceDate)
    .sort((a, b) => periodKey(b) - periodKey(a))[0] || "";
}

function periodKey(value) {
  const match = String(value || "").match(/(\d{4})(?:\/(\d{1,2}))?/);
  return match ? Number(match[1]) * 100 + Number(match[2] || 0) : 0;
}

function setShentaiSteps(activeStep) {
  [1, 2, 3].forEach((step) => {
    const element = $(`shentaiStep${step}`);
    element.classList.toggle("active", step === activeStep);
    element.classList.toggle("done", step < activeStep);
  });
}

async function confirmExcelImport() {
  if (!pendingImportRows.length) return;
  updateImportSteps("confirm");
  const supplierRows = supplierDefaults(pendingImportRows).map(toDbSupplier);
  let inserted = 0;
  let updated = 0;
  if (!USE_CLOUD) {
    supplierDefaults(pendingImportRows).forEach((supplier) => ensureSupplierRecord(supplier.name));
    pendingImportRows.forEach((row, index) => {
      const existing = findMatchingImportItem(row);
      const savedItem = {
        id: existing?.id || makeLocalId("mat"),
        itemCode: existing?.itemCode || "",
        supplier: row.supplier,
        category: row.category,
        product: row.product,
        materialCode: row.materialCode || existing?.materialCode || "",
        spec: row.spec,
        unit: row.unit,
        latestPrice: row.latestPrice,
        sourceDate: row.sourceDate,
        highestPrice: row.highestPrice,
        highestPriceDate: row.highestPriceDate,
        priceStatus: row.priceStatus || (row.latestPrice === "" ? "待詢價" : "可採購"),
        note: row.note,
        tpcName: row.tpcName || existing?.tpcName || "",
        originalName: row.originalName || existing?.originalName || "",
        sourceFile: row.sourceFile || existing?.sourceFile || "",
        stock: existing?.stock ?? 0,
        location: existing?.location || "",
        sortOrder: row.sortOrder || existing?.sortOrder || nextSortOrder(row.supplier, row.category, row.product) + index / 1000,
      };
      if (existing) {
        updated += 1;
        state.items = state.items.map((item) => item.id === existing.id ? savedItem : item);
      } else {
        inserted += 1;
        state.items.push(savedItem);
      }
    });
    state.items.sort(compareImportedOrder);
    saveLocalData();
    alert(`Excel 匯入完成：新增 ${inserted} 筆，更新 ${updated} 筆。`);
    pendingImportRows = [];
    $("excelImportInput").value = "";
    $("importPreviewPanel").classList.add("hidden");
    updateImportSteps("upload");
    refreshAll();
    switchView("items");
    return;
  }
  for (const batch of chunks(supplierRows, 100)) {
    const { error } = await db.from("suppliers").upsert(batch, { onConflict: "name" });
    if (error) return throwError(error);
  }
  for (const [index, row] of pendingImportRows.entries()) {
    const existing = findMatchingImportItem(row);
    const payload = toDbMaterial({
      ...row,
      id: existing?.id || "",
      sortOrder: row.sortOrder || existing?.sortOrder || nextSortOrder(row.supplier, row.category, row.product) + index / 1000,
    });
    const result = existing
      ? await db.from("materials").update(payload).eq("id", existing.id).select().single()
      : await db.from("materials").insert(payload).select().single();
    if (result.error) return throwError(result.error);
    await insertHistory(result.data.id, existing ? "update" : "insert", existing ? toDbMaterial(existing) : null, result.data);
    if (existing) {
      updated += 1;
      state.items = state.items.map((item) => item.id === existing.id ? fromDbMaterial(result.data) : item);
    } else {
      inserted += 1;
      state.items.push(fromDbMaterial(result.data));
    }
  }
  alert(`Excel 匯入完成：新增 ${inserted} 筆，更新 ${updated} 筆。`);
  pendingImportRows = [];
  $("importPreviewPanel").classList.add("hidden");
  updateImportSteps("upload");
  await loadCloudData();
}

function findMatchingImportItem(row) {
  const key = materialMatchKey(row);
  return state.items.find((item) => materialMatchKey(item) === key);
}

function renderDuplicateSupplierFilter() {
  const select = $("duplicateSupplierFilter");
  if (!select) return;
  const suppliers = supplierNames();
  const preferred = suppliers.includes("申芳") ? "申芳" : "";
  const current = select.value || preferred;
  select.innerHTML = `<option value="">全部廠商</option>${suppliers.map((name) => `<option>${esc(name)}</option>`).join("")}`;
  select.value = suppliers.includes(current) ? current : "";
}

function checkDuplicateMaterials() {
  renderDuplicateSupplierFilter();
  const supplier = $("duplicateSupplierFilter").value;
  duplicateGroups = findDuplicateGroups(supplier);
  $("duplicatePanel").classList.remove("hidden");
  renderDuplicateGroups();
}

function findDuplicateGroups(supplier = "") {
  const groups = new Map();
  state.items
    .filter((item) => !supplier || item.supplier === supplier)
    .forEach((item) => {
      const key = materialMatchKey(item);
      if (!key.replace(/\|/g, "")) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
  return [...groups.values()]
    .filter((items) => items.length > 1)
    .map((items) => {
      const keeper = pickDuplicateKeeper(items);
      return {
        keeper,
        items,
        duplicates: items.filter((item) => item.id !== keeper.id),
      };
    })
    .sort((a, b) => compareImportedOrder(a.keeper, b.keeper));
}

function renderDuplicateGroups() {
  const supplier = $("duplicateSupplierFilter").value || "全部廠商";
  const duplicateCount = duplicateGroups.reduce((sum, group) => sum + group.duplicates.length, 0);
  const canClean = duplicateGroups.length > 0 && isAdmin();
  $("cleanDuplicateBtn").classList.toggle("hidden", !canClean);
  if (!duplicateGroups.length) {
    $("duplicateSummary").textContent = `${supplier} 沒有找到重複材料。`;
    $("duplicateRows").innerHTML = emptyRow(8);
    return;
  }
  $("duplicateSummary").textContent = `${supplier} 找到 ${duplicateGroups.length} 組重複，共 ${duplicateCount} 筆可清理。系統會保留每組資料最完整的一筆。`;
  $("duplicateRows").innerHTML = duplicateGroups.map((group) => {
    const item = group.keeper;
    return `
      <tr tabindex="0">
        <td>${esc(item.supplier)}</td>
        <td>${esc(item.category)}</td>
        <td>${esc(item.product)}</td>
        <td>${esc(item.materialCode)}</td>
        <td>${esc(item.spec)}</td>
        <td>${group.items.length}</td>
        <td class="price-cell">${priceValue(item.latestPrice)}</td>
        <td>${esc(item.sourceDate)}</td>
      </tr>
    `;
  }).join("");
}

function pickDuplicateKeeper(items) {
  return [...items].sort((a, b) => duplicateKeeperScore(b) - duplicateKeeperScore(a) || compareImportedOrder(a, b))[0];
}

function duplicateKeeperScore(item) {
  return (item.latestPrice !== "" ? 100000000 : 0)
    + dateRank(item.sourceDate)
    + (item.highestPrice !== "" ? 100000 : 0)
    + (item.highestPriceDate ? 10000 : 0)
    + (item.materialCode ? 1000 : 0)
    + (item.unit ? 100 : 0)
    + (item.note ? 10 : 0);
}

function dateRank(value) {
  const text = String(value || "").trim();
  const digits = text.match(/\d+/g);
  if (!digits) return 0;
  let [year, month = "01", day = "01"] = digits;
  if (Number(year) < 1911 && text.includes("年")) year = String(Number(year) + 1911);
  if (year.length === 3) year = String(Number(year) + 1911);
  if (year.length === 2) year = `20${year}`;
  return Number(`${year.padStart(4, "0")}${month.padStart(2, "0")}${day.padStart(2, "0")}`) || 0;
}

async function cleanDuplicateMaterials() {
  if (!duplicateGroups.length) return;
  if (!isAdmin()) {
    alert("只有管理者可以清理重複材料。");
    return;
  }
  const supplier = $("duplicateSupplierFilter").value || "全部廠商";
  const deleteCount = duplicateGroups.reduce((sum, group) => sum + group.duplicates.length, 0);
  if (!confirm(`確認清理 ${supplier} 的重複材料？會保留每組資料最完整的一筆，刪除 ${deleteCount} 筆重複資料。`)) return;
  if (!USE_CLOUD) {
    const deleteIds = new Set(duplicateGroups.flatMap((group) => group.duplicates.map((item) => item.id)));
    state.items = state.items.filter((item) => !deleteIds.has(item.id));
    saveLocalData();
    alert(`重複材料清理完成：刪除 ${deleteCount} 筆。`);
    duplicateGroups = [];
    refreshAll();
    checkDuplicateMaterials();
    return;
  }
  for (const group of duplicateGroups) {
    for (const item of group.duplicates) {
      const { error } = await db.from("materials").delete().eq("id", item.id);
      if (error) return throwError(error);
      await insertHistory(item.id, "delete", toDbMaterial(item), null);
    }
  }
  alert(`重複材料清理完成：刪除 ${deleteCount} 筆。`);
  duplicateGroups = [];
  await loadCloudData();
  checkDuplicateMaterials();
}

function clearLocalData() {
  if (USE_CLOUD) {
    alert("雲端版不能用這個按鈕清空資料。");
    return;
  }
  if (!confirm("確定要清空這份正式整理版的本機資料？原本雲端版不會受影響。")) return;
  state.items = [];
  state.suppliers = [];
  pendingImportRows = [];
  duplicateGroups = [];
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  localStorage.setItem(LOCAL_SEED_DONE_KEY, "1");
  $("excelImportInput").value = "";
  $("importPreviewPanel").classList.add("hidden");
  $("duplicatePanel").classList.add("hidden");
  resetMaterialFilters();
  refreshAll();
  switchView("dashboard");
}

function updateImportSteps(step) {
  const steps = { upload: 1, preview: 2, confirm: 3 };
  const activeStep = steps[step] || 1;
  [1, 2, 3].forEach((number) => {
    const el = $(`importStep${number}`);
    el.classList.toggle("active", number === activeStep);
    el.classList.toggle("done", number < activeStep);
  });
}

function fromDbMaterial(row) {
  return {
    id: row.id,
    itemCode: row.item_code || "",
    supplier: row.supplier_name || "",
    category: row.category || "",
    product: row.product || "",
    materialCode: row.material_code || "",
    spec: row.spec || "",
    unit: row.unit || "",
    latestPrice: row.latest_price ?? "",
    highestPrice: row.highest_price ?? "",
    highestPriceDate: row.highest_price_date || "",
    priceStatus: row.price_status || (row.latest_price == null ? "待詢價" : "可採購"),
    sourceDate: row.source_date || "",
    note: row.note || "",
    tpcName: row.tpc_name || "",
    originalName: row.original_name || "",
    sourceFile: row.source_file || "",
    stock: row.stock ?? 0,
    location: row.location || "",
    sortOrder: row.sort_order ?? "",
  };
}

function toDbMaterial(item) {
  return {
    item_code: item.itemCode || item.itemId || null,
    supplier_name: item.supplier || "",
    category: item.category || "",
    product: item.product || "",
    material_code: item.materialCode || "",
    spec: item.spec || "",
    unit: item.unit || "",
    latest_price: item.latestPrice === "" ? null : Number(item.latestPrice),
    source_date: item.sourceDate || "",
    highest_price: item.highestPrice === "" ? null : Number(item.highestPrice),
    highest_price_date: item.highestPriceDate || "",
    price_status: item.priceStatus || (item.latestPrice === "" ? "待詢價" : "可採購"),
    location: item.location || "",
    stock: Number(item.stock || 0),
    note: item.note || "",
    hidden_stock: true,
    tpc_name: item.tpcName || "",
    original_name: item.originalName || "",
    source_file: item.sourceFile || "",
    sort_order: item.sortOrder === "" || item.sortOrder == null ? null : Number(item.sortOrder),
  };
}

function seedRowToDb(row) {
  return toDbMaterial(normalizeSeedItem(row));
}

function fromDbSupplier(row) {
  return {
    id: row.id,
    name: row.name || "",
    contact: row.contact || "",
    phone: row.phone || "",
    fax: row.fax || "",
    email: row.email || "",
    address: row.address || "",
    terms: row.terms || "",
    leadTime: row.lead_time || "",
    note: row.note || "",
  };
}

function toDbSupplier(row) {
  return {
    name: row.name || row.supplier || "",
    contact: row.contact || "",
    phone: row.phone || "",
    fax: row.fax || "",
    email: row.email || "",
    address: row.address || "",
    terms: row.terms || "",
    lead_time: row.leadTime || "",
    note: row.note || "",
  };
}

function excelRowToItem(row) {
  return {
    supplier: String(row["廠商"] || "").trim(),
    category: String(row["品類"] || "").trim(),
    product: String(row["材料名稱"] || row["品名"] || "").trim(),
    materialCode: String(row["材料編號"] || "").trim(),
    spec: String(row["規格"] || "").trim(),
    unit: String(row["單位"] || "").trim(),
    latestPrice: numberString(row["最新單價"] ?? row["單價"]),
    sourceDate: String(row["價格日期"] || row["日期"] || "").trim(),
    highestPrice: numberString(row["最高價格"]),
    highestPriceDate: String(row["最高價格日期"] || "").trim(),
    priceStatus: row["最新單價"] === "" || row["最新單價"] == null ? "待詢價" : "可採購",
    note: String(row["備註"] || "").trim(),
    tpcName: String(row["台塑材料名稱"] || row["備註(台塑材料名稱)"] || "").trim(),
    originalName: String(row["原始品名"] || "").trim(),
    sourceFile: String(row["來源檔案"] || "").trim(),
  };
}

function normalizeSeedItem(item) {
  const price = item.latestPrice === "" || item.latestPrice == null ? "" : Number(item.latestPrice);
  const highestPrice = item.highestPrice === "" || item.highestPrice == null ? "" : Number(item.highestPrice);
  return {
    id: "",
    itemCode: item.itemId || "",
    supplier: item.supplier || "",
    category: item.category || "",
    product: item.product || "",
    materialCode: item.materialCode || item.itemCode || item["材料編號"] || "",
    spec: item.spec || "",
    unit: item.unit || "",
    latestPrice: Number.isFinite(price) ? price : "",
    highestPrice: Number.isFinite(highestPrice) ? highestPrice : "",
    highestPriceDate: item.highestPriceDate || "",
    priceStatus: Number.isFinite(price) ? "可採購" : "待詢價",
    sourceDate: item.sourceDate || "",
    note: item.note || "",
    tpcName: item.tpcName || item.tpcMaterialName || item["台塑材料名稱"] || "",
    originalName: item.originalName || item["原始品名"] || "",
    sourceFile: item.sourceFile || item["來源檔案"] || "",
    stock: item.stock || 0,
    location: item.location || "",
    sortOrder: item.sortOrder ?? sortOrderFromItemCode(item.itemId || item.itemCode, 0),
  };
}

function supplierDefaults(items) {
  return [...new Set(items.map((item) => item.supplier).filter(Boolean))]
    .sort()
    .map((name) => ({ name, contact: "", phone: "", fax: "", email: "", address: "", terms: "", leadTime: "", note: "" }));
}

function supplierNames() {
  return [...new Set([...state.suppliers.map((supplier) => supplier.name), ...state.items.map((item) => item.supplier)].filter(Boolean))].sort();
}

function categoryNamesForSupplier(supplier) {
  if (!supplier) return [];
  return [...new Set(state.items.filter((item) => item.supplier === supplier).map((item) => item.category).filter(Boolean))].sort();
}

function productNamesForSupplierCategory(supplier, category) {
  if (!supplier || !category) return [];
  return [...new Set(state.items.filter((item) => item.supplier === supplier && item.category === category).map((item) => item.product).filter(Boolean))].sort();
}

function setSupplierField(name) {
  renderOptions();
  if (supplierNames().includes(name)) {
    $("editSupplier").value = name;
    $("editSupplierCustom").value = "";
  } else {
    $("editSupplier").value = "__custom__";
    $("editSupplierCustom").value = name || "";
  }
  toggleCustomSupplierField();
}

function setCategoryField(name) {
  const categories = categoryNamesForSupplier(selectedSupplierName());
  $("editCategory").innerHTML = `${categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("")}<option value="__custom__">＋新品類</option>`;
  if (categories.includes(name)) {
    $("editCategory").value = name;
    $("editCategoryCustom").value = "";
  } else if (!name && categories.length) {
    $("editCategory").value = categories[0];
    $("editCategoryCustom").value = "";
  } else {
    $("editCategory").value = "__custom__";
    $("editCategoryCustom").value = name || "";
  }
  toggleCustomCategoryField();
}

function setProductField(name) {
  const products = productNamesForSupplierCategory(selectedSupplierName(), selectedCategoryName());
  $("editProduct").innerHTML = `${products.map((product) => `<option value="${esc(product)}">${esc(product)}</option>`).join("")}<option value="__custom__">＋直接輸入新名稱</option>`;
  if (products.includes(name)) {
    $("editProduct").value = name;
  } else if (!name && products.length) {
    $("editProduct").value = products[0];
  } else {
    $("editProduct").value = "__custom__";
  }
  $("editProductName").value = name || ($("editProduct").value === "__custom__" ? "" : $("editProduct").value);
}

function selectedSupplierName() {
  return $("editSupplier").value === "__custom__" ? $("editSupplierCustom").value.trim() : $("editSupplier").value.trim();
}

function selectedCategoryName() {
  return $("editCategory").value === "__custom__" ? $("editCategoryCustom").value.trim() : $("editCategory").value.trim();
}

function selectedProductName() {
  return $("editProductName").value.trim();
}

function toggleCustomSupplierField() {
  const isCustom = $("editSupplier").value === "__custom__";
  $("customSupplierField").style.display = isCustom ? "block" : "none";
  if (isCustom) $("editSupplierCustom").focus();
}

function toggleCustomCategoryField() {
  const isCustom = $("editCategory").value === "__custom__";
  $("customCategoryField").style.display = isCustom ? "block" : "none";
  if (isCustom) $("editCategoryCustom").focus();
}

function syncProductNameFromSelect() {
  const selected = $("editProduct").value;
  $("editProductName").value = selected === "__custom__" ? "" : selected;
  $("editProductName").focus();
}

function ensureSupplierRecord(name) {
  if (!name || state.suppliers.some((supplier) => supplier.name === name)) return;
  state.suppliers.push({ name, contact: "", phone: "", fax: "", email: "", address: "", terms: "", leadTime: "", note: "" });
  if (!USE_CLOUD) {
    state.suppliers.sort((a, b) => compareText(a.name, b.name));
    saveLocalData();
    return;
  }
  db.from("suppliers").upsert({ name }, { onConflict: "name" }).then(({ error }) => { if (error) console.warn(error); });
}

function itemById(itemId) {
  return state.items.find((i) => i.id === itemId);
}

function itemLabel(item) {
  if (!item) return "";
  return [item.category, item.product, item.materialCode, item.spec].filter(Boolean).join("｜");
}

function exportCsv() {
  const headers = ["廠商", "品類", "材料名稱", "材料編號", "規格", "單位", "最新單價", "價格日期", "最高價格", "最高價格日期", "台塑材料名稱", "狀態", "備註", "原始品名", "來源檔案"];
  const rows = state.items.map((i) => [i.supplier, i.category, i.product, i.materialCode, i.spec, i.unit, i.latestPrice, i.sourceDate, i.highestPrice, i.highestPriceDate, i.tpcName, i.priceStatus, i.note, i.originalName, i.sourceFile]);
  download("工程材料主檔.csv", [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
}

async function insertHistory(materialId, action, oldData, newData) {
  if (!USE_CLOUD) return;
  const { error } = await db.from("material_history").insert({
    material_id: materialId,
    action,
    old_data: oldData,
    new_data: newData,
    changed_by: state.user.id,
  });
  if (error) console.warn(error);
}

function throwError(error) {
  console.error(error);
  alert(error.message || "操作失敗");
}

function chunks(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function numberOrNull(value) {
  return value === "" || value == null ? null : Number(value);
}

function numberString(value) {
  if (value === "" || value == null) return "";
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : "";
}

function materialMatchKey(item) {
  return [
    item.supplier,
    item.category,
    item.product,
    item.materialCode,
    item.spec,
  ].map(normalizeMatchText).join("|");
}

function normalizeMatchText(value) {
  return String(value || "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function statusBadge(status) {
  const cls = ["待詢價", "待備料", "待下單"].includes(status) ? "status pending" : "status";
  return `<span class="${cls}">${esc(status)}</span>`;
}

function emptyRow(cols) {
  return `<tr><td colspan="${cols}" class="muted">目前沒有資料</td></tr>`;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

init();
