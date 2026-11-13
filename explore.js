const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const catalogue = document.getElementById("catalogue");
const filterInput = document.getElementById("filterInput");
const statusLine = document.getElementById("statusLine");

let domains = [];

function bySortOrder(a, b) {
  return a.sort_order - b.sort_order;
}

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function render(filterText) {
  const term = filterText.trim().toLowerCase();
  let subjectCount = 0;

  catalogue.replaceChildren();

  domains.forEach(function (domain) {
    const domainMatches = domain.name.toLowerCase().includes(term);
    const block = makeElement("section", "domain-block");

    const header = makeElement("div", "domain-header");
    header.append(makeElement("span", "domain-icon", domain.icon));
    const headerText = makeElement("div");
    headerText.append(makeElement("h2", "", domain.name));
    headerText.append(makeElement("p", "", domain.description));
    header.append(headerText);
    block.append(header);

    let categoriesShown = 0;

    domain.categories.slice().sort(bySortOrder).forEach(function (category) {
      const categoryMatches = domainMatches || category.name.toLowerCase().includes(term);
      const subjects = category.subjects.slice().sort(bySortOrder).filter(function (subject) {
        return categoryMatches || subject.name.toLowerCase().includes(term);
      });

      if (!categoryMatches && subjects.length === 0) return;

      const categoryBlock = makeElement("div", "category-block");
      categoryBlock.append(makeElement("h3", "", category.name));

      const list = makeElement("div", "subject-list");
      subjects.forEach(function (subject) {
        list.append(makeElement("span", "subject-chip", subject.name));
        subjectCount++;
      });

      categoryBlock.append(list);
      block.append(categoryBlock);
      categoriesShown++;
    });

    if (categoriesShown > 0 || domainMatches) catalogue.append(block);
  });

  if (catalogue.children.length === 0) {
    statusLine.textContent = 'Nothing found for "' + filterText.trim() + '".';
  } else {
    statusLine.textContent = subjectCount + " subjects shown";
  }
}

async function loadCatalogue() {
  const { data, error } = await db
    .from("knowledge_domains")
    .select("slug, name, description, icon, sort_order, categories(slug, name, description, sort_order, subjects(slug, name, sort_order))")
    .order("sort_order");

  if (error) {
    statusLine.textContent = "Could not load the catalogue: " + error.message;
    return;
  }

  domains = data;
  render("");
}

filterInput.addEventListener("input", function () {
  render(filterInput.value);
});

loadCatalogue();
