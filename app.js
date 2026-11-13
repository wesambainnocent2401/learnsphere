window.addEventListener("error", function (event) {
  const grid = document.getElementById("categoryGrid");
  if (grid) grid.innerHTML = "<p>Script error: " + event.message + "</p>";
});
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const categoryGrid = document.getElementById("categoryGrid");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

async function loadDomains() {
  const { data, error } = await db
    .from("knowledge_domains")
    .select("slug, name, description, icon")
    .order("sort_order");

  if (error) {
    console.error(error);
  categoryGrid.innerHTML = "<p>Could not load knowledge domains: " + escapeHtml(error.message) + "</p>";
    return;
  }

  categoryGrid.innerHTML = data.map(function (domain) {
    const idAttribute = domain.slug === "technology-digital-skills" ? ' id="skills"' : "";
    return `
      <a href="#" class="category-card"${idAttribute}>
        <span class="category-icon">${escapeHtml(domain.icon)}</span>
        <h3>${escapeHtml(domain.name)}</h3>
        <p>${escapeHtml(domain.description)}</p>
      </a>
    `;
  }).join("");
}

loadDomains();

// Search (the real search arrives in Phase 3)
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
