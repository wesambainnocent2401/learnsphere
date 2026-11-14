const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const chatStatus = document.getElementById("chatStatus");
const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");

const history = [];

function addBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className = "bubble " + role;
  bubble.textContent = text;
  chatLog.append(bubble);
  bubble.scrollIntoView({ behavior: "smooth", block: "end" });
  return bubble;
}

async function readError(error) {
  try {
    const body = await error.context.json();
    return body.error || "Something went wrong.";
  } catch (readFailure) {
    return "Could not reach the study assistant. Please try again.";
  }
}

async function start() {
  const { data } = await db.auth.getSession();

  if (!data.session) {
    chatStatus.textContent = "Please log in to use the study assistant.";
    const link = document.createElement("a");
    link.href = "login.html";
    link.textContent = " Log in";
    link.className = "text-link";
    chatStatus.append(link);
    return;
  }

  chatStatus.textContent = "Ask a question to begin.";
  chatForm.hidden = false;
}

chatForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  sendButton.disabled = true;
  history.push({ role: "user", content: text });
  addBubble("user", text);
  const thinking = addBubble("assistant thinking", "Thinking...");

  const { data, error } = await db.functions.invoke("study-assistant", {
    body: { messages: history.slice(-8) }
  });

  thinking.remove();

  if (error) {
    history.pop();
    chatStatus.textContent = await readError(error);
  } else {
    history.push({ role: "assistant", content: data.reply });
    addBubble("assistant", data.reply);
    chatStatus.textContent = data.remaining + " question(s) left today.";
  }

  sendButton.disabled = false;
});

start();
