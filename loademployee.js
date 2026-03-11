let employeesData = [];

async function loadEmployeeSuggestions(){

  const url = "https://script.google.com/macros/s/AKfycbz45A4WQebeP0l1HXGmb-372xqnJI_PzSAsnBrdPT__CEolhzerDVDrM5gTRNmSpe-c/exec";

  const res = await fetch(url);
  employeesData = await res.json();

  const list = document.getElementById("employeeList");

  if(!list) return;

  list.innerHTML = "";

  employeesData.forEach(emp => {

  const option = document.createElement("option");
  option.value = emp.name;

  list.appendChild(option);

});

}

document.addEventListener("DOMContentLoaded", () => {

  loadEmployeeSuggestions();

  const clientInput = document.getElementById("client");

  if(clientInput){
    clientInput.addEventListener("change", function(){

      const selectedName = this.value.trim().toLowerCase();

      const match = employeesData.find(emp =>
  emp.name.toLowerCase() === selectedName
);

      if(match){
        document.getElementById("GENDER").value = match.gender || "";
      }

    });
  }

});

// search
const searchInputField = document.getElementById("searchBox");

if (searchInputField && typeof executeSearch === "function") {
  searchInputField.addEventListener("input", executeSearch);

  searchInputField.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      executeSearch(e);
    }
  });
}