const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MAX_ROWS = 5000;
const MAX_BYTES = 2 * 1024 * 1024;
const BATCH_SIZE = 200;
const HEADER = ["institution_slug", "name", "level", "field", "duration", "source_url"];
const LEVELS = ["certificate", "diploma", "undergraduate", "postgraduate_diploma", "masters", "phd"];
const LEVEL_ALIASES = {
  bachelor: "undergraduate",
  bachelors: "undergraduate",
  degree: "undergraduate",
  pgd: "postgraduate_diploma",
  master: "masters",
  doctorate: "phd"
};

const importStatus = document.getElementById("importStatus");
const importArea = document.getElementById("importArea");
const csvFile = document.getElementById("csvFile");
const importMessage = document.getElementById("importMessage");
const errorList = document.getElementById("errorList");
const importButton = document.getElementById("importButton");

let validRows = [];
let fileName = "";
let institutionIds = new Map();

function showMessage(text, isError) {
  importMessage.hidden = false;
  importMessage.textContent = text;
  importMessage.className = "auth-message " + (isError ? "auth-error" : "auth-success");
}

// Small CSV reader that understands quotes, commas and line breaks inside quotes
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { cell += char; }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell); cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(function (value) { return value.trim() !== ""; })) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(function (value) { return value.trim() !== ""; })) rows.push(row);
  return rows;
}

function checkRow(values, lineNumber) {
  const slug = (values[0] || "").trim().toLowerCase();
  const name = (values[1] || "").trim();
  let level = (values[2] || "").trim().toLowerCase();
  const field = (values[3] || "").trim();
  const duration = (values[4] || "").trim();
  const sourceUrl = (values[5] || "").trim();

  level = LEVEL_ALIASES[level] || level;

  if (!institutionIds.has(slug)) return "Line " + lineNumber + ": unknown university slug '" + slug + "'";
  if (name.length < 2 || name.length > 250) return "Line " + lineNumber + ": course name must be 2 to 250 characters";
  if (!LEVELS.includes(level)) return "Line " + lineNumber + ": level '" + level + "' is not allowed";
  if (field.length > 100) return "Line " + lineNumber + ": field is too long";
  if (duration.length > 40) return "Line " + lineNumber + ": duration is too long";
  if (sourceUrl && !sourceUrl.startsWith("https://")) return "Line " + lineNumber + ": link must start with https://";

  return {
    institution_id: institutionIds.get(slug),
    name: name,
    level: level,
    field: field || null,
    duration: duration || null,
    source_url: sourceUrl || null
  };
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
    importStatus.textContent = "Could not check your access.";
    return false;
  }

  const names = roleRows.map(function (row) { return row.roles.name; });
  if (!names.includes("admin") && !names.includes("super_admin")) {
    importStatus.textContent = "Only administrators can import courses.";
    return false;
  }

  const { data: institutions, error: loadError } = await db
    .from("institutions")
    .select("id, slug")
    .limit(2000);

  if (loadError) {
    importStatus.textContent = "Could not load universities: " + loadError.message;
    return false;
  }

  institutions.forEach(function (item) { institutionIds.set(item.slug, item.id); });
  importStatus.textContent = "Signed in as an administrator. " + institutions.length + " universities available.";
  return true;
}

csvFile.addEventListener("change", function () {
  const file = csvFile.files[0];
  validRows = [];
  importButton.disabled = true;
  errorList.replaceChildren();
  importMessage.hidden = true;

  if (!file) return;

  if (file.size > MAX_BYTES) {
    showMessage("File is too large. Maximum is 2 MB.", true);
    return;
  }

  fileName = file.name;
  const reader = new FileReader();

  reader.onload = function () {
    const rows = parseCsv(String(reader.result).replace(/^\uFEFF/, ""));

    if (rows.length < 2) {
      showMessage("The file has no data rows.", true);
      return;
    }

    const header = rows[0].map(function (value) { return value.trim().toLowerCase(); });
    if (header.join(",") !== HEADER.join(",")) {
      showMessage("The first row must be exactly: " + HEADER.join(","), true);
      return;
    }

    if (rows.length - 1 > MAX_ROWS) {
      showMessage("Too many rows. Maximum is " + MAX_ROWS + ".", true);
      return;
    }

    const problems = [];
    const seen = new Set();

    rows.slice(1).forEach(function (values, index) {
      const result = checkRow(values, index + 2);

      if (typeof result === "string") {
        problems.push(result);
        return;
      }

      const key = result.institution_id + "|" + result.name.toLowerCase() + "|" + result.level;
      if (seen.has(key)) return;
      seen.add(key);
      validRows.push(result);
    });

    problems.slice(0, 15).forEach(function (text) {
      const item = document.createElement("li");
      item.textContent = text;
      errorList.append(item);
    });

    showMessage(
      validRows.length + " valid row(s), " + problems.length + " problem row(s)." +
      (problems.length > 15 ? " Showing the first 15 problems." : ""),
      validRows.length === 0
    );

    importButton.disabled = validRows.length === 0;
  };

  reader.readAsText(file);
});

importButton.addEventListener("click", async function () {
  importButton.disabled = true;
  let failed = 0;

  for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
    const batch = validRows.slice(start, start + BATCH_SIZE);

    const { error } = await db
      .from("programmes")
      .upsert(batch, { onConflict: "institution_id,name,level", ignoreDuplicates: true });

    if (error) {
      failed += batch.length;
      showMessage("Stopped at row " + (start + 1) + ": " + error.message, true);
      break;
    }

    showMessage("Imported " + Math.min(start + BATCH_SIZE, validRows.length) + " of " + validRows.length + "...", false);
  }

  if (failed === 0) {
    await db.rpc("record_import", {
      p_table: "programmes",
      p_rows: validRows.length,
      p_note: fileName.slice(0, 200)
    });
    showMessage("Done. " + validRows.length + " row(s) processed. Duplicates were skipped.", false);
    validRows = [];
    csvFile.value = "";
  } else {
    importButton.disabled = false;
  }
});

checkAccess().then(function (allowed) {
  if (allowed) importArea.hidden = false;
});
