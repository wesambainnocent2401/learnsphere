
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const welcome = document.getElementById("welcome");
const emailLine = document.getElementById("emailLine");
const roleList = document.getElementById("roleList");
const adminCard = document.getElementById("adminCard");
const userCount = document.getElementById("userCount");

const savedBooksStatus = document.getElementById("savedBooksStatus");
const savedBooksGrid = document.getElementById("savedBooksGrid");

let currentUser = null;

async function loadDashboard() {
  const { data: sessionData, error: sessionError } = await db.auth.getSession();

  if (sessionError || !sessionData.session) {
    window.location.replace("login.html");
    return;
  }

  const session = sessionData.session;
  currentUser = session.user;

  emailLine.textContent = currentUser.email;

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("display_name")
    .eq("id", currentUser.id)
    .single();

  const name = !profileError && profile && profile.display_name
    ? profile.display_name
    : "learner";

  welcome.textContent = "Welcome, " + name;

  const { data: roleRows, error: roleError } = await db
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", currentUser.id);

  if (roleError) {
    roleList.textContent = "Could not load your roles.";
  } else {
    roleList.replaceChildren();

    const roleNames = roleRows
      .map(function (row) {
        return row.roles ? row.roles.name : null;
      })
      .filter(Boolean);

    roleNames.forEach(function (roleName) {
      const badge = document.createElement("span");
      badge.className = "role-badge";
      badge.textContent = roleName.replace("_", " ");
      roleList.appendChild(badge);
    });

    const isAdmin = roleNames.includes("admin") ||
      roleNames.includes("super_admin");

    if (isAdmin) {
      const { count, error: countError } = await db
        .from("profiles")
        .select("id", { count: "exact", head: true });

      adminCard.hidden = false;

      userCount.textContent = countError
        ? "Could not load registered user count."
        : "Registered users: " + count;
    }
  }

  await loadSavedBooks();
}

function createSavedBookCard(book) {
  const card = document.createElement("article");
  card.className = "book-result";

  const cover = document.createElement("div");
  cover.className = "book-cover";

  if (Number.isInteger(book.cover_id)) {
    const image = document.createElement("img");
    image.src = "https://covers.openlibrary.org/b/id/" +
      book.cover_id + "-M.jpg";
    image.alt = "Cover of " + book.title;
    image.loading = "lazy";
    cover.appendChild(image);
  } else {
    cover.textContent = "📖";
  }

  const info = document.createElement("div");
  info.className = "book-info";

  const title = document.createElement("h3");
  title.textContent = book.title || "Untitled book";

  const author = document.createElement("p");
  author.className = "book-meta";
  author.textContent = book.author || "Unknown author";

  info.append(title, author);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "save-button";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", function () {
    removeSavedBook(book, removeButton);
  });

  card.append(cover, info, removeButton);

  return card;
}

async function loadSavedBooks() {
  savedBooksStatus.textContent = "Loading your saved books...";
  savedBooksGrid.replaceChildren();

  const { data: books, error } = await db
    .from("bookmarks")
    .select("id, external_id, title, author, cover_id, source")
    .eq("source", "openlibrary")
    .order("created_at", { ascending: false });

  if (error) {
    savedBooksStatus.textContent =
      "Could not load your saved books. Please try again.";
    console.error("Saved books error:", error);
    return;
  }

  if (!books || books.length === 0) {
    savedBooksStatus.textContent =
      "You haven't saved any books yet. Visit the library to discover books.";
    return;
  }

  books.forEach(function (book) {
    savedBooksGrid.appendChild(createSavedBookCard(book));
  });

  savedBooksStatus.textContent =
    "You have saved " + books.length +
    (books.length === 1 ? " book." : " books.");
}

async function removeSavedBook(book, button) {
  if (!currentUser) return;

  const confirmed = window.confirm(
    'Remove "' + book.title + '" from your saved books?'
  );

  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Removing...";

  const { error } = await db
    .from("bookmarks")
    .delete()
    .eq("source", "openlibrary")
    .eq("external_id", book.external_id);

  if (error) {
    button.disabled = false;
    button.textContent = "Remove";
    savedBooksStatus.textContent =
      "Could not remove this book. Please try again.";
    console.error("Remove bookmark error:", error);
    return;
  }

  await loadSavedBooks();
}

document.getElementById("logoutButton").addEventListener(
  "click",
  async function () {
    await db.auth.signOut();
    window.location.replace("login.html");
  }
);

loadDashboard();
