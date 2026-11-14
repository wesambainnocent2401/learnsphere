const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TYPE_LABELS = {
  public_university: "Public university",
  private_university: "Private university",
  specialised_university: "Specialised university",
  constituent_college: "Constituent college",
  tvet_institution: "TVET institution",
  other: "Institution"
};

const LEVEL_LABELS = {
  certificate: "Certificate",
  diploma: "Diploma",
  undergraduate: "Undergraduate",
  postgraduate_diploma: "Postgraduate diploma",
  masters: "Masters",
  phd: "PhD"
};

const LEVEL_ORDER = ["certificate", "diploma", "undergraduate", "postgraduate_diploma", "masters", "phd"];

const typeFilter = document.getElementById("typeFilter");
const nameFilter = document.getElementById("nameFilter");
const uniStatus = document.getElementById("uniStatus");
const uniList = document.getElementById("uniList");
const courseForm = document.getElementById("courseForm");
const courseInput = document.getElementById("courseInput");
const courseStatus = document.getElementById("courseStatus");
const courseResults = document.getElementById("courseResults");

let institutions = [];

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function programmeCount(item) {
  return item.programmes && item.programmes[0] ? item.programmes[0].count : 0;
}

async function showProgrammes(item, panel, button) {
  if (!panel.hidden) {
    panel.hidden = true;
    button.textContent = "View courses (" + programmeCount(item) + ")";
    return;
  }

  panel.hidden = false;
  panel.textContent = "Loading courses...";

  const { data, error } = await db
    .from("programmes")
    .select("name, level, field, duration")
    .eq("institution_id", item.id)
    .order("name")
    .limit(1000);

  if (error) {
    panel.textContent = "Could not load courses: " + error.message;
    return;
  }

  if (data.length === 0) {
    panel.textContent = "No courses have been added for this university yet.";
    button.textContent = "Hide courses";
    return;
  }

  panel.replaceChildren();

  LEVEL_ORDER.forEach(function (level) {
    const rows = data.filter(function (row) { return row.level === level; });
    if (rows.length === 0) return;

    panel.append(makeElement("h4", "", LEVEL_LABELS[level] + " (" + rows.length + ")"));
    const list = document.createElement("ul");
    rows.forEach(function (row) {
      const extra = [row.field, row.duration].filter(Boolean).join(" · ");
      list.append(makeElement("li", "", extra ? row.name + " (" + extra + ")" : row.name));
    });
    panel.append(list);
  });

  button.textContent = "Hide courses";
}

function makeCard(item) {
  const card = makeElement("article", "uni-card");

  const tags = makeElement("div", "resource-tags");
  tags.append(makeElement("span", "badge", TYPE_LABELS[item.institution_type] || "Institution"));
  if (item.charter_year) tags.append(makeElement("span", "badge", "Chartered " + item.charter_year));
  card.append(tags);

  card.append(makeElement("h3", "", item.name));
  if (item.town) card.append(makeElement("p", "", item.town));

  const actions = makeElement("div", "uni-actions");
  const panel = makeElement("div", "programme-panel");
  panel.hidden = true;

  const coursesButton = makeElement("button", "", "View courses (" + programmeCount(item) + ")");
  coursesButton.type = "button";
  coursesButton.addEventListener("click", function () {
    showProgrammes(item, panel, coursesButton);
  });
  actions.append(coursesButton);

  if (typeof item.website_url === "string" && item.website_url.startsWith("https://")) {
    const site = makeElement("a", "", "Official website");
    site.href = item.website_url;
    site.target = "_blank";
    site.rel = "noopener noreferrer";
    actions.append(site);
  }

  card.append(actions, panel);
  return card;
}

function render() {
  const type = typeFilter.value;
  const term = nameFilter.value.trim().toLowerCase();

  const matches = institutions.filter(function (item) {
    if (type && item.institution_type !== type) return false;
    if (term && !item.name.toLowerCase().includes(term)) return false;
    return true;
  });

  uniList.replaceChildren(...matches.map(makeCard));
  uniStatus.textContent = matches.length === 0
    ? "No universities match your filter."
    : matches.length + " institution" + (matches.length === 1 ? "" : "s") + " shown";
}

async function loadInstitutions() {
  const { data, error } = await db
    .from("institutions")
    .select("id, slug, name, institution_type, town, website_url, charter_year, programmes(count)")
    .eq("is_active", true)
    .eq("country_code", "KE")
    .order("name");

  if (error) {
    uniStatus.textContent = "Could not load universities: " + error.message;
    return;
  }

  institutions = data;
  render();
}

async function searchCourses(term) {
  courseResults.replaceChildren();
  courseStatus.textContent = "Searching courses...";

  const { data, error } = await db
    .from("programmes")
    .select("name, level, field, duration, institutions!inner(name)")
    .ilike("name", "%" + term + "%")
    .eq("is_active", true)
    .order("name")
    .limit(100);

  if (error) {
    courseStatus.textContent = "Could not search courses: " + error.message;
    return;
  }

  if (data.length === 0) {
    courseStatus.textContent = 'No courses found for "' + term + '" yet. More are being added.';
    return;
  }

  courseStatus.textContent = data.length + " result" + (data.length === 1 ? "" : "s") + " (showing up to 100)";

  data.forEach(function (row) {
    const item = makeElement("div", "course-row");
    item.append(makeElement("strong", "", row.name));
    const detail = [LEVEL_LABELS[row.level], row.institutions.name, row.duration].filter(Boolean).join(" · ");
    item.append(makeElement("span", "", detail));
    courseResults.append(item);
  });
}

courseForm.addEventListener("submit", function (event) {
  event.preventDefault();
  const term = courseInput.value.trim();
  if (term) searchCourses(term);
});

typeFilter.addEventListener("change", render);
nameFilter.addEventListener("input", render);

loadInstitutions();
