const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const planStatus = document.getElementById("planStatus");
const planGrid = document.getElementById("planGrid");

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function formatPrice(minor, currency) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0
  }).format(minor / 100);
}

function makePlanCard(plan) {
  const card = makeElement("article", "plan-card featured");
  card.append(makeElement("h3", "", plan.name));

  const price = makeElement("div", "plan-price", formatPrice(plan.price_minor, plan.currency));
  price.append(makeElement("small", "", plan.billing_interval === "annual" ? " / year" : " / month"));
  card.append(price);

  if (plan.description) card.append(makeElement("p", "", plan.description));

  if (Array.isArray(plan.features)) {
    const list = document.createElement("ul");
    plan.features.forEach(function (feature) {
      list.append(makeElement("li", "", String(feature)));
    });
    card.append(list);
  }

  const button = makeElement("button", "plan-button", "Payments open soon");
  button.type = "button";
  button.disabled = true;
  card.append(button);

  return card;
}

async function showCurrentPlan() {
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session) return;

  const { data } = await db
    .from("subscriptions")
    .select("current_period_end")
    .eq("status", "active")
    .gt("current_period_end", new Date().toISOString())
    .order("current_period_end", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    const until = new Date(data[0].current_period_end).toLocaleDateString("en-KE", {
      day: "numeric", month: "long", year: "numeric"
    });
    planStatus.textContent = "You have an active plan until " + until + ".";
  }
}

async function loadPlans() {
  const { data, error } = await db
    .from("subscription_plans")
    .select("id, name, description, billing_interval, price_minor, currency, features")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    planStatus.textContent = "Could not load plans: " + error.message;
    return;
  }

  planStatus.textContent = data.length === 0 ? "Paid plans are coming soon." : "";
  data.forEach(function (plan) { planGrid.append(makePlanCard(plan)); });

  await showCurrentPlan();
}

loadPlans();
