const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const pathTitle = document.getElementById("pathTitle");
const pathDescription = document.getElementById("pathDescription");
const pathStatus = document.getElementById("pathStatus");
const pathList = document.getElementById("pathList");
const lessonList = document.getElementById("lessonList");
const progressArea = document.getElementById("progressArea");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const enrolButton = document.getElementById("enrolButton");

const pathId = new URLSearchParams(window.location.search).get("id");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

async function loadList() {
  const { data, error } = await db
    .from("learning_paths")
    .select("id, title, description, subject_name, level, learning_path_items(count)")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (error) {
    pathStatus.textContent = "Could not load pathways: " + error.message;
    return;
  }

  pathStatus.textContent = data.length === 0 ? "No pathways yet." : data.length + " pathway(s) available";

  data.forEach(function (path) {
    const lessonCount = path.learning_path_items && path.learning_path_items[0] ? path.learning_path_items[0].count : 0;
    const card = makeElement("a", "quiz-card");
    card.href = "pathways.html?id=" + encodeURIComponent(path.id);
    card.append(makeElement("h3", "", path.title));
    const tags = [path.subject_name, path.level, lessonCount + " lessons"].filter(Boolean).join(" · ");
    card.append(makeElement("p", "", tags));
    if (path.description) card.append(makeElement("p", "", path.description));
    pathList.append(card);
  });
}

async function loadPath() {
  if (!UUID_PATTERN.test(pathId)) {
    pathStatus.textContent = "That pathway link is not valid.";
    return;
  }

  const { data: path, error } = await db
    .from("learning_paths")
    .select("title, description, learning_path_items(position, lessons(id, title, estimated_minutes))")
    .eq("id", pathId)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !path) {
    pathStatus.textContent = "This pathway could not be found.";
    return;
  }

  pathTitle.textContent = path.title;
  pathDescription.textContent = path.description || "";
  pathStatus.textContent = "";

  const items = path.learning_path_items
    .filter(function (item) { return item.lessons; })
    .sort(function (a, b) { return a.position - b.position; });

  const { data: sessionData } = await db.auth.getSession();
  const loggedIn = Boolean(sessionData.session);

  const completed = new Set();
  let enrolled = false;

  if (loggedIn) {
    const { data: progressRows } = await db.from("lesson_progress").select("lesson_id");
    (progressRows || []).forEach(function (row) { completed.add(row.lesson_id); });

    const { data: enrolRows } = await db.from("pathway_enrolments").select("path_id").eq("path_id", pathId);
    enrolled = Boolean(enrolRows && enrolRows.length > 0);
  }

  const doneCount = items.filter(function (item) { return completed.has(item.lessons.id); }).length;

  progressArea.hidden = false;
  progressText.textContent = loggedIn
    ? doneCount + " of " + items.length + " lessons complete"
    : items.length + " lessons. Log in to track your progress.";
  progressFill.style.width = (items.length ? Math.round((doneCount / items.length) * 100) : 0) + "%";

  if (loggedIn && !enrolled) {
    enrolButton.hidden = false;
    enrolButton.addEventListener("click", async function () {
      enrolButton.disabled = true;
      const { error: enrolError } = await db.from("pathway_enrolments").insert({ path_id: pathId });
      if (enrolError) {
        pathStatus.textContent = "Could not enrol: " + enrolError.message;
        enrolButton.disabled = false;
        return;
      }
      enrolButton.hidden = true;
    });
  } else if (!loggedIn) {
    enrolButton.textContent = "Log in to enrol";
    enrolButton.hidden = false;
    enrolButton.addEventListener("click", function () { window.location.href = "login.html"; });
  }

  items.forEach(function (item, index) {
    const lesson = item.lessons;
    const row = makeElement("a", "lesson-row" + (completed.has(lesson.id) ? " done" : ""));
    row.href = "lesson.html?id=" + encodeURIComponent(lesson.id) + "&path=" + encodeURIComponent(pathId);

    row.append(makeElement("span", "lesson-number", completed.has(lesson.id) ? "✓" : String(index + 1)));

    const text = makeElement("div");
    text.append(makeElement("strong", "", lesson.title));
    if (lesson.estimated_minutes) text.append(makeElement("small", "", lesson.estimated_minutes + " min"));
    row.append(text);

    lessonList.append(row);
  });
}

if (pathId) {
  loadPath();
} else {
  loadList();
}
