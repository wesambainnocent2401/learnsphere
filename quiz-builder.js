const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const builderStatus = document.getElementById("builderStatus");
const builderArea = document.getElementById("builderArea");
const builderForm = document.getElementById("quizBuilderForm");
const builderMessage = document.getElementById("builderMessage");
const questionList = document.getElementById("questionList");
const publishRow = document.getElementById("publishRow");

let canPublish = false;

function showMessage(text, isError) {
  builderMessage.hidden = false;
  builderMessage.textContent = text;
  builderMessage.className = "auth-message " + (isError ? "auth-error" : "auth-success");
}

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function makeField(labelText, input, hint) {
  const wrapper = document.createElement("div");
  wrapper.append(makeElement("label", "", labelText), input);
  if (hint) wrapper.append(makeElement("p", "field-hint", hint));
  return wrapper;
}

function renumber() {
  questionList.querySelectorAll(".builder-question").forEach(function (box, index) {
    box.querySelector("h3").textContent = "Question " + (index + 1);
  });
}

function addQuestion() {
  if (questionList.children.length >= 50) {
    showMessage("A quiz can have at most 50 questions.", true);
    return;
  }

  const box = makeElement("div", "builder-question");
  box.append(makeElement("h3", "", "Question"));

  const prompt = document.createElement("textarea");
  prompt.className = "q-prompt";
  prompt.maxLength = 1000;
  box.append(makeField("Question text", prompt));

  const type = document.createElement("select");
  type.className = "q-type";
  [["multiple_choice", "Multiple choice"], ["true_false", "True or false"], ["numeric", "Number answer"]].forEach(function (pair) {
    const option = document.createElement("option");
    option.value = pair[0];
    option.textContent = pair[1];
    type.append(option);
  });
  box.append(makeField("Type", type));

  const optionsText = document.createElement("textarea");
  optionsText.className = "q-options";
  const optionsField = makeField("Options (one per line, 2 to 6)", optionsText);
  box.append(optionsField);

  const correctIndex = document.createElement("input");
  correctIndex.type = "number";
  correctIndex.min = "1";
  correctIndex.max = "6";
  correctIndex.className = "q-correct-index";
  const correctIndexField = makeField("Number of the correct option", correctIndex, "For true or false: 1 means True, 2 means False.");
  box.append(correctIndexField);

  const correctNumber = document.createElement("input");
  correctNumber.type = "number";
  correctNumber.step = "any";
  correctNumber.className = "q-correct-number";
  const correctNumberField = makeField("Correct number", correctNumber);
  box.append(correctNumberField);

  const tolerance = document.createElement("input");
  tolerance.type = "number";
  tolerance.step = "any";
  tolerance.min = "0";
  tolerance.value = "0";
  tolerance.className = "q-tolerance";
  const toleranceField = makeField("Allowed difference", tolerance, "0 means the answer must match exactly.");
  box.append(toleranceField);

  const explanation = document.createElement("textarea");
  explanation.className = "q-explanation";
  explanation.maxLength = 1500;
  box.append(makeField("Explanation shown after submitting", explanation));

  const remove = makeElement("button", "small-button danger", "Remove question");
  remove.type = "button";
  remove.addEventListener("click", function () {
    box.remove();
    renumber();
  });
  box.append(remove);

  function syncType() {
    const kind = type.value;
    optionsField.hidden = kind !== "multiple_choice";
    correctIndexField.hidden = kind === "numeric";
    correctNumberField.hidden = kind !== "numeric";
    toleranceField.hidden = kind !== "numeric";
  }
  type.addEventListener("change", syncType);
  syncType();

  questionList.append(box);
  renumber();
}

function collectQuestions() {
  const questions = [];

  questionList.querySelectorAll(".builder-question").forEach(function (box, index) {
    const kind = box.querySelector(".q-type").value;
    const item = {
      prompt: box.querySelector(".q-prompt").value.trim(),
      type: kind,
      explanation: box.querySelector(".q-explanation").value.trim()
    };

    if (item.prompt.length < 3) throw new Error("Question " + (index + 1) + " needs text.");

    if (kind === "numeric") {
      const value = box.querySelector(".q-correct-number").value;
      if (value === "") throw new Error("Question " + (index + 1) + " needs a correct number.");
      item.correct_numeric = Number(value);
      item.tolerance = Number(box.querySelector(".q-tolerance").value || 0);
    } else {
      const picked = Number(box.querySelector(".q-correct-index").value);
      if (!Number.isInteger(picked) || picked < 1) throw new Error("Question " + (index + 1) + " needs the number of the correct option.");
      item.correct_index = picked - 1;

      if (kind === "multiple_choice") {
        item.options = box.querySelector(".q-options").value
          .split("\n")
          .map(function (line) { return line.trim(); })
          .filter(Boolean);
        if (item.options.length < 2 || item.options.length > 6) throw new Error("Question " + (index + 1) + " needs 2 to 6 options.");
        if (picked > item.options.length) throw new Error("Question " + (index + 1) + ": the correct option number is too high.");
      } else if (picked > 2) {
        throw new Error("Question " + (index + 1) + ": use 1 for True or 2 for False.");
      }
    }

    questions.push(item);
  });

  return questions;
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
    builderStatus.textContent = "Could not check your access.";
    return false;
  }

  const names = roleRows.map(function (row) { return row.roles.name; });
  const allowed = ["teacher", "content_manager", "admin", "super_admin"].some(function (role) { return names.includes(role); });

  if (!allowed) {
    builderStatus.textContent = "Only teachers and administrators can create quizzes.";
    return false;
  }

  canPublish = ["content_manager", "admin", "super_admin"].some(function (role) { return names.includes(role); });
  publishRow.hidden = !canPublish;
  builderStatus.textContent = canPublish
    ? "You can create and publish quizzes."
    : "Your quizzes are saved as drafts until an administrator publishes them.";
  return true;
}

document.getElementById("addQuestion").addEventListener("click", addQuestion);

builderForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const button = builderForm.querySelector("button[type=submit]");
  button.disabled = true;

  try {
    const payload = {
      title: document.getElementById("quizTitle").value.trim(),
      subject_name: document.getElementById("quizSubject").value.trim(),
      curriculum: document.getElementById("quizCurriculum").value.trim(),
      education_level: document.getElementById("quizLevel").value.trim(),
      description: document.getElementById("quizDescription").value.trim(),
      publish: canPublish && document.getElementById("publishNow").checked,
      questions: collectQuestions()
    };

    if (payload.questions.length === 0) throw new Error("Add at least one question.");

    const { error } = await db.rpc("create_quiz", { p_quiz: payload });
    if (error) throw new Error(error.message);

    builderForm.reset();
    questionList.replaceChildren();
    addQuestion();
    showMessage(payload.publish ? "Quiz saved and published." : "Quiz saved as a draft.", false);
  } catch (error) {
    showMessage(error.message, true);
  }

  button.disabled = false;
});

checkAccess().then(function (allowed) {
  if (allowed) {
    builderArea.hidden = false;
    addQuestion();
  }
});
