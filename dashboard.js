const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const welcome = document.getElementById("welcome");
const emailLine = document.getElementById("emailLine");
const roleList = document.getElementById("roleList");
const adminCard = document.getElementById("adminCard");
const userCount = document.getElementById("userCount");

async function loadDashboard() {
  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    window.location.replace("login.html");
    return;
  }

  emailLine.textContent = session.user.email;

  const { data: profile } = await db
    .from("profiles")
    .select("display_name")
    .eq("id", session.user.id)
    .single();

  const name = profile && profile.display_name ? profile.display_name : "learner";
  welcome.textContent = "Welcome, " + name;

  const { data: roleRows, error } = await db
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", session.user.id);

  if (error) {
    roleList.textContent = "Could not load your roles.";
    return;
  }

  const roleNames = roleRows.map(function (row) { return row.roles.name; });

  roleNames.forEach(function (roleName) {
    const badge = document.createElement("span");
    badge.className = "role-badge";
    badge.textContent = roleName.replace("_", " ");
    roleList.appendChild(badge);
  });

  const isAdmin = roleNames.includes("admin") || roleNames.includes("super_admin");
  if (isAdmin) {
    // The database only returns all users to admins; everyone else sees just themselves
    const { count } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true });

    adminCard.hidden = false;
    userCount.textContent = "Registered users: " + count;
  }
}

document.getElementById("logoutButton").addEventListener("click", async function () {
  await db.auth.signOut();
  window.location.replace("login.html");
});

loadDashboard();
