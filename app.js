const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const categoryGrid = document.getElementById("categoryGrid");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchMessage = document.getElementById("searchMessage");

function makeCard(domain) {
  const card = document.createElement("a");
  card.className = "category-card";
  card.href = "explore.html";

  if (domain.slug === "technology-digital-skills") card.id = "skills";

  const icon = document.createElement("span");
  icon.className = "category-icon";
  icon.textContent = domain.icon;

  const title = document.createElement("h3");
  title.textContent = domain.name;

  const text = document.createElement("p");
  text.textContent = domain.description;

  card.append(icon, title, text);
  return card;
}

async function loadDomains() {
  const { data, error } = await db
    .from("knowledge_domains")
    .select("slug, name, description, icon")
    .order("sort_order");

  if (error) {
    categoryGrid.textContent = "Could not load knowledge domains: " + error.message;
    return;
  }

  categoryGrid.replaceChildren(...data.map(makeCard));
}

searchForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const query = searchInput.value.trim();
  if (!query) return;

  searchMessage.hidden = false;
  searchMessage.textContent = 'Search for "' + query + '" goes live in Phase 3, once the library is connected.';
  searchMessage.scrollIntoView({ behavior: "smooth", block: "center" });
});

loadDomains();
