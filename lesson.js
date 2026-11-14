const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const lessonTitle = document.getElementById("lessonTitle");
const lessonMeta = document.getElementById("lessonMeta");
const lessonSummary = document.getElementById("lessonSummary");
const objectivesArea = document.getElementById("objectivesArea");
const objectivesList = document.getElementById("objectivesList");
const lessonContent = document.getElementById("lessonContent");
const lessonNav = document.getElementById("lessonNav");
const lessonMessage = document.getElementById("lessonMessage");
const completeButton = document.getElementById("completeButton");

const params = new URLSearchParams(window.location.search);
const lessonId = params.get("id");
const pathId = params.get("path");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let loggedIn = false;
let isComplete = false;

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function updateButton() {
  completeButton.textContent = isComplete ? "Completed ✓ (tap to undo)" : "Mark as complete";
  completeButton.className = isComplete ? "" : "primary";
}

async function addNavigation() {
  if (!pathId || !UUID_PATTERN.test(pathId)) return;

  const back = makeElement("a", "", "Back to pathway");
  back.href = "pathways.html?id=" + encodeURIComponent(pathId);
  lessonNav.append(back);

  const { data } = await db
    .from("learning_path_items")
    .select("lesson_id, position")
    .eq("path_id", pathId)
    .order("position");

  if (!data) return;

  const index = data.findIndex(function (item) { return item.lesson_id === lessonId; });
  if (index >= 0 && index < data.length - 1) {
    const next = makeElement("a", "primary", "Next lesson");
    next.href = "lesson.html?id=" + encodeURIComponent(data[index + 1].lesson_id) + "&path=" + encodeURIComponent(pathId);
    lessonNav.append(next);
  }
}

async function loadLesson() {
  if (!UUID_PATTERN.test(lessonId)) {
    lessonTitle.textContent = "That lesson link is not valid.";
    return;
  }

  const { data: lesson, error } = await db
    .from("lessons")
    .select("title, summary, objectives, content, estimated_minutes")
    .eq("id", lessonId)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !lesson) {
    lessonTitle.textContent = "This lesson could not be found.";
    return;
  }

  document.title = lesson.title + " | LearnSphere";
  lessonTitle.textContent = lesson.title;
  lessonMeta.textContent = lesson.estimated_minutes ? lesson.estimated_minutes + " minute read" : "";
  lessonSummary.textContent = lesson.summary || "";

  if (lesson.objectives) {
    lesson.objectives.split("\n").map(function (line) { return line.trim(); }).filter(Boolean).forEach(function (line) {
      objectivesList.append(makeElement("li", "", line));
    });
    objectivesArea.hidden = false;
  }

  lesson.content.split(/\n\s*\n/).forEach(function (paragraph) {
    const block = makeElement("p");
    paragraph.split("\n").forEach(function (line, index) {
      if (index > 0) block.append(document.createElement("br"));
      block.append(document.createTextNode(line));
    });
    lessonContent.append(block);
  });

  const { data: sessionData } = await db.auth.getSession();
  loggedIn = Boolean(sessionData.session);

  if (loggedIn) {
    const { data: rows } = await db.from("lesson_progress").select("lesson_id").eq("lesson_id", lessonId);
    isComplete = Boolean(rows && rows.length > 0);
  }

  updateButton();
  lessonNav.hidden = false;
  await addNavigation();
}

completeButton.addEventListener("click", async function () {
  if (!loggedIn) {
    window.location.href = "login.html";
    return;
  }

  completeButton.disabled = true;
  lessonMessage.hidden = true;

  const result = isComplete
    ? await db.from("lesson_progress").delete().eq("lesson_id", lessonId)
    : await db.from("lesson_progress").insert({ lesson_id: lessonId });

  if (result.error) {
    lessonMessage.hidden = false;
    lessonMessage.className = "auth-message auth-error";
    lessonMessage.textContent = "Could not save your progress: " + result.error.message;
  } else {
    isComplete = !isComplete;
    updateButton();
  }

  completeButton.disabled = false;
});

loadLesson();
