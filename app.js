const SUPABASE_URL = "https://ajfqpiirhsrqcsjbrjln.supabase.co";
const SUPABASE_KEY = "sb_publishable_PaiEugSpjLMXk-QfWTCbmA_-RXVNfPv";
const USE_CLOUD = true;
const LOCAL_STORAGE_KEY = "vendor-material-system-blank-reimport-v14";
const LOCAL_SEED_DONE_KEY = "vendor-material-system-blank-reimport-seeded-v14";

const db = USE_CLOUD ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
let state = { items: [], suppliers: [], profile: null, user: null };
let activeView = "dashboard";
let editingItemId = null;
let pendingImportRows = [];
let itemDisplayMode = "simple";
let selectedItemId = null;
let duplicateGroups = [];
let keyboardCursorElement = null;
let keyboardEditMode = false;
let searchAllSuppliers = false;
const ENABLE_ERP_CURSOR = false;

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
  $("editProduct").addEventListener("change", toggleCustomProductField);
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
  $("confirmExcelImportBtn").addEventListener("click", confirmExcelImport);
  $("checkDuplicateBtn").addEventListener("click", checkDuplicateMaterials);
  $("cleanDuplicateBtn").addEventListener("click", cleanDuplicateMaterials);
  $("clearLocalDataBtn")?.addEventListener("click", clearLocalData);
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
    || compareSortOrder(a.sortOrder, b.sortOrder)
    || compareItemCode(a.itemCode, b.itemCode)
    || compareText(a.spec, b.spec);
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
  const titleMap = { dashboard: "總覽", items: "材料主檔", suppliers: "廠商資料", settings: "資料工具", help: "使用說明" };
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
  if (view === "settings") {
    updateImportSteps("upload");
    renderDuplicateSupplierFilter();
  }
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
  const q = $("itemSearch").value.trim().toLowerCase();
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
    const hay = `${i.supplier} ${i.category} ${i.product} ${i.materialCode} ${i.spec} ${i.note} ${i.tpcName} ${i.originalName} ${i.sourceFile}`.toLowerCase();
    return (!q || hay.includes(q))
      && (!effectiveSupplier || i.supplier === effectiveSupplier)
      && (!effectiveCategory || i.category === effectiveCategory)
      && (!effectiveProduct || i.product === effectiveProduct)
      && (!status || i.priceStatus === status);
  });
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
    $("itemTableWrap").classList.remove("hidden");
    $("itemCards").innerHTML = renderGlobalSearchHeader(items);
    $("itemTableHead").innerHTML = fullItemHeader();
    $("itemRows").innerHTML = renderFullItemRows(items, false);
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
    selectedItemId = row.dataset.selectItem;
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
  const folders = supplierNames().map((name) => {
    const items = state.items.filter((item) => item.supplier === name);
    const hay = items.map((item) => `${item.supplier} ${item.category} ${item.product} ${item.materialCode} ${item.spec} ${item.note} ${item.tpcName}`).join(" ").toLowerCase();
    const categoryCount = new Set(items.map((item) => item.category).filter(Boolean)).size;
    const productCount = new Set(items.map((item) => item.product).filter(Boolean)).size;
    const pendingCount = items.filter((item) => item.priceStatus === "待詢價").length;
    const latestDate = items.map((item) => item.sourceDate).filter(Boolean).sort().at(-1) || "未填日期";
    return { name, itemCount: items.length, categoryCount, productCount, pendingCount, latestDate, visible: !q || hay.includes(q) };
  }).filter((folder) => folder.visible);
  return `
    <section class="supplier-folder-view">
      <div class="material-guide">
        <div><strong>1</strong><span>選廠商</span></div>
        <div><strong>2</strong><span>選品類 / 材料名稱</span></div>
        <div><strong>3</strong><span>看最新單價報價</span></div>
      </div>
      <div class="supplier-folder-head">
        <div>
          <strong>廠商資料夾</strong>
          <p>知道廠商就直接點進去；不知道廠商可以先用上方搜尋找材料名稱、規格或材料編號。</p>
        </div>
        <span>${folders.length} 間廠商</span>
      </div>
      <div class="supplier-folder-grid">
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
  resetMaterialFilters();
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
  const selected = selectedItemForList(items);
  const supplier = $("supplierFilter").value;
  const supplierItems = state.items.filter((item) => item.supplier === supplier);
  const activeCategory = $("categoryFilter").value;
  const activeProduct = $("productFilter").value;
  const categories = supplierCategories(supplierItems);
  const products = activeCategory ? supplierProducts(supplierItems, activeCategory) : [];
  if (!supplierItems.length) return `<div class="empty-card muted">目前沒有資料</div>`;
  return `
    <div class="material-breadcrumb">
      <button class="back-folder-btn" data-back-suppliers type="button">← 回廠商資料夾</button>
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
  })).sort((a, b) => compareSortOrder(a.firstOrder, b.firstOrder) || compareText(a.category, b.category) || compareText(a.product, b.product));
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
    .sort((a, b) => compareSortOrder(a.firstOrder, b.firstOrder) || compareText(a.name, b.name));
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
    .sort((a, b) => compareSortOrder(a.firstOrder, b.firstOrder) || compareText(a.name, b.name));
}

function uniqueNamesByImportedOrder(items, field) {
  const groups = new Map();
  items.forEach((item) => {
    const name = item[field] || "";
    if (!name) return;
    groups.set(name, Math.min(groups.get(name) ?? Number.MAX_SAFE_INTEGER, orderValue(item)));
  });
  return [...groups.entries()]
    .sort((a, b) => compareSortOrder(a[1], b[1]) || compareText(a[0], b[0]))
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
    <button class="primary detail-edit-btn" data-edit="${item.id}">編輯這筆材料</button>
  `;
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
  if (canSort) {
    $("sortHint").textContent = "排序：可使用每筆右側的 ↑ ↓ 調整順序，系統會自動儲存。";
    $("sortHint").classList.add("ready");
    return;
  }
  $("sortHint").classList.remove("ready", "saved");
  if (!supplier || !category || !product) {
    $("sortHint").textContent = supplier ? "排序：請再選定品類、材料名稱。" : "請先選擇廠商，系統才會顯示材料。";
  } else if (hasSearch || status) {
    $("sortHint").textContent = "排序：請清空搜尋欄並將狀態改為全部狀態。";
  } else {
    $("sortHint").textContent = "排序：目前無可排序資料。";
  }
}

function canManualSort() {
  return Boolean($("supplierFilter").value && $("categoryFilter").value && $("productFilter").value && !$("itemSearch").value.trim() && !$("statusFilter").value);
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
  const item = itemId ? itemById(itemId) : {
    id: "", supplier: supplierNames()[0] || "", category: "", product: "", materialCode: "", spec: "", unit: "PC",
    latestPrice: "", highestPrice: "", highestPriceDate: "", sourceDate: today, note: "", sortOrder: "",
  };
  $("itemDialogTitle").textContent = itemId ? "編輯材料" : "新增材料";
  $("editItemId").value = item.id || "";
  setSupplierField(item.supplier);
  setCategoryField(item.category);
  setProductField(item.product);
  $("editMaterialCode").value = item.materialCode || "";
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
      tpcName: oldItem?.tpcName || "",
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
    alert("這份是正式整理版，不會匯入舊版初始資料。請使用「上傳 Excel 預覽」。");
    return;
  }
  if (!confirm("確認把目前 data.js 內的初始資料匯入 Supabase？已存在的 item_code 會略過。")) return;
  const existingCodes = new Set(state.items.map((item) => item.itemCode).filter(Boolean));
  const incoming = (window.INITIAL_RECORDS || []).filter((row) => !existingCodes.has(row.itemId)).map(seedRowToDb);
  const supplierRows = supplierDefaults((window.INITIAL_RECORDS || []).map(normalizeSeedItem)).map(toDbSupplier);
  for (const batch of chunks(supplierRows, 100)) {
    const { error } = await db.from("suppliers").upsert(batch, { onConflict: "name" });
    if (error) return throwError(error);
  }
  for (const batch of chunks(incoming, 100)) {
    const { error } = await db.from("materials").insert(batch);
    if (error) return throwError(error);
  }
  alert(`初始資料匯入完成：${incoming.length} 筆`);
  await loadCloudData();
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
  $("editProduct").innerHTML = `${products.map((product) => `<option value="${esc(product)}">${esc(product)}</option>`).join("")}<option value="__custom__">＋新材料名稱</option>`;
  if (products.includes(name)) {
    $("editProduct").value = name;
    $("editProductCustom").value = "";
  } else if (!name && products.length) {
    $("editProduct").value = products[0];
    $("editProductCustom").value = "";
  } else {
    $("editProduct").value = "__custom__";
    $("editProductCustom").value = name || "";
  }
  toggleCustomProductField();
}

function selectedSupplierName() {
  return $("editSupplier").value === "__custom__" ? $("editSupplierCustom").value.trim() : $("editSupplier").value.trim();
}

function selectedCategoryName() {
  return $("editCategory").value === "__custom__" ? $("editCategoryCustom").value.trim() : $("editCategory").value.trim();
}

function selectedProductName() {
  return $("editProduct").value === "__custom__" ? $("editProductCustom").value.trim() : $("editProduct").value.trim();
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

function toggleCustomProductField() {
  const isCustom = $("editProduct").value === "__custom__";
  $("customProductField").style.display = isCustom ? "block" : "none";
  if (isCustom) $("editProductCustom").focus();
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
