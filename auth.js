const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById("authForm");
const messageBox = document.getElementById("authMessage");
const mode = form.dataset.mode;

function showMessage(text, isError) {
  messageBox.hidden = false;
  messageBox.textContent = text;
  messageBox.className = "auth-message " + (isError ? "auth-error" : "auth-success");
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();

  const button = form.querySelector("button[type=submit]");
  button.disabled = true;

  try {
    const email = form.email.value.trim();
    const password = form.password.value;

    if (mode === "register") {
      const displayName = form.displayName.value.trim();

      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (password !== form.confirmPassword.value) throw new Error("Passwords do not match.");

      const { error } = await db.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: window.location.origin + "/login.html"
        }
      });
      if (error) throw error;

      form.reset();
      showMessage("Account created. Check your email and tap the confirmation link, then log in.", false);
    } else {
      const { error } = await db.auth.signInWithPassword({ email: email, password: password });
      if (error) throw new Error("Incorrect email or password, or your email is not confirmed yet.");

      window.location.href = "dashboard.html";
      return;
    }
  } catch (error) {
    showMessage(error.message, true);
  }

  button.disabled = false;
});

// Login page: if someone is already logged in, send them to the dashboard
async function checkSession() {
  if (mode !== "login") return;

  const { data } = await db.auth.getSession();
  if (data.session) {
    window.location.replace("dashboard.html");
  }
}

checkSession();
