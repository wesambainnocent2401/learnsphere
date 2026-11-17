
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const subjectTitle = document.getElementById("subjectTitle");
const subjectDescription = document.getElementById("subjectDescription");
const subjectStatus = document.getElementById("subjectStatus");
const topicGrid = document.getElementById("topicGrid");

const params = new URLSearchParams(window.location.search);
const subjectSlug = params.get("subject");

function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined && text !== null) {
        element.textContent = text;
    }

    return element;
}

function renderTopics(topics) {
    topicGrid.replaceChildren();

    if (!topics.length) {
        subjectStatus.textContent =
            "No topics have been added to this subject yet.";

        return;
    }

    topics.forEach(function(topic) {
        const card = makeElement("article", "resource-card");

        card.append(
            makeElement("h3", "resource-title", topic.name || topic.title || "Untitled topic")
        );

        card.append(
            makeElement(
                "p",
                "resource-description",
                topic.description || "Study this topic and improve your understanding."
            )
        );

        const link = makeElement("a", "resource-link", "Start learning");

        link.href = "topic.html?topic=" + encodeURIComponent(topic.slug || topic.id);

        card.append(link);
        topicGrid.append(card);
    });

    subjectStatus.textContent =
        topics.length + (topics.length === 1
            ? " topic available."
            : " topics available.");
}

async function loadSubject() {
    if (!subjectSlug) {
        subjectTitle.textContent = "Subject not selected";
        subjectDescription.textContent =
            "Return to Explore and choose a subject.";
        subjectStatus.textContent = "No subject was provided.";
        return;
    }

    subjectStatus.textContent = "Loading subject...";

    const { data: subject, error: subjectError } = await db
        .from("subjects")
        .select("id, name, description, slug")
        .eq("slug", subjectSlug)
        .eq("is_active", true)
        .single();

    if (subjectError || !subject) {
        console.error(subjectError);

        subjectTitle.textContent = "Subject unavailable";
        subjectDescription.textContent =
            "We could not find this subject.";
        subjectStatus.textContent =
            "Please return to Explore and try again.";
        return;
    }

    subjectTitle.textContent = subject.name;
    subjectDescription.textContent =
        subject.description || "Explore topics and learning materials in " + subject.name + ".";

    const { data: topics, error: topicsError } = await db
        .from("topics")
        .select("*")
        .eq("subject_id", subject.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

    if (topicsError) {
        console.error(topicsError);

        subjectStatus.textContent =
            "Could not load topics. Please check the topics table structure.";
        return;
    }

    renderTopics(topics || []);
}

loadSubject();
