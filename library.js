const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SEARCH_URL = "https://openlibrary.org/search.json";
const STORAGE_BUCKET = "learning-materials";
const PAGE_SIZE = 20;

// International library elements
const libraryForm = document.getElementById("libraryForm");
const libraryInput = document.getElementById("libraryInput");
const libraryStatus = document.getElementById("libraryStatus");
const bookGrid = document.getElementById("bookGrid");
const moreButton = document.getElementById("moreButton");

// Kenyan library elements
const kenyanSearchForm = document.getElementById("kenyanSearchForm");
const kenyanSearchInput = document.getElementById("kenyanSearchInput");
const kenyanCategory = document.getElementById("kenyanCategory");
const kenyanSubject = document.getElementById("kenyanSubject");
const kenyanBookStatus = document.getElementById("kenyanBookStatus");
const kenyanBookGrid = document.getElementById("kenyanBookGrid");

// International search state
let currentQuery = "";
let currentPage = 1;
let totalFound = 0;
let shownCount = 0;
let session = null;

const savedKeys = new Set();

// Kenyan catalogue state
let kenyanBooks = [];
let kenyanSubjects = [];

// Create HTML elements safely
function makeElement(tag, className, text) {
    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    if (text !== undefined && text !== null) {
        node.textContent = text;
    }

    return node;
}

function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
}

// --------------------------------------------------
// INTERNATIONAL LIBRARY
// --------------------------------------------------

function accessLabel(access) {
    if (access === "public") {
        return {
            text: "Free to read",
            css: "access-badge"
        };
    }

    if (access === "borrowable") {
        return {
            text: "Borrow free",
            css: "access-badge limited"
        };
    }

    return {
        text: "Catalogue only",
        css: "access-badge catalogue"
    };
}

function updateSaveButton(button, key) {
    const isSaved = savedKeys.has(key);

    button.textContent = isSaved ? "Saved ✓" : "Save";
    button.classList.toggle("saved", isSaved);
}

async function toggleSave(book, button) {
    if (!session) {
        window.location.href = "login.html";
        return;
    }

    button.disabled = true;

    if (savedKeys.has(book.key)) {
        const { error } = await db
            .from("bookmarks")
            .delete()
            .eq("source", "openlibrary")
            .eq("external_id", book.key);

        if (error) {
            libraryStatus.textContent = "Could not remove saved book.";
        } else {
            savedKeys.delete(book.key);
        }

    } else {
        const { error } = await db
            .from("bookmarks")
            .insert({
                source: "openlibrary",
                external_id: book.key,
                title: book.title.slice(0, 300),
                author: book.author_name
                    ? book.author_name[0].slice(0, 300)
                    : null,
                cover_id: Number.isInteger(book.cover_i)
                    ? book.cover_i
                    : null
            });

        if (error) {
            libraryStatus.textContent = "Could not save this book.";
        } else {
            savedKeys.add(book.key);
        }
    }

    updateSaveButton(button, book.key);
    button.disabled = false;
}

function makeBookCard(book) {
    const card = makeElement("div", "book-result");

    const hasWorkPage =
        typeof book.key === "string" &&
        book.key.startsWith("/works/");

    const link = makeElement(
        hasWorkPage ? "a" : "div",
        "book-link"
    );

    if (hasWorkPage) {
        link.href = "https://openlibrary.org" + book.key;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    }

    const cover = makeElement("div", "book-cover");

    if (Number.isInteger(book.cover_i)) {
        const image = document.createElement("img");

        image.src =
            "https://covers.openlibrary.org/b/id/" +
            book.cover_i + "-M.jpg";

        image.alt = "Cover of " + book.title;
        image.loading = "lazy";

        cover.append(image);
    } else {
        cover.textContent = "📖";
    }

    const info = makeElement("div", "book-info");

    info.append(makeElement("h3", "", book.title));

    info.append(
        makeElement(
            "p",
            "book-meta",
            book.author_name
                ? book.author_name[0]
                : "Unknown author"
        )
    );

    if (book.first_publish_year) {
        info.append(
            makeElement(
                "p",
                "book-meta",
                "First published " + book.first_publish_year
            )
        );
    }

    const label = accessLabel(book.ebook_access);

    info.append(
        makeElement("span", label.css, label.text)
    );

    link.append(cover, info);
    card.append(link);

    if (hasWorkPage) {
        const saveButton = makeElement("button", "save-button");

        saveButton.type = "button";

        updateSaveButton(saveButton, book.key);

        saveButton.addEventListener("click", function () {
            toggleSave(book, saveButton);
        });

        card.append(saveButton);
    }

    return card;
}

async function fetchBooks(query, page) {
    const params = new URLSearchParams({
        q: query,
        limit: String(PAGE_SIZE),
        page: String(page),
        fields: "key,title,author_name,first_publish_year,cover_i,ebook_access"
    });

    const response = await fetch(
        SEARCH_URL + "?" + params.toString()
    );

    if (!response.ok) {
        throw new Error(
            "The international book catalogue is not responding."
        );
    }

    return response.json();
}

async function runSearch(query, page) {
    libraryStatus.textContent = "Searching...";
    moreButton.hidden = true;

    try {
        const result = await fetchBooks(query, page);

        if (page === 1) {
            bookGrid.replaceChildren();
            shownCount = 0;
        }

        totalFound = result.numFound || 0;

        (result.docs || []).forEach(function (book) {
            bookGrid.append(makeBookCard(book));
        });

        shownCount += (result.docs || []).length;

        if (totalFound === 0) {
            libraryStatus.textContent =
                'No books found for "' + query + '".';
        } else {
            libraryStatus.textContent =
                "Showing " + shownCount +
                " of " + totalFound.toLocaleString() + " results";
        }

        moreButton.hidden = shownCount >= totalFound;

    } catch (error) {
        libraryStatus.textContent = error.message;
    }
}

// --------------------------------------------------
// KENYAN BOOKS COLLECTION
// --------------------------------------------------

function populateKenyanSubjects() {
    kenyanSubject.replaceChildren();

    addOption(kenyanSubject, "", "All subjects");

    const names = new Set();

    kenyanSubjects.forEach(function (subject) {
        names.add(subject.name);
    });

    kenyanBooks.forEach(function (book) {
        if (book.subject_name) {
            names.add(book.subject_name);
        }
    });

    Array.from(names).sort().forEach(function (name) {
        addOption(kenyanSubject, name, name);
    });
}

function getKenyanCategory(book) {
    return book.resource_type || "other";
}

function makeKenyanBookCard(book) {
    const card = makeElement("article", "book-result");

    const cover = makeElement("div", "book-cover");

    if (book.cover_url) {
        try {
            const coverUrl = new URL(book.cover_url);

            if (coverUrl.protocol === "https:") {
                const image = document.createElement("img");

                image.src = coverUrl.href;
                image.alt = "Cover of " + book.title;
                image.loading = "lazy";

                cover.append(image);
            } else {
                cover.textContent = "📚";
            }

        } catch (error) {
            cover.textContent = "📚";
        }

    } else {
        cover.textContent = "📚";
    }

    const info = makeElement("div", "book-info");

    info.append(
        makeElement(
            "h3",
            "",
            book.title || "Untitled book"
        )
    );

    info.append(
        makeElement(
            "p",
            "book-meta",
            book.author || "Unknown author"
        )
    );

    if (book.publication_year) {
        info.append(
            makeElement(
                "p",
                "book-meta",
                "Published " + book.publication_year
            )
        );
    }

    info.append(
        makeElement(
            "p",
            "book-meta",
            "Subject: " +
            (book.subject_name || "General learning")
        )
    );

    const categoryLabel = book.resource_type
        ? book.resource_type.replace(/_/g, " ")
        : "Learning resource";

    info.append(
        makeElement(
            "span",
            "access-badge",
            categoryLabel
        )
    );

    card.append(cover, info);

    if (book.source_name) {
        card.append(
            makeElement(
                "p",
                "book-meta",
                "Source: " + book.source_name
            )
        );
    }

    // External reading link
    if (book.source_url) {
        try {
            const sourceUrl = new URL(book.source_url);

            if (sourceUrl.protocol === "https:") {
                const readLink = makeElement(
                    "a",
                    "resource-link",
                    "Read online"
                );

                readLink.href = sourceUrl.href;
                readLink.target = "_blank";
                readLink.rel = "noopener noreferrer";

                card.append(readLink);
            }

        } catch (error) {
            console.warn("Invalid external book link.");
        }
    }

    // Secure download button
    if (
        book.download_allowed === true &&
        book.file_path
    ) {
        const downloadButton = makeElement(
            "button",
            "save-button",
            "Download PDF"
        );

        downloadButton.type = "button";

        downloadButton.addEventListener("click", function () {
            downloadKenyanBook(book, downloadButton);
        });

        card.append(downloadButton);
    }

    if (book.licence) {
        card.append(
            makeElement(
                "p",
                "book-meta",
                "Licence: " + book.licence
            )
        );
    }

    return card;
}

async function downloadKenyanBook(book, button) {
    if (!session) {
        window.location.href = "login.html";
        return;
    }

    button.disabled = true;
    button.textContent = "Preparing download...";

    const { data, error } = await db.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(
            book.file_path,
            60,
            { download: true }
        );

    if (error || !data || !data.signedUrl) {
        console.error("Download error:", error);

        button.textContent = "Download unavailable";
        button.disabled = false;

        return;
    }

    const downloadLink = document.createElement("a");

    downloadLink.href = data.signedUrl;
    downloadLink.download = "";
    downloadLink.rel = "noopener noreferrer";

    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    button.textContent = "Download PDF";
    button.disabled = false;
}

function filterKenyanBooks() {
    const searchTerm =
        kenyanSearchInput.value.trim().toLowerCase();

    const selectedCategory = kenyanCategory.value;
    const selectedSubject = kenyanSubject.value;

    const filteredBooks = kenyanBooks.filter(function (book) {
        const searchableText = [
            book.title,
            book.description,
            book.author,
            book.source_name,
            book.subject_name
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        const matchesSearch =
            searchableText.includes(searchTerm);

        const matchesCategory =
            !selectedCategory ||
            getKenyanCategory(book) === selectedCategory;

        const matchesSubject =
            !selectedSubject ||
            book.subject_name === selectedSubject;

        return matchesSearch &&
            matchesCategory &&
            matchesSubject;
    });

    kenyanBookGrid.replaceChildren();

    if (filteredBooks.length === 0) {
        kenyanBookStatus.textContent =
            "No matching Kenyan books found yet.";

        return;
    }

    filteredBooks.forEach(function (book) {
        kenyanBookGrid.append(
            makeKenyanBookCard(book)
        );
    });

    kenyanBookStatus.textContent =
        "Showing " + filteredBooks.length +
        (filteredBooks.length === 1
            ? " Kenyan book."
            : " Kenyan books.");
}

async function loadKenyanBooks() {
    kenyanBookStatus.textContent =
        "Loading Kenyan books...";

    const [
        { data: subjects, error: subjectError },
        { data: resources, error: resourceError }
    ] = await Promise.all([
        db
            .from("subjects")
            .select("id, name")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),

        db
            .from("resources")
            .select(
                "title, description, author, resource_type, subject_id, subject_name, language, publication_year, cover_url, source_name, source_url, licence, access_type, file_path, download_allowed"
            )
            .eq("approval_status", "approved")
            .eq("country_code", "KE")
            .limit(200)
    ]);

    if (subjectError || resourceError) {
        console.error(
            "Kenyan books loading error:",
            subjectError,
            resourceError
        );

        kenyanBookStatus.textContent =
            "Could not load Kenyan books. Please try again.";

        return;
    }

    kenyanSubjects = subjects || [];

    const subjectNames = new Map();

    kenyanSubjects.forEach(function (subject) {
        subjectNames.set(subject.id, subject.name);
    });

    kenyanBooks = (resources || []).map(function (book) {
        return {
            ...book,
            subject_name: book.subject_name || subjectNames.get(book.subject_id) || ""
        };
    });

    populateKenyanSubjects();
    filterKenyanBooks();
}

// --------------------------------------------------
// ACCOUNT AND SAVED BOOKS
// --------------------------------------------------

async function loadSavedBooks() {
    const { data, error } = await db.auth.getSession();

    if (error) {
        console.error("Session error:", error);
        return;
    }

    session = data.session;

    if (!session) {
        return;
    }

    const { data: rows, error: bookmarkError } = await db
        .from("bookmarks")
        .select("external_id")
        .eq("source", "openlibrary");

    if (bookmarkError) {
        console.error("Could not load saved books:", bookmarkError);
        return;
    }

    if (rows) {
        rows.forEach(function (row) {
            savedKeys.add(row.external_id);
        });
    }
}

// --------------------------------------------------
// EVENT LISTENERS
// --------------------------------------------------

libraryForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const query = libraryInput.value.trim();

    if (!query) return;

    currentQuery = query;
    currentPage = 1;

    runSearch(currentQuery, currentPage);
});

moreButton.addEventListener("click", function () {
    currentPage++;
    runSearch(currentQuery, currentPage);
});

kenyanSearchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    filterKenyanBooks();
});

kenyanSearchInput.addEventListener("input", filterKenyanBooks);

kenyanCategory.addEventListener("change", filterKenyanBooks);

kenyanSubject.addEventListener("change", filterKenyanBooks);

// --------------------------------------------------
// START THE LIBRARY
// --------------------------------------------------

async function start() {
    await loadSavedBooks();

    await loadKenyanBooks();

    const startingQuery =
        new URLSearchParams(window.location.search).get("q");

    if (startingQuery) {
        const cleanQuery = startingQuery.slice(0, 200).trim();

        // Search both collections with the same words
        kenyanSearchInput.value = cleanQuery;
        filterKenyanBooks();

        libraryInput.value = cleanQuery;
        currentQuery = cleanQuery;

        if (currentQuery) {
            runSearch(currentQuery, 1);
        }
    }
}

start();
