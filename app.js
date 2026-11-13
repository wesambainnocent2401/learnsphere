const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchMessage = document.getElementById("searchMessage");

searchForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const query = searchInput.value.trim();
  if (!query) return;

  searchMessage.hidden = false;
  searchMessage.textContent = 'Search for "' + query + '" goes live in Phase 3, once the library is connected.';
  searchMessage.scrollIntoView({ behavior: "smooth", block: "center" });
});
