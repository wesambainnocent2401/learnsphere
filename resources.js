
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const resourceSearchForm = document.getElementById("resourceSearchForm");
const resourceSearch = document.getElementById("resourceSearch");
const resourceType = document.getElementById("resourceType");
const resourceStatus = document.getElementById("resourceStatus");
const resourceGrid = document.getElementById("resourceGrid");

let allResources = [];

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
            "No matching resources found. Try another search.";

        return;
    }

    resources.forEach(function (resource) {
        resourceGrid.appendChild(createResourceCard(resource));
    });

    resourceStatus.textContent =
        "Showing " + resources.length +
        (resources.length === 1 ? " learning resource." : " learning resources.");
}

function filterResources() {
    const searchTerm = resourceSearch.value.trim().toLowerCase();
    const selectedType = resourceType.value;

    const filteredResources = allResources.filter(function (resource) {
        const searchableText = [
            resource.title,
            resource.description,
            resource.author,
            resource.language,
            resource.source_name
        ].filter(Boolean).join(" ").toLowerCase();

        const matchesSearch = searchableText.includes(searchTerm);

        const matchesType = !selectedType ||
            resource.resource_type === selectedType;

        return matchesSearch && matchesType;
    });

    displayResources(filteredResources);
}

async function loadResources() {
    resourceStatus.textContent = "Loading learning resources...";

    const { data, error } = await db
        .from("resources")
        .select(
            "title, description, author, resource_type, language, publication_year, source_name, source_url, access_type"
        )
        .eq("approval_status", "approved")
        .limit(100);

    if (error) {
        console.error("Resources loading error:", error);

        resourceStatus.textContent =
            "Could not load learning resources. Please try again.";

        return;
    }

    allResources = data || [];

    filterResources();
}

resourceSearchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    filterResources();
});

resourceSearch.addEventListener("input", filterResources);

resourceType.addEventListener("change", filterResources);

loadResources();
