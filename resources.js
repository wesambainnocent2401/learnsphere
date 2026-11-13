
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const resourceSearchForm = document.getElementById("resourceSearchForm");
const resourceSearch = document.getElementById("resourceSearch");
const resourceCategory = document.getElementById("resourceCategory");
const resourceSubject = document.getElementById("resourceSubject");
const resourceType = document.getElementById("resourceType");
const resourceStatus = document.getElementById("resourceStatus");
const resourceGrid = document.getElementById("resourceGrid");

let allResources = [];
let allCategories = [];
let allSubjects = [];

const subjectMap = new Map();

function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function formatResourceType(type) {
    if (!type) return "Learning resource";

    return type
        .replace(/_/g, " ")
        .replace(/\b\w/g, function (letter) {
            return letter.toUpperCase();
        });
}

function addOption(select, value, text) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
}

function populateCategoryFilter() {
    resourceCategory.replaceChildren();
    addOption(resourceCategory, "", "All categories");

    allCategories.forEach(function (category) {
        addOption(resourceCategory, category.id, category.name);
    });
}

function updateSubjectFilter() {
    const selectedCategory = resourceCategory.value;

    resourceSubject.replaceChildren();
    addOption(resourceSubject, "", "All subjects");

    const matchingSubjects = allSubjects.filter(function (subject) {
        return !selectedCategory ||
            subject.category_id === selectedCategory;
    });

    matchingSubjects.forEach(function (subject) {
        addOption(resourceSubject, subject.id, subject.name);
    });

    resourceSubject.disabled = matchingSubjects.length === 0;
    resourceSubject.value = "";
}

function createResourceCard(resource) {
    const card = createElement("article", "resource-card");

    const heading = createElement(
        "h3",
        "resource-title",
        resource.title || "Untitled resource"
    );

    const description = createElement(
        "p",
        "resource-description",
        resource.description || "No description available."
    );

    const details = createElement("div", "resource-details");

    details.append(
        createElement(
            "span",
            "resource-type",
            formatResourceType(resource.resource_type)
        )
    );

    const subject = subjectMap.get(resource.subject_id);

    if (subject) {
        details.append(
            createElement("span", "resource-author", subject.name)
        );

        const category = allCategories.find(function (item) {
            return item.id === subject.category_id;
        });

        if (category) {
            details.append(
                createElement("span", "resource-language", category.name)
            );
        }
    }

    if (resource.author) {
        details.append(
            createElement("span", "resource-author", "By " + resource.author)
        );
    }

    if (resource.language) {
        details.append(
            createElement("span", "resource-language", resource.language)
        );
    }

    if (resource.publication_year) {
        details.append(
            createElement(
                "span",
                "resource-year",
                String(resource.publication_year)
            )
        );
    }

    card.append(heading, description, details);

    if (resource.source_name) {
        card.append(
            createElement(
                "p",
                "resource-source",
                "Source: " + resource.source_name
            )
        );
    }

    if (resource.access_type) {
        card.append(
            createElement(
                "p",
                "resource-access",
                "Access: " + formatResourceType(resource.access_type)
            )
        );
    }

    if (resource.source_url) {
        try {
            const url = new URL(resource.source_url);

            if (url.protocol === "https:") {
                const link = createElement(
                    "a",
                    "resource-link",
                    "Open resource"
                );

                link.href = url.href;
                link.target = "_blank";
                link.rel = "noopener noreferrer";

                card.append(link);
            }
        } catch (error) {
            console.warn("Invalid resource link:", resource.title);
        }
    }

    return card;
}

function displayResources(resources) {
    resourceGrid.replaceChildren();

    if (resources.length === 0) {
        resourceStatus.textContent =
            "No matching resources found. Try another search or filter.";

        return;
    }

    resources.forEach(function (resource) {
        resourceGrid.appendChild(createResourceCard(resource));
    });

    resourceStatus.textContent =
        "Showing " + resources.length +
        (resources.length === 1
            ? " learning resource."
            : " learning resources.");
}

function filterResources() {
    const searchTerm = resourceSearch.value.trim().toLowerCase();
    const selectedCategory = resourceCategory.value;
    const selectedSubject = resourceSubject.value;
    const selectedType = resourceType.value;

    const filteredResources = allResources.filter(function (resource) {
        const subject = subjectMap.get(resource.subject_id);

        const searchableText = [
            resource.title,
            resource.description,
            resource.author,
            resource.language,
            resource.source_name,
            subject ? subject.name : ""
        ].filter(Boolean).join(" ").toLowerCase();

        const matchesSearch = searchableText.includes(searchTerm);

        const matchesCategory = !selectedCategory ||
            (subject && subject.category_id === selectedCategory);

        const matchesSubject = !selectedSubject ||
            resource.subject_id === selectedSubject;

        const matchesType = !selectedType ||
            resource.resource_type === selectedType;

        return matchesSearch &&
            matchesCategory &&
            matchesSubject &&
            matchesType;
    });

    displayResources(filteredResources);
}

async function loadResources() {
    resourceStatus.textContent = "Loading learning resources...";

    const [
        { data: categories, error: categoryError },
        { data: subjects, error: subjectError },
        { data: resources, error: resourceError }
    ] = await Promise.all([
        db
            .from("categories")
            .select("id, name")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),

        db
            .from("subjects")
            .select("id, name, category_id")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),

        db
            .from("resources")
            .select(
                "title, description, author, resource_type, language, publication_year, source_name, source_url, access_type, subject_id"
            )
            .eq("approval_status", "approved")
            .limit(100)
    ]);

    if (categoryError || subjectError || resourceError) {
        console.error(
            "Learning resources loading errors:",
            categoryError,
            subjectError,
            resourceError
        );

        resourceStatus.textContent =
            "Could not load learning resources. Please check your database permissions and try again.";

        return;
    }

    allCategories = categories || [];
    allSubjects = subjects || [];
    allResources = resources || [];

    subjectMap.clear();

    allSubjects.forEach(function (subject) {
        subjectMap.set(subject.id, subject);
    });

    populateCategoryFilter();
    updateSubjectFilter();
    filterResources();
}

resourceSearchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    filterResources();
});

resourceSearch.addEventListener("input", filterResources);

resourceCategory.addEventListener("change", function () {
    updateSubjectFilter();
    filterResources();
});

resourceSubject.addEventListener("change", filterResources);

resourceType.addEventListener("change", filterResources);

loadResources();
