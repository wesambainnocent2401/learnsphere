const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TYPE_LABELS = {
  textbook: "Textbook",
  reference_book: "Reference book",
  lecture_notes: "Lecture notes",
  revision_notes: "Revision notes",
  past_paper: "Past paper",
  marking_scheme: "Marking scheme",
  research: "Research",
  practical_guide: "Practical guide",
  study_guide: "Study guide",
  open_educational_resource: "Open resource"
};

const curriculumFilter = document.getElementById("curriculumFilter");
const typeFilter = document.getElementById("typeFilter");
const textFilter = document.getElementById("textFilter");
const kenyaStatus = document.getElementById("kenyaStatus");
const resourceList = document.getElementById("resourceList");

let resources = [];

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function makeCard(item) {
  const card = makeElement("article", "resource-card");

  const tags = makeElement("div", "resource-tags");
  tags.append(makeElement("span", "badge", TYPE_LABELS[item.resource_type] || item.resource_type));
  if (item.curriculum) tags.append(makeElement("span", "badge", item.curriculum));
  if (item.form_or_grade) tags.append(makeElement("span", "badge", item.form_or_grade));
  if (item.exam_year) tags.append(makeElement("span", "badge", String(item.exam_year)));
  card.append(tags);

  card.append(makeElement("h3", "", item.title));
  if (item.subject_name) card.append(makeElement("p", "", "Subject: " + item.subject_name));
  if (item.author) card.append(makeElement("p", "", "By " + item.author));
  if (item.description) card.append(makeElement("p", "", item.description));

  card.append(makeElement("p", "source-line", "Source: " + item.source_name));
  card.append(makeElement("p", "source-line", "Licence: " + item.licence));

  if (typeof item.source_url === "string" && item.source_url.startsWith("https://")) {
    const link = makeElement("a", "open-link", "Open resource");
    link.href = item.source_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    card.append(link);
  }

  return card;
}

function fillFilters() {
  const curricula = [...new Set(resources.map(function (r) { return r.curriculum; }).filter(Boolean))].sort();
  curricula.forEach(function (name) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    curriculumFilter.append(option);
  });

  const types = [...new Set(resources.map(function (r) { return r.resource_type; }))];
  types.forEach(function (type) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = TYPE_LABELS[type] || type;
    typeFilter.append(option);
  });
}

function render() {
  const curriculum = curriculumFilter.value;
  const type = typeFilter.value;
  const term = textFilter.value.trim().toLowerCase();

  const matches = resources.filter(function (item) {
    if (curriculum && item.curriculum !== curriculum) return false;
    if (type && item.resource_type !== type) return false;
    if (term) {
      const haystack = (item.title + " " + (item.subject_name || "") + " " + (item.author || "")).toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  resourceList.replaceChildren(...matches.map(makeCard));
  kenyaStatus.textContent = matches.length === 0
    ? "No resources match yet. More are being added."
    : matches.length + " resource" + (matches.length === 1 ? "" : "s") + " shown";
}

async function loadResources() {
  const { data, error } = await db
    .from("resources")
    .select("title, description, author, resource_type, subject_name, curriculum, education_level, exam_year, form_or_grade, source_name, source_url, licence")
    .eq("country_code", "KE")
    .eq("approval_status", "approved")
    .order("title");

  if (error) {
    kenyaStatus.textContent = "Could not load resources: " + error.message;
    return;
  }

  resources = data;
  fillFilters();
  render();
}

curriculumFilter.addEventListener("change", render);
typeFilter.addEventListener("change", render);
textFilter.addEventListener("input", render);

loadResources();
