const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const financeStatus = document.getElementById("financeStatus");
const financeArea = document.getElementById("financeArea");
const summaryBlocks = document.getElementById("summaryBlocks");
const settlementList = document.getElementById("settlementList");
const settlementForm = document.getElementById("settlementForm");
const financeMessage = document.getElementById("financeMessage");

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function money(minor, currency) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: currency }).format((minor || 0) / 100);
}

function showMessage(text, isError) {
  financeMessage.hidden = false;
  financeMessage.textContent = text;
  financeMessage.className = "auth-message " + (isError ? "auth-error" : "auth-success");
}

function makeCard(title, value, note) {
  const card = makeElement("section", "dash-card");
  card.append(makeElement("h3", "", title));
  card.append(makeElement("p", "plan-price", value));
  if (note) card.append(makeElement("p", "", note));
  return card;
}

function renderSummary(summary) {
  summaryBlocks.replaceChildren();

  const settledByCurrency = {};
  summary.settled.forEach(function (row) { settledByCurrency[row.currency] = row; });

  const currencies = summary.payments.length > 0 ? summary.payments : [{
    currency: "KES", today_minor: 0, month_minor: 0, total_minor: 0, refunded_minor: 0,
    paid_count: 0, failed_count: 0, pending_count: 0
  }];

  currencies.forEach(function (row) {
    const settled = settledByCurrency[row.currency] || { gross_minor: 0, fees_minor: 0, net_minor: 0 };
    const unsettled = Math.max(0, row.total_minor - row.refunded_minor - settled.gross_minor);

    summaryBlocks.append(makeElement("h2", "finance-heading", row.currency));

    const grid = makeElement("div", "dash-grid");
    grid.append(makeCard("Collected today", money(row.today_minor, row.currency)));
    grid.append(makeCard("Collected this month", money(row.month_minor, row.currency)));
    grid.append(makeCard("Collected in total", money(row.total_minor, row.currency), row.paid_count + " paid payments"));
    grid.append(makeCard("Refunded", money(row.refunded_minor, row.currency)));
    grid.append(makeCard("Settled to you (after fees)", money(settled.net_minor, row.currency), "Fees recorded: " + money(settled.fees_minor, row.currency)));
    grid.append(makeCard("Not yet settled (estimate)", money(unsettled, row.currency), "Collected minus refunds minus settled gross"));
    grid.append(makeCard("Failed payments", String(row.failed_count)));
    grid.append(makeCard("Pending payments", String(row.pending_count)));
    summaryBlocks.append(grid);
  });

  const subscribers = makeElement("div", "dash-grid");
  subscribers.append(makeCard("Active paying subscribers", String(summary.active_subscribers)));
  summaryBlocks.append(subscribers);
}

async function loadSettlements() {
  const { data, error } = await db
    .from("settlement_records")
    .select("provider, currency, gross_minor, fees_minor, net_minor, settled_on, note")
    .order("settled_on", { ascending: false })
    .limit(20);

  if (error) {
    settlementList.textContent = "Could not load settlements: " + error.message;
    return;
  }

  settlementList.replaceChildren();

  if (data.length === 0) {
    settlementList.textContent = "No settlements recorded yet.";
    return;
  }

  data.forEach(function (row) {
    const line = makeElement("div", "history-row");
    const left = row.settled_on + " · " + row.provider + (row.note ? " · " + row.note : "");
    line.append(makeElement("span", "", left));
    line.append(makeElement("strong", "", money(row.net_minor, row.currency) + " net"));
    settlementList.append(line);
  });
}

async function loadSummary() {
  const { data, error } = await db.rpc("finance_summary");

  if (error) {
    financeStatus.textContent = "Could not load the summary: " + error.message;
    return;
  }

  financeStatus.textContent = "Figures update each time you open this page.";
  renderSummary(data);
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
    financeStatus.textContent = "Could not check your access.";
    return false;
  }

  const isOwner = roleRows.some(function (row) { return row.roles.name === "super_admin"; });
  if (!isOwner) {
    financeStatus.textContent = "Only the owner can see this page.";
    return false;
  }

  return true;
}

settlementForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const button = settlementForm.querySelector("button[type=submit]");
  button.disabled = true;

  const gross = Math.round(Number(document.getElementById("settleGross").value) * 100);
  const fees = Math.round(Number(document.getElementById("settleFees").value) * 100);

  const { error } = await db.from("settlement_records").insert({
    provider: document.getElementById("settleProvider").value.trim(),
    currency: document.getElementById("settleCurrency").value.trim().toUpperCase(),
    gross_minor: gross,
    fees_minor: fees,
    settled_on: document.getElementById("settleDate").value,
    note: document.getElementById("settleNote").value.trim() || null
  });

  if (error) {
    showMessage("Could not save: " + error.message, true);
  } else {
    showMessage("Settlement recorded.", false);
    settlementForm.reset();
    document.getElementById("settleCurrency").value = "KES";
    document.getElementById("settleFees").value = "0";
    loadSummary();
    loadSettlements();
  }

  button.disabled = false;
});

checkAccess().then(function (allowed) {
  if (allowed) {
    financeArea.hidden = false;
    loadSummary();
    loadSettlements();
  }
});
