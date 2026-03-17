// ===== CONFIG =====
const googleSheetsUrl = "https://script.google.com/macros/s/AKfycbwpNM-j20xXFS-N3a-JtZXhFSfy1h7OICg-VZsK_8JP8FHuwj6Me_gHpTDeN8qSVRE/exec";
const employeeListUrl = "https://script.google.com/macros/s/AKfycbz45A4WQebeP0l1HXGmb-372xqnJI_PzSAsnBrdPT__CEolhzerDVDrM5gTRNmSpe-c/exec";


const saveBtn = document.getElementById("saveBtn");
const modal = document.getElementById("modalNotification");
const spinner = modal?.querySelector(".spinner");
const checkmark = modal?.querySelector(".checkmark");
const modalMessage = document.getElementById("modalMessage");
const okBtn = document.getElementById("notificationOkBtn");
const deleteBtn = document.getElementById("deleteBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");


let currentEditRowIndex = null;

let allRecords = [];
let isSearchActive = false;
let isManualSearchPaused = false;
let duplicateIndex = new Map();
let officialEmployees = [];
let isUpdatingRecord = false; 

// INTERNET STATUS
let internetPaused = false;
let retryAttempts = 0;
let reconnectTimer = null;

let internetModal;
let retryCount;

let lockedRowIndex = null;


const searchInput = document.getElementById("searchBox");

// ===== SICK LEAVE TOGGLE LOGIC =====
const typeDropdown = document.getElementById("TYPEOFDOCUMENT");
const illnessInput = document.getElementById("document");

if (typeDropdown && illnessInput) {
  // Disable illness input by default
  illnessInput.disabled = true;

  typeDropdown.addEventListener("change", () => {
    if (typeDropdown.value.toUpperCase() === "SICK LEAVE") {
      illnessInput.disabled = false;
      illnessInput.style.backgroundColor = "#fff";
    } else {
      illnessInput.disabled = true;
      illnessInput.value = ""; // Clear if user switches away from Sick Leave
      illnessInput.style.backgroundColor = "#f0f0f0";
    }
  });
}

// ===== FIXED MODAL OK BUTTON =====
okBtn.addEventListener("click", () => {
  // If OK is disabled/hidden, do nothing (still saving)
  if (okBtn.disabled) return;

  modal.classList.remove("show");
  modal.style.display = "none";
  if (checkmark) checkmark.style.opacity = 0;
});

// ===== FLATPICKR =====
const picker = flatpickr("#multiDateTime", {
  mode: "multiple",
  dateFormat: "M j, Y"
});

// --- DATE HELPERS (DEDUP + NORMALIZE) ---
const dateKey = (d) => {
  // stable key: YYYY-MM-DD (local)
  const x = new Date(d);
  x.setHours(0,0,0,0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const uniqueDatesFromPicker = (pickerInstance) => {
  const map = new Map(); // key => Date
  (pickerInstance?.selectedDates || []).forEach(d => {
    const k = dateKey(d);
    if (!map.has(k)) map.set(k, new Date(d));
  });
  return [...map.values()].sort((a,b) => a - b);
};

const parseAndDedupeDateString = (raw) => {

  if (!raw) return [];

  const parts = raw.split(/,\s(?=[A-Z]{3}\s\d{1,2},)/g);

  const map = new Map();

  parts.forEach(p => {
    const d = new Date(p.trim());
    if (!isNaN(d)) {
      const k = dateKey(d);
      if (!map.has(k)) map.set(k, d);
    }
  });

  return [...map.values()].sort((a,b)=>a-b);
};

const formatDatesForSaving = (datesArr) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
  return datesArr.map(d => formatter.format(d).toUpperCase()).join(", ");
};

// ===== COLLECT FORM DATA =====
function collectFormData() {
  const name = document.getElementById("client")?.value.trim() || "";
  const gender = document.getElementById("GENDER")?.value.trim() || "";
  const type = document.getElementById("TYPEOFDOCUMENT")?.value.trim() || "";
  const illness = document.getElementById("document")?.value.trim() || "";
  const division = document.getElementById("division")?.value.trim() || "";
  const dateReleased = document.getElementById("dateReleased")?.value.trim() || "";
  const mgmdSub = document.getElementById("mgmd-sub")?.value.trim() || "";

  const unique = uniqueDatesFromPicker(picker);
  const dates = formatDatesForSaving(unique);

  let finalType = type;
  if (type.toUpperCase() === "SICK LEAVE" && illness) {
    finalType = `${type} - ${illness}`;
  }

  return {
    employee: name,
    gender,
    leaveType: finalType,
    division,
    mgmdSub,
    dates,
    dateReleased,
  };
}

// ===== VALIDATION =====
function validateForm(d) {
  const requiredFields = [
    { key: "employee", label: "Employee Name" },
    { key: "gender", label: "Gender" },
    { key: "leaveType", label: "Type of Leave" },
    { key: "division", label: "Division" },
    { key: "dates", label: "Dates" },
    { key: "dateReleased", label: "Date Created" }
  ];
  const missing = requiredFields.filter(f => !d[f.key] || d[f.key].length === 0);
  return { isValid: missing.length === 0, missing };
}

// ===== SAVE LOGIC =====
// ===== FINAL FIXED SAVE LOGIC =====
// ===== FINAL FIXED SAVE LOGIC =====
// ===== FINAL FIXED SAVE LOGIC =====
// ===== UPDATED SAVE LOGIC =====



saveBtn.addEventListener("click", async () => {



  // ===== 1. COLLECT DATA =====
  const data = collectFormData();
  const validation = validateForm(data);
 
  if (!validation.isValid) {
    alert("Please fill: " + validation.missing.map(f => f.label).join(", "));
    return;
  }

  // ===== 2. SHOW MODAL IMMEDIATELY =====
  showSavingModal("Checking records...");



  // ===== 3. LOAD RECORDS IF NEEDED =====
  if (currentEditRowIndex == null && allRecords.length === 0) {
    await loadDataFromSheet();
  }

  const currentName = data.employee.trim().toLowerCase();
  const selectedDates = uniqueDatesFromPicker(picker).map(d => dateKey(d));

  let duplicateFound = null;

  // ===== DUPLICATE CHECK (UNCHANGED) =====
  if (currentEditRowIndex == null) {

    for (let record of allRecords) {

  const existingName = (
    record["EMPLOYEE NAME"] ||
    record["EMPLOYEE NAME "] ||
    ""
  ).toString().trim().toLowerCase();

  const remarks = (record["REMARKS"] || "").toUpperCase();

  // 🚫 IGNORE CANCELLED RECORDS
  if (remarks.includes("CANCELLED")) continue;

  if (existingName !== currentName) continue;

      const rawDates = record["DATES"] || "";

      const existingDates = parseAndDedupeDateString(rawDates)
  .map(d => dateKey(d));

    const existingSet = new Set(existingDates);
const overlap = selectedDates.filter(d => existingSet.has(d));

      if (overlap.length > 0) {

        duplicateFound = {
          name: existingName,
          dates: overlap.map(d =>
            new Date(d).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric"
            }).toUpperCase()
          ).join(", "),
          leaveType: record["TYPE OF LEAVE"] || "N/A"
        };

        break;
      }
    }
  }

  // ===== EMPLOYEE NAME VALIDATION =====
if (officialEmployees.length === 0) {
  await loadOfficialEmployees();
}
const employeeExists = officialEmployees.some(emp => {

  const officialName = (
      emp.name ||
      emp["EMPLOYEE NAME"] ||
      emp["EMPLOYEE NAME "] ||
      ""
  )
  .toString()
  .trim()
  .replace(/\s+/g," ")
  .toLowerCase();

  const enteredName = currentName
  .toString()
  .trim()
  .replace(/\s+/g," ")
  .toLowerCase();

  return officialName === enteredName;

});

if (!employeeExists && currentEditRowIndex === null) {

  if (spinner) spinner.style.display = "none";

  if (okBtn) {
    okBtn.style.display = "inline-block";
    okBtn.disabled = false;
  }

  modalMessage.innerHTML = `
  <div style="text-align:center">
    <div style="font-size:70px">⚠️</div>
    <b style="color:#d93025">EMPLOYEE NOT FOUND</b>
    <br><br>
    <b>${data.employee.toUpperCase()}</b>
    <br><br>
    This employee is not listed in the official BENRO employee list.
    <br><br>
    Please check the spelling.
  </div>
  `;

  return;
}

  // ===== DUPLICATE FOUND =====
  if (duplicateFound) {

    if (spinner) spinner.style.display = "none";

    if (okBtn) {
      okBtn.style.display = "inline-block";
      okBtn.disabled = false;
    }

    modalMessage.innerHTML = `
<div style="text-align:center">
<div style="font-size:70px">⚠️</div>
<b style="color:#d93025">DUPLICATE RECORD DETECTED</b>
<br><br>

Employee: <b>${duplicateFound.name.toUpperCase()}</b><br>
Leave Type: <b>${duplicateFound.leaveType}</b><br><br>

Duplicate Date(s):<br>
<b style="color:#d93025">${duplicateFound.dates}</b>
</div>
`;

    return;
  }

  // ===== SAVE DATA =====
  modalMessage.innerText =
    currentEditRowIndex ? "Updating record..." : "Saving record...";

 const isEditing = currentEditRowIndex !== null;

const finalPayload = {
  ...data,
  remarks: document.getElementById("remarks").value || "",
  rowIndex: isEditing ? currentEditRowIndex : null,
  action: isEditing ? "UPDATE" : "CREATE"
};

  try {

    await fetch(googleSheetsUrl, {
  method: "POST",
  mode: "no-cors",
  headers: { "Content-Type": "text/plain" },
  body: JSON.stringify(finalPayload)


});

    // small delay so modal animation is visible
    setTimeout(() => {
      handleSuccessfulSave();
    }, 100);

  } catch (err) {

    console.error(err);

    setTimeout(() => {
      handleSuccessfulSave();
    }, 100);

  }

});

function showSavingModal(message) {

  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("show");
  }

  if (spinner) spinner.style.display = "block";
  if (checkmark) checkmark.style.opacity = 0;

  if (modalMessage) {
    modalMessage.innerText = message || "Saving...";
  }

  if (okBtn) {
    okBtn.style.display = "none";
    okBtn.disabled = true;
  }
}

async function handleSuccessfulSave() {

  if (spinner) spinner.style.display = "none";

  if (modalMessage) {
    modalMessage.innerHTML = `
    <div style="
      height:100%;
      display:flex;
      flex-direction:column;
      justify-content:center;
      align-items:center;
      text-align:center;
      margin-top:-40px;
    ">
      <div style="font-size:70px;">✅</div>
      <b style="color:#188038;font-size:22px;">SAVED SUCCESSFULLY</b>
    </div>
    `;
  }

  // keep your reset exactly the same
  resetFormAfterSave();

  // ⭐ ONLY ADD THIS LINE
  await loadDataFromSheet();

  if (okBtn) {
    okBtn.style.display = "inline-block";
    okBtn.disabled = false;
  }



  // ✅ clear everything here
  resetFormAfterSave();

  if (okBtn) {
    okBtn.style.display = "inline-block";
    okBtn.disabled = false;
  }
}

// ===== TABLE RENDERING =====
const tableBody = document.querySelector("#dataGrid tbody");



async function loadDataFromSheet() {
  const searchInput = document.getElementById("searchInput");

  if (isSearchActive || (searchInput && searchInput.value.trim() !== "")) {
    console.log("Auto-refresh paused: Search results are locked.");
    return; 
  }

  try {
    // 🔥 ADD TIMESTAMP TO PREVENT CACHE
    const res = await fetch(`${googleSheetsUrl}?t=${new Date().getTime()}`, {
      cache: "no-store"
    });

 const data = await res.json();

allRecords = data.map((row, i) => ({
  ...row,
  rowIndex: i + 2
}));



renderTable(allRecords);

  } catch (err) {
    console.error("Load error:", err);
  }
}




function renderTable(dataToDisplay) {

  
  if(!tableBody) return;
  tableBody.innerHTML = ""; 
  
  
 dataToDisplay.forEach((d, index) => {

  // 🔥 ensure correct sheet row number

    const tr = document.createElement("tr");

    // Existing date logic...
   let rawLeaveDates = d["DATES"] || "-";
let displayLeaveDates = rawLeaveDates;

if (rawLeaveDates && rawLeaveDates !== "-") {
  const uniqueDates = parseAndDedupeDateString(rawLeaveDates);
  if (uniqueDates.length) {
   displayLeaveDates = formatDatesForSaving(uniqueDates)
  .split(/,\s(?=[A-Z]{3}\s\d{1,2},)/)
  .map(d => `<span class="date-tag">${d}</span>`)
  .join(" ");
}
}

    let rawDateCreated = d["DATE CREATED"] || "-";
    let displayCreated = rawDateCreated;
    if (rawDateCreated !== "-" && rawDateCreated.toString().includes("T")) {
      const dateObj = new Date(rawDateCreated);
      if (!isNaN(dateObj)) {
        const datePart = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
        const timePart = dateObj.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase().replace(/\s+/g, ''); 
        displayCreated = `${datePart} - ${timePart}`;
      }
    }

    const rawRemarks = (d["REMARKS"] || "").toString().toUpperCase();
    const displayRemarks = rawRemarks.split('\n').join('<br>');

    let btnHtml = "";
 if (rawRemarks.includes("CANCELLED")) {

  btnHtml = `<button class="done-btn" disabled>CANCELLED</button>`;

} 
else if (rawRemarks.includes("RECEIVED")) {

  btnHtml = `<button class="done-btn" disabled>COMPLETED</button>`;

} 
else if (rawRemarks.includes("SUBMITTED")) {

  btnHtml = `
    <button class="receive-btn" onclick="handleSubmit(${d.rowIndex}, event)">RECEIVED</button>
  `;

} 
else {

  btnHtml = `
    <button class="submit-btn" onclick="handleSubmit(${d.rowIndex}, event)">SUBMIT</button>
  `;

}
    // --- UPDATED ROW HTML WITH CLICKABLE NAME ---
    const empName = (d["EMPLOYEE NAME"] || d["EMPLOYEE NAME "] || "-").replace(/'/g, "\\'");

tr.innerHTML = `
    <td>${index + 1}</td>
    <td>
      <a href="#" class="emp-link" onclick='fillFormForEdit(${JSON.stringify(d).replace(/'/g, "&apos;")}, ${index + 2})'>
        ${empName}
      </a>
    </td>
    <td>${d["GENDER"] || "-"}</td>
    <td>${d["TYPE OF LEAVE"] || "-"}</td>
    <td>${d["DIVISION"] || "-"}</td>
    <td>${displayLeaveDates}</td> 
    <td>${displayCreated}</td>   
    <td style="text-align: left; line-height: 1.4; vertical-align: top;">${displayRemarks}</td> 
    <td>${btnHtml}</td>
`;
    tableBody.appendChild(tr);
  });
}

// Add this function to handle the click action
function handleEmployeeClick(name) {
  console.log("Clicked employee:", name);
  // Example: Fill the search box or the form name input
  const clientInput = document.getElementById("client");
  if(clientInput) clientInput.value = name;
}

async function handleSubmit(sheetRowIndex, event) {

  isUpdatingRecord = true;
  lockedRowIndex = sheetRowIndex;

  const btn = event.target;
  const actionType = btn.innerText.trim().toUpperCase();
  const row = btn.closest("tr");
  const remarksCell = row.cells[7];

  const now = new Date();

  const formattedDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).toUpperCase();

  const formattedTime = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).toUpperCase().replace(/\s+/g, "");

  const submitStyle = `background-color: yellow; color: black; font-weight: bold; padding: 2px 5px; border-radius: 3px;`;
  const receiveStyle = `background-color: green; color: white; font-weight: bold; padding: 2px 5px; border-radius: 3px;`;
  const cancelStyle = `background-color: #d3d3d3; color: black; font-weight: bold; padding: 2px 5px; border-radius: 3px;`;

  const existingRemarks = remarksCell.innerHTML.trim();

  let htmlToSave = "";

  if (actionType === "SUBMIT") {
    htmlToSave = `<span style="${submitStyle}">SUBMITTED</span> - ${formattedDate}`;
  }

  else if (actionType === "RECEIVED") {
    htmlToSave = existingRemarks
      ? `${existingRemarks}<br><span style="${receiveStyle}">RECEIVED</span> - ${formattedDate}`
      : `<span style="${receiveStyle}">RECEIVED</span> - ${formattedDate}`;
  }

  else if (actionType === "CANCEL") {

    if (existingRemarks.includes("CANCELLED")) return;

    htmlToSave = existingRemarks
      ? `${existingRemarks}<br><span style="${cancelStyle}">CANCELLED</span> - ${formattedDate} - ${formattedTime}`
      : `<span style="${cancelStyle}">CANCELLED</span> - ${formattedDate} - ${formattedTime}`;
  }

  btn.disabled = true;
  btn.innerText = "PROCESSING...";

  try {

    await fetch(googleSheetsUrl, {
  method: "POST",
  mode: "no-cors",
  headers: { "Content-Type": "text/plain" },
  body: JSON.stringify({
    rowToUpdate: sheetRowIndex,
    action: actionType,
    dateStamp: htmlToSave,
    isUpdateOnly: true
  })
});

    // Update UI immediately
    remarksCell.innerHTML = htmlToSave;

    const recordIndex = sheetRowIndex - 2;
    if (allRecords[recordIndex]) {
      allRecords[recordIndex]["REMARKS"] = htmlToSave;
    }

    // Cancel logic
    if (actionType === "CANCEL") {

      const actionCell = row.cells[8];

      actionCell.innerHTML = `
        <button class="cancelled-btn" disabled style="
          background-color:#d3d3d3;
          color:black;
          font-weight:bold;
          border:none;
          padding:6px 10px;
          border-radius:4px;">
          CANCELLED
        </button>
      `;

      row.style.opacity = "0.6";

      isUpdatingRecord = false;
      lockedRowIndex = null;

      return;
    }

    // Button transition
    if (actionType === "SUBMIT") {
      btn.innerText = "RECEIVED";
      btn.className = "receive-btn";
      btn.disabled = false;
      btn.onclick = (e) => handleSubmit(sheetRowIndex, e);
    }

    else {
      btn.innerText = "COMPLETED";
      btn.className = "done-btn";
      btn.disabled = true;
    }

  } catch (error) {

    console.error("Error:", error);
    btn.disabled = false;
    btn.innerText = actionType;

  }

 setTimeout(loadDataFromSheet, 1500);
}

function clearForm() {
  ["client", "GENDER", "TYPEOFDOCUMENT", "document", "division", "mgmd-sub", "dateReleased"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = "";
    
  });
  if(illnessInput) illnessInput.disabled = true; // Reset disabled state
  picker.clear();
}

// Check every 15 seconds: Only refresh if box is empty AND not manually paused
async function fetchData() {

  if (isUpdatingRecord) return;

  try {

    const response = await fetch(`${googleSheetsUrl}?t=${Date.now()}`, {
      cache: "no-store"
    });

    const data = await response.json();

    // Do not overwrite row currently updating
    if (lockedRowIndex !== null) {

      const row = lockedRowIndex - 2;

      if (allRecords[row]) {
        data[row]["REMARKS"] = allRecords[row]["REMARKS"];
      }

    }

    allRecords = data;

   

    if (!isManualSearchPaused) {
      renderTable(allRecords);
    }

  } catch (err) {
    console.error(err);
  }

}






  // ONLY redraw the grid if the user is NOT searching
  if (!isManualSearchPaused) {
    renderTable(allRecords); 
  } else {
    console.log("Search active: auto-refresh UI blocked.");
  }


// Your existing timer
setInterval(fetchData, 60000);



// ===== Filter/Search Logic =====

// 1. Reference the new Button and Search Box
const searchBtn = document.getElementById("searchBtn");
const searchBox = document.getElementById("searchBox");
function filterTable() {

    const searchValue = searchBox.value.toUpperCase().trim();

    if (searchValue === "") {
        isManualSearchPaused = false;
    } else {
        isManualSearchPaused = true;
    }

    isManualSearchPaused = true;
   
    const rows = Array.from(tableBody.rows);
    isSearching = searchValue.length > 0;

    let visibleIndex = 1;

    // Column Mapping
    const COL = {
        NAME: 1,
        TYPE: 3,      
        DIVISION: 4,  
        DATES: 5,     
        RELEASED: 6,  
        RECEIVED: 7,
        ACTION: 8
    };

    // Helper function to apply yellow highlight
    const highlightCell = (cell, textToHighlight) => {

        if (!cell || !textToHighlight || textToHighlight.length < 2) return;

        // protect special cells
if (
    cell.querySelector('button') ||
    cell.querySelector('.date-tag') ||   // ⭐ prevents breaking leave tags
    cell.classList.contains('action-column') ||
    cell.classList.contains('remarks-column')
) return;

        const innerHTML = cell.textContent;

        const escapedTerm = textToHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const regex = new RegExp(`(${escapedTerm})`, 'gi');

        cell.innerHTML = innerHTML.replace(regex, '<mark style="background-color: yellow; color: black; padding: 0 2px; border-radius: 2px;">$1</mark>');
    };

    // Helper to clear highlights WITHOUT breaking buttons or alignment
    const clearHighlights = (row) => {

        Array.from(row.cells).forEach((cell, idx) => {

            if (idx !== COL.ACTION && idx !== COL.RECEIVED && idx !== COL.NAME) {
                if (!cell.querySelector(".date-tag")) {
                     cell.innerHTML = cell.textContent;
                }
            }

        });
    };

    rows.forEach(row => {

        clearHighlights(row);

        let isMatch = false;
        let targetCols = [];

        // Cache row text once (FASTER)
        const rowText = row.textContent.toUpperCase();

        // 1. DATE CREATED / SUBMITTED
        if (searchValue.startsWith("DATE CREATED") || searchValue.startsWith("SUBMITTED")) {

            const val = searchValue.replace(/DATE CREATED|SUBMITTED/, "").trim();

            const cellText = row.cells[COL.RELEASED]?.textContent.toUpperCase() || "";

            isMatch = cellText.includes(val);

            if (isMatch) targetCols.push({ idx: COL.RELEASED, val: val });

        }

        // 2. RECEIVED
        else if (searchValue.startsWith("RECEIVED")) {

            const val = searchValue.replace("RECEIVED", "").trim();

            const cellText = row.cells[COL.RECEIVED]?.textContent.toUpperCase() || "";

            isMatch = cellText.includes(val);

            if (isMatch) targetCols.push({ idx: COL.RECEIVED, val: val });

        }

        // 3. DATE(S) LEAVE
        else if (searchValue.startsWith("DATE(S) LEAVE") || searchValue.startsWith("DATES LEAVE")) {

            const val = searchValue.replace(/DATE\(S\) LEAVE|DATES LEAVE/, "").trim();

            const cellText = row.cells[COL.DATES]?.textContent.toUpperCase() || "";

            isMatch = cellText.includes(val);

            if (isMatch) targetCols.push({ idx: COL.DATES, val: val });

        }

        // 4. GOOGLE-STYLE MULTI-WORD SEARCH
        else {

            const searchTerms = searchValue.split(/\s+/);

            isMatch = searchTerms.every(term => rowText.includes(term));

            if (isMatch) {

                searchTerms.forEach(term => {

                    if (row.cells[COL.NAME]?.textContent.toUpperCase().includes(term))
                        targetCols.push({ idx: COL.NAME, val: term });

                    if (row.cells[COL.DIVISION]?.textContent.toUpperCase().includes(term))
                        targetCols.push({ idx: COL.DIVISION, val: term });

                    if (row.cells[COL.DATES]?.textContent.toUpperCase().includes(term))
                        targetCols.push({ idx: COL.DATES, val: term });

                    if (row.cells[COL.TYPE]?.textContent.toUpperCase().includes(term))
                        targetCols.push({ idx: COL.TYPE, val: term });

                    if (row.cells[COL.RELEASED]?.textContent.toUpperCase().includes(term))
                        targetCols.push({ idx: COL.RELEASED, val: term });

                });

            }

        }

        row.style.display = isMatch ? "" : "none";

        if (isMatch) {

            row.cells[0].innerText = visibleIndex++;

            targetCols.forEach(item => highlightCell(row.cells[item.idx], item.val));

        }

    });

}

// Keep your listeners the same
searchBtn.addEventListener("click", filterTable);

searchBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    filterTable();
  }
});

   

async function sendRowToGoogleSheets(finalPayload) {
  // Use the googleSheetsUrl you defined at the top of your script
  
  
  try {

  await fetch(googleSheetsUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(finalPayload)
  });

  setTimeout(() => {
    handleSuccessfulSave();
  }, 500);

} catch (err) {

  console.error(err);

  setTimeout(() => {
    handleSuccessfulSave();
  }, 500);

}
  return response;
}
function clearForm() {
  document.getElementById("client").value = "";
  picker.clear();
  // ... clear other fields similarly
}

// 3. INITIAL LOAD ON PAGE START
loadDataFromSheet();






function togglePanel() {
  const panel = document.getElementById("formPanel");
  const dataTable = document.querySelector(".datatable"); 
  const btn = document.getElementById("toggleBtn");
  const printBtn = document.getElementById("printBtn");

  panel.classList.toggle("hidden-panel");

  if (panel.classList.contains("hidden-panel")) {
    // FORM IS HIDDEN
    btn.innerHTML = "Show Form";
    dataTable.style.height = "450px"; 
    dataTable.classList.add("hide-actions");

    // SHOW PRINT BUTTON
    if (printBtn) printBtn.style.display = "inline-block";

  } else {
    // FORM IS SHOWN
    btn.innerHTML = "Hide Form";
    dataTable.style.height = "210px";
    dataTable.classList.remove("hide-actions");

    // HIDE PRINT BUTTON
    if (printBtn) printBtn.style.display = "none";
  }
}

// ===== CANCEL BUTTON LOGIC =====
const cancelBtn = document.getElementById("cancelBtn");


cancelBtn.addEventListener("click", () => {
    // 1. Reset the Edit Mode tracker
    currentEditRowIndex = null;
    

    // 2. Revert the Save Button UI
    const saveBtn = document.getElementById("saveBtn");
    saveBtn.innerText = "SAVE DATA";
    saveBtn.style.backgroundColor = ""; // Resets to your original CSS color (maroon/blue)

     // HIDE DELETE & CANCEL BUTTONS
    document.getElementById("deleteBtn").style.display = "none";
    document.getElementById("cancelEditBtn").style.display = "none";


    // 3. Clear the Flatpickr calendar
    if (typeof picker !== 'undefined' && picker !== null) {
        picker.clear();
    }

    // 4. Reset the Sick Leave illness input
    const illnessInput = document.getElementById("document");
    if (illnessInput) {
        illnessInput.disabled = true;
        illnessInput.value = "";
        illnessInput.style.backgroundColor = "#f0f0f0";
    }

    // 5. Clear all form fields (optional but recommended)
    // document.getElementById("formPanel").reset(); 
    
    console.log("Form reset to SAVE mode");
});

if (cancelBtn) {
  cancelBtn.addEventListener("click", (e) => {
    e.preventDefault(); // Stop the page from refreshing


    if (!confirm("Clear all fields?")) return;

    // 1. Reset Text Inputs
    const textFields = ["client", "division", "dateReleased", "document", "mgmd-sub", "GENDER", "TYPEOFDOCUMENT"];
    textFields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
      document.getElementById("cancelBtn").addEventListener("click", () => {
    currentEditRowIndex = null;
    saveBtn.innerText = "SAVE DATA";
    saveBtn.style.backgroundColor = ""; 
    if (picker) picker.clear();

    
});
    });

    

    // 3. Clear Flatpickr (Multiple Date Picker)
    if (typeof picker !== 'undefined' && picker !== null) {
      picker.clear(); 
    }

    // 4. Force Reset Sick Leave Field UI
    if (illnessInput) {
      illnessInput.disabled = true;
      illnessInput.style.backgroundColor = "#f0f0f0";
      illnessInput.value = "";
    }


    console.log("Form reset successfully.");
  });
}











// Attach to Enter Key
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    handleSearch(e);
  }
});

// Attach to Search Button (Make sure your HTML button has id="searchBtn")

if (searchBtn) {
  searchBtn.addEventListener("click", handleSearch);
}

// ATTACH TO BUTTON CLICK
 // Ensure ID matches your HTML
if (searchBtn) searchBtn.addEventListener("click", handleSearch);

// ATTACH TO ENTER KEY
if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleSearch(e);
      pauseload
    }
  });
}

function pauseload(e){
  let setInterval = false;
}



// Add this near your other event listeners
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault(); // Prevent form submission
    performSearch();
  }
});

// If you have a specific search button

if (searchBtn) {
    searchBtn.addEventListener("click", performSearch,);
}



// Attach to Search Input (Enter Key)
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") performSearch(e);
});

// Attach to Search Button (if you have one)

if (searchBtn) searchBtn.addEventListener("click", performSearch);





// Example of your toggle function
function hideForm() {
  const formContainer = document.getElementById("formContainer"); // or whatever your ID is
  const saveBtn = document.getElementById("saveBtn");
  const printBtn = document.getElementById("printBtn");

  // Hide the form
  if (formContainer) formContainer.style.display = "none";
  if (saveBtn) saveBtn.style.display = "none";
  
  // ADD THIS LINE: Hide the print button too
  if (printBtn) printBtn.style.display = "none";
}

function showForm() {
  const formContainer = document.getElementById("formContainer");
  const saveBtn = document.getElementById("saveBtn");
  const printBtn = document.getElementById("printBtn");

  // Show the main form and save button
  if (formContainer) formContainer.style.display = "block";
  if (saveBtn) saveBtn.style.display = "inline-block";
  
  // HIDE the print button so it is invisible when the form is open
  if (printBtn) {
    printBtn.style.display = "none";
  }
}


function fillFormForEdit(data) {
    // ... (Previous code for Name, Gender, Division, etc.) ...
    document.getElementById("client").value = data["EMPLOYEE NAME"] || data["EMPLOYEE NAME "] || "";
    document.getElementById("GENDER").value = data["GENDER"] || "";
    document.getElementById("division").value = data["DIVISION"] || "";
    document.getElementById("remarks").value = data["REMARKS"] || "";
    const remarks = (data["REMARKS"] || "").toUpperCase();

    if (remarks.includes("CANCELLED")) {
  cancelEditBtn.disabled = true;
} else {
  cancelEditBtn.disabled = false;
}

    // --- NEW: DATE CREATED LOGIC ---
    const dateCreatedInput = document.getElementById("dateReleased");
    const rawDate = data["DATE CREATED"];

    if (rawDate && rawDate !== "-") {
        try {
            const dateObj = new Date(rawDate);
            // Check if date is valid
            if (!isNaN(dateObj.getTime())) {
                // Adjust for local timezone offset to get YYYY-MM-DDTHH:MM
                const tzOffset = dateObj.getTimezoneOffset() * 60000; 
                const localISOTime = new Date(dateObj - tzOffset).toISOString().slice(0, 16);
                dateCreatedInput.value = localISOTime;
            }
        } catch (e) {
            console.error("Error formatting date for edit:", e);
        }
    }

    // --- LEAVE TYPE & SICK LEAVE LOGIC ---
    const fullLeave = (data["TYPE OF LEAVE"] || "").toUpperCase();
    const typeDropdown = document.getElementById("TYPEOFDOCUMENT");
    const illnessInput = document.getElementById("document");

    if (fullLeave.includes("SICK LEAVE")) {
        typeDropdown.value = "SICK LEAVE";
        // Extract illness if it follows the "SICK LEAVE - ILLNESS" format
        const parts = fullLeave.split(" - ");
        illnessInput.value = parts[1] || ""; 
        illnessInput.disabled = false;
        illnessInput.style.backgroundColor = "#fff";
    } else {
        typeDropdown.value = fullLeave;
        illnessInput.value = "";
        illnessInput.disabled = true;
    }

    // --- DATES (Flatpickr) ---
    if (data["DATES"] && typeof picker !== "undefined") {

  const dates = parseAndDedupeDateString(data["DATES"]);

  picker.clear();
  picker.setDate(dates, true);

}
}

function fillFormForEdit(data, rowIndex) {
  currentEditRowIndex = rowIndex;

  saveBtn.innerText = "UPDATE DATA";
  saveBtn.style.backgroundColor = "#28a745";

  

  // SHOW EDIT BUTTONS
  const teBtndele = document.getElementById("deleteBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
deleteBtn.style.display = "inline-block";
cancelEditBtn.style.display = "inline-block";

if (deleteBtn) deleteBtn.style.display = "inline-block";
if (cancelEditBtn) cancelEditBtn.style.display = "inline-block";

  document.getElementById("client").value = data["EMPLOYEE NAME"] || data["EMPLOYEE NAME "] || "";
  document.getElementById("GENDER").value = data["GENDER"] || "";
  document.getElementById("division").value = data["DIVISION"] || "";

  // Leave type / sick leave
  const typeDropdown = document.getElementById("TYPEOFDOCUMENT");
  const illnessInput = document.getElementById("document");
  const fullType = data["TYPE OF LEAVE"] || "";

  if (fullType.includes(" - ")) {
    const parts = fullType.split(" - ");
    typeDropdown.value = parts[0];
    illnessInput.value = parts[1] || "";
    illnessInput.disabled = false;
    illnessInput.style.backgroundColor = "#fff";
  } else {
    typeDropdown.value = fullType;
    illnessInput.value = "";
    illnessInput.disabled = true;
    illnessInput.style.backgroundColor = "#f0f0f0";
  }

  // Date created
  if (data["DATE CREATED"]) {
    const dateObj = new Date(data["DATE CREATED"]);
    if (!isNaN(dateObj)) {
      const localISO = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000))
        .toISOString()
        .slice(0, 16);
      document.getElementById("dateReleased").value = localISO;
    }
  }

  // ✅ DEDUPE dates coming from sheet
  const rawDates = data["DATES"] || data["DATE(S) LEAVE"] || "";
  const uniqueDates = parseAndDedupeDateString(rawDates);

  if (picker) {
    picker.clear();                 // IMPORTANT: prevent merging/duplication
    picker.setDate(uniqueDates, true);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}


function editRecord(rowData) {
    // 1. Populate standard text fields
    document.getElementById("client").value = rowData.employee || "";
    document.getElementById("GENDER").value = rowData.gender || "";
    document.getElementById("division").value = rowData.division || "";
    document.getElementById("dateReleased").value = rowData.dateCreated || "";
    
    // 2. Handle Sick Leave illness parsing (e.g., "SICK LEAVE - Head ache")
    const typeField = document.getElementById("TYPEOFDOCUMENT");
    const illnessField = document.getElementById("document");
    
    if (rowData.leaveType.includes(" - ")) {
        const parts = rowData.leaveType.split(" - ");
        typeField.value = "SICK LEAVE";
        illnessField.value = parts[1];
        illnessField.disabled = false;
        illnessField.style.backgroundColor = "#fff";
    } else {
        typeField.value = rowData.leaveType;
        illnessField.value = "";
        illnessField.disabled = true;
        illnessField.style.backgroundColor = "#f0f0f0";
    }

    // 3. THE FIX FOR FLATPICKR DATES
  if (rowData.dates) {

  const uniqueDates = parseAndDedupeDateString(rowData.dates);

  picker.clear();
  picker.setDate(uniqueDates, true);

}

    // Store the row index for the UPDATE action
    currentEditRowIndex = rowData.rowIndex; 
}



function resetFormAfterSave() {
  // ✅ exit edit mode
  currentEditRowIndex = null;
  document.getElementById("deleteBtn").style.display = "none";
document.getElementById("cancelEditBtn").style.display = "none";

  // ✅ reset SAVE button UI
  if (saveBtn) {
    saveBtn.innerText = "SAVE DATA";
    saveBtn.style.backgroundColor = ""; // back to CSS default
   
  }

  // ✅ clear text inputs / textarea
  const idsToClear = [
    "client",
    "division",
    "mgmd-sub",
    "GENDER",
    "TYPEOFDOCUMENT",
    "document",      // illness
    "remarks"        // if you have this field
  ];

  idsToClear.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  // ✅ clear combobox/selects
  const selectsToReset = ["GENDER", "TYPEOFDOCUMENT"];
  selectsToReset.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.selectedIndex = 0;     // reset to first option
      el.dispatchEvent(new Event("change")); // important for Sick Leave toggle logic
    }
  });

  // ✅ clear single date/datetime picker (native inputs)
  const dateInputs = ["dateReleased"]; // datetime-local in your code
  dateInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  // ✅ clear flatpickr multiple date picker
  if (typeof picker !== "undefined" && picker) {
    picker.clear();
  }

  // ✅ force sick leave illness field back to disabled look
  const illness = document.getElementById("document");
  if (illness) {
    illness.disabled = true;
    illness.value = "";
    illness.style.backgroundColor = "#f0f0f0";
  }

  // optional: focus first field
 const first = document.getElementById("client");
if (first) first.focus();

// HIDE EDIT BUTTONS
const deleteBtn = document.getElementById("deleteBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

if (deleteBtn) deleteBtn.style.display = "none";
if (cancelEditBtn) cancelEditBtn.style.display = "none";
}





deleteBtn.addEventListener("click", async () => {

  if (currentEditRowIndex == null) {
    alert("No record selected to delete.");
    return;
  }

  if (!confirm("Are you sure you want to delete this record?")) return;

  showSavingModal("Deleting record...");

  const payload = {
    action: "DELETE",
    rowIndex: currentEditRowIndex
  };

  try {

    await fetch(googleSheetsUrl, {
  method: "POST",
  mode: "no-cors",
  headers: { "Content-Type": "text/plain" },
  body: JSON.stringify(payload)
});

    setTimeout(() => {

      if (spinner) spinner.style.display = "none";

      modalMessage.innerHTML = `
      <div style="text-align:center">
        <div style="font-size:70px;">🗑️</div>
        <b style="color:#d93025;font-size:20px;">RECORD DELETED</b>
      </div>
      `;

      if (okBtn) {
        okBtn.style.display = "inline-block";
        okBtn.disabled = false;
      }

      resetFormAfterSave();
      loadDataFromSheet();

    }, 500);

  } catch (err) {

    console.error(err);
    alert("Delete failed");

  }

});




async function loadOfficialEmployees(){

  try{

    const res = await fetch(employeeListUrl);
    officialEmployees = await res.json();

    console.log("Official employee list:", officialEmployees);

  }catch(err){

    console.error("Employee list load error:", err);

  }

}


document.addEventListener("DOMContentLoaded", async () => {

  await Promise.all([
    loadOfficialEmployees(),
    loadDataFromSheet()
  ]);

});













