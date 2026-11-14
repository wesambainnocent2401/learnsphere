const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const pageTitle = document.getElementById("pageTitle");
const quizStatus = document.getElementById("quizStatus");
const quizList = document.getElementById("quizList");
const quizForm = document.getElementById("quizForm");
const submitQuiz = document.getElementById("submitQuiz");
const scoreArea = document.getElementById("scoreArea");
const historyArea = document.getElementById("historyArea");
const historyList = document.getElementById("historyList");

const quizId = new URLSearchParams(window.location.search).get("id");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let questions = [];
let submitted = false;

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

async function loadList() {
  const { data, error } = await db
    .from("quizzes")
    .select("id, title, description, subject_name, curriculum")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (error) {
    quizStatus.textContent = "Could not load quizzes: " + error.message;
    return;
  }

  quizStatus.textContent = data.length === 0 ? "No quizzes yet." : data.length + " quiz(zes) available";

  data.forEach(function (quiz) {
    const card = makeElement("a", "quiz-card");
    card.href = "quizzes.html?id=" + encodeURIComponent(quiz.id);
    card.append(makeElement("h3", "", quiz.title));
    const tags = [quiz.subject_name, quiz.curriculum].filter(Boolean).join(" · ");
    if (tags) card.append(makeElement("p", "", tags));
    if (quiz.description) card.append(makeElement("p", "", quiz.description));
    quizList.append(card);
  });

  loadHistory();
}

async function loadHistory() {
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session) return;

  const { data } = await db
    .from("quiz_attempts")
    .select("score, total, submitted_at, quizzes(title)")
    .order("submitted_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return;

  historyArea.hidden = false;
  data.forEach(function (row) {
    const line = makeElement("div", "history-row");
    line.append(makeElement("span", "", row.quizzes ? row.quizzes.title : "Quiz"));
    line.append(makeElement("strong", "", row.score + " / " + row.total));
    historyList.append(line);
  });
}

function makeQuestion(question, index) {
  const box = makeElement("div", "quiz-question");
  box.dataset.id = question.id;
  box.append(makeElement("h3", "", (index + 1) + ". " + question.prompt));

  if (question.question_type === "numeric") {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.className = "quiz-number";
    input.name = "q_" + question.id;
    input.placeholder = "Your answer";
    box.append(input);
  } else {
    question.quiz_options
      .slice()
      .sort(function (a, b) { return a.position - b.position; })
      .forEach(function (option) {
        const label = makeElement("label", "quiz-option");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "q_" + question.id;
        radio.value = option.id;
        label.append(radio, makeElement("span", "", option.label));
        box.append(label);
      });
  }

  return box;
}

async function loadQuiz() {
  if (!UUID_PATTERN.test(quizId)) {
    quizStatus.textContent = "That quiz link is not valid.";
    return;
  }

  const { data: quiz, error } = await db
    .from("quizzes")
    .select("title, description, questions(id, position, prompt, question_type, quiz_options(id, position, label))")
    .eq("id", quizId)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !quiz) {
    quizStatus.textContent = "This quiz could not be found.";
    return;
  }

  pageTitle.textContent = quiz.title;
  questions = quiz.questions.slice().sort(function (a, b) { return a.position - b.position; });

  if (questions.length === 0) {
    quizStatus.textContent = "This quiz has no questions yet.";
    return;
  }

  quizStatus.textContent = questions.length + " questions. Answer them all, then submit.";
  quizForm.replaceChildren(...questions.map(makeQuestion));
  quizForm.hidden = false;
  submitQuiz.hidden = false;
}

function collectAnswers() {
  const answers = {};

  questions.forEach(function (question) {
    const name = "q_" + question.id;

    if (question.question_type === "numeric") {
      const value = quizForm.elements[name].value.trim();
      if (value !== "") answers[question.id] = value;
    } else {
      const chosen = quizForm.querySelector('input[name="' + name + '"]:checked');
      if (chosen) answers[question.id] = chosen.value;
    }
  });

  return answers;
}

function showResults(result) {
  scoreArea.replaceChildren(
    makeElement("div", "score-box", "You scored " + result.score + " / " + result.total)
  );

  result.results.forEach(function (item) {
    const box = quizForm.querySelector('.quiz-question[data-id="' + item.question_id + '"]');
    if (!box) return;

    box.classList.add(item.correct ? "right" : "wrong");

    const feedback = makeElement("div", "quiz-feedback " + (item.correct ? "right" : "wrong"));
    feedback.append(makeElement("span", "", item.correct ? "Correct" : "Not quite. Correct answer: " + item.correct_answer));
    if (item.explanation) feedback.append(makeElement("p", "", item.explanation));
    box.append(feedback);
  });

  quizForm.querySelectorAll("input").forEach(function (input) { input.disabled = true; });
  submitQuiz.hidden = true;
  scoreArea.scrollIntoView({ behavior: "smooth", block: "start" });
}

quizForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (submitted) return;

  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "login.html";
    return;
  }

  submitQuiz.disabled = true;

  const { data, error } = await db.rpc("submit_quiz", {
    p_quiz_id: quizId,
    p_answers: collectAnswers()
  });

  if (error) {
    quizStatus.textContent = error.message;
    submitQuiz.disabled = false;
    return;
  }

  submitted = true;
  showResults(data);
});

if (quizId) {
  loadQuiz();
} else {
  loadList();
}
