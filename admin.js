const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const adminStatus = document.getElementById("adminStatus");
const adminArea = document.getElementById("adminArea");
const adminList = document.getElementById("adminList");
const resourceForm = document.getElementById("resourceForm");
const formMessage = document.getElementById("formMessage");

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function showFormMessage(text, isError) {
  formMessage.hidden = false;
  formMessage.textContent = text;
  formMessage.className = "auth-message " + (isError ? "auth-error" : "auth-success");
}

async function checkAccess() {
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session) {
    window.location.replace("login.html");
    return false;
  }

  const { data: roleRows, error } = await db
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", sessionData.session.user.id);

  if (error) {
    adminStatus.textContent = "Could not check your access.";
    return false;
  }

  const names = roleRows.map(function (row) { return row.roles.name; });
  const allowed = names.includes("admin") || names.includes("super_admin") || names.includes("content_manager");

  if (!allowed) {
    adminStatus.textContent = "You do not have access to this page.";
    return false;
  }

  adminStatus.textContent = "Signed in with a management role.";
  adminArea.hidden = false;
  return true;
}

function makeItem(item) {
  const row = makeElement("div", "admin-item");

  const text = makeElement("div");
  text.append(makeElement("h3", "", item.title));
  text.append(makeElement("p", "", item.resource_type.replace(/_/g, " ") + " · " + item.source_name + " · " + item.approval_status));
  row.append(text);

  const actions = makeElement("div", "admin-actions");

  const toggle = makeElement("button", "", item.approval_status === "approved" ? "Unpublish" : "Approve");
  toggle.type = "button";
  toggle.addEventListener("click", async function () {
    const newStatus = item.approval_status === "approved" ? "draft" : "approved";
    const { error } = await db.from("resources").update({ approval_status: newStatus }).eq("id", item.id);
    if (error) showFormMessage("Could not update: " + error.message, true);
    loadList();
  });

  const remove = makeElement("button", "danger", "Delete");
  remove.type = "button";
  remove.addEventListener("click", async function () {
    if (!window.confirm('Delete "' + item.title + '"? This cannot be undone.')) return;
    const { error } = await db.from("resources").delete().eq("id", item.id);
    if (error) showFormMessage("Could not delete: " + error.message, true);
    loadList();
  });

  actions.append(toggle, remove);
  row.append(actions);
  return row;
}

async function loadList() {
  const { data, error } = await db
    .from("resources")
    .select("id, title, resource_type, source_name, approval_status")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    adminList.textContent = "Could not load resources: " + error.message;
    return;
  }

  if (data.length === 0) {
    adminList.textContent = "No resources yet.";
    return;
  }

  adminList.replaceChildren(...data.map(makeItem));
}

resourceForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const sourceUrl = document.getElementById("sourceUrl").value.trim();
  if (!sourceUrl.startsWith("https://")) {
    showFormMessage("The link must start with https://", true);
    return;
  }

  const button = resourceForm.querySelector("button[type=submit]");
  button.disabled = true;

  const yearText = document.getElementById("examYear").value;

  const record = {
    title: document.getElementById("title").value.trim(),
    resource_type: document.getElementById("resourceType").value,
    subject_name: document.getElementById("subjectName").value.trim() || null,
    curriculum: document.getElementById("curriculum").value.trim() || null,
    form_or_grade: document.getElementById("formOrGrade").value.trim() || null,
    education_level: document.getElementById("educationLevel").value || null,
    exam_year: yearText ? Number(yearText) : null,
    author: document.getElementById("author").value.trim() || null,
    description: document.getElementById("description").value.trim() || null,
    source_name: document.getElementById("sourceName").value.trim(),
    source_url: sourceUrl,
    licence: document.getElementById("licence").value.trim(),
    access_type: "external_link",
    approval_status: "draft",
    country_code: "KE"
  };

  const { error } = await db.from("resources").insert(record);

  if (error) {
    showFormMessage("Could not save: " + error.message, true);
  } else {
    resourceForm.reset();
    showFormMessage("Saved as a draft. Approve it in the list below to publish it.", false);
    loadList();
  }

  button.disabled = false;
});

checkAccess().then(function (allowed) {
  if (allowed) loadList();
});
