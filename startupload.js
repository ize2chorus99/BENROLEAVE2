// ===== LOADER =====
const dataLoadingOverlay = document.getElementById("dataLoadingOverlay");

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

// ===== CHECK IF TABLE HAS DATA =====


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

    const data = await res.json();

    allRecords = Array.isArray(data)
      ? data.map((row, i) => ({
          ...row,
          rowIndex: i + 2
        }))
      : [];

    // ✅ RENDER TABLE
    if (!isTransitioning) {
      
    }

    // ✅ CLOSE LOADER AFTER RENDER
    setTimeout(closeLoaderWhenGridHasData, 50);
    setTimeout(closeLoaderWhenGridHasData, 200);

  } catch (err) {
    console.error("Load error:", err);
    hideDataLoader();
  }
}

// ===== STARTUP =====
document.addEventListener("DOMContentLoaded", async () => {
  showDataLoader("Loading data...");
  await loadOfficialEmployees();
  await loadDataFromSheet(true);
});

// ===== AUTO REFRESH (NO LOADER) =====
setInterval(() => {
  if (!isSearchActive && !isManualSearchPaused && !isUpdatingRecord && !isTransitioning) {
    loadDataFromSheet(false);
  }
}, 15000);


function closeStartupLoaderIfGridHasData() {
  const loader = document.getElementById("startupLoader");
  const rows = document.querySelectorAll("#dataGrid tbody tr");

  if (!loader) return;

  if (rows.length > 0) {
    loader.classList.add("hide");

    setTimeout(() => {
      loader.style.display = "none";
    }, 300);
  }
}