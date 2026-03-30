// ===== LOADER ELEMENTS =====
const startupLoader = document.getElementById("startupLoader");
const dataLoadingOverlay = document.getElementById("dataLoadingOverlay");
const tableBody = document.querySelector("#dataGrid tbody");

// ===== DATA LOADER =====
function showDataLoader(message = "Loading data...") {
  if (!dataLoadingOverlay) return;

  const text = dataLoadingOverlay.querySelector(".loading-text");
  if (text) text.textContent = message;

  dataLoadingOverlay.classList.remove("hide");
  dataLoadingOverlay.style.display = "flex";
}

function hideDataLoader() {
  if (!dataLoadingOverlay) return;

  dataLoadingOverlay.classList.add("hide");

  setTimeout(() => {
    dataLoadingOverlay.style.display = "none";
  }, 300);
}

// ===== STARTUP LOADER =====
function hideStartupLoader() {
  if (!startupLoader) return;

  startupLoader.classList.add("hide");

  setTimeout(() => {
    startupLoader.style.display = "none";
  }, 300);
}

// ===== SIMPLE TABLE RENDER =====
function renderTable(records) {
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (!Array.isArray(records) || records.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:20px;">
          No records found
        </td>
      </tr>
    `;
    return;
  }

  records.forEach((row, i) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${row["EMPLOYEE NAME"] || row["EMPLOYEE NAME "] || ""}</td>
      <td>${row["GENDER"] || ""}</td>
      <td>${row["TYPE OF LEAVE"] || ""}</td>
      <td>${row["DIVISION"] || ""}</td>
      <td>${row["DATES"] || ""}</td>
      <td>${row["LEAVE HOURS"] || ""}</td>
      <td>${row["DATE CREATED"] || row["DATE RELEASED"] || ""}</td>
      <td>${row["REMARKS"] || ""}</td>
      <td>${row["ACTIONS"] || ""}</td>
    `;

    tableBody.appendChild(tr);
  });
}

// ===== LOAD DATA =====
async function loadDataFromSheet(showLoader = true) {
  const searchInput = document.getElementById("searchBox");

  if (isSearchActive || (searchInput && searchInput.value.trim() !== "")) {
    console.log("Auto-refresh paused: Search results are locked.");
    return;
  }

  try {
    if (showLoader) {
      showDataLoader("Loading data...");
    }

    const res = await fetch(`${googleSheetsUrl}?t=${Date.now()}`, {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`HTTP error: ${res.status}`);
    }

    const data = await res.json();

    allRecords = Array.isArray(data)
      ? data.map((row, i) => ({
          ...row,
          rowIndex: i + 2
        }))
      : [];

    if (!isTransitioning) {
      renderTable(allRecords);
    }

    hideDataLoader();
    hideStartupLoader();

  } catch (err) {
    console.error("Load error:", err);
    hideDataLoader();

    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center; color:red; padding:20px;">
            Failed to load data
          </td>
        </tr>
      `;
    }

    // optional: also hide startup loader even on error
    hideStartupLoader();
  }
}

// ===== STARTUP =====
document.addEventListener("DOMContentLoaded", async () => {
  try {
    showDataLoader("Loading data...");
    await loadOfficialEmployees();
    await loadDataFromSheet(true);
  } catch (e) {
    console.error(e);
    hideDataLoader();
    hideStartupLoader();
  }
});

// ===== AUTO REFRESH =====
setInterval(() => {
  if (!isSearchActive && !isManualSearchPaused && !isUpdatingRecord && !isTransitioning) {
    loadDataFromSheet(false);
  }
}, 15000);
