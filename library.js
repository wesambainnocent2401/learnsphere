
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SEARCH_URL = "https://openlibrary.org/search.json";
const GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes";
const STORAGE_BUCKET = "learning-materials";
const PAGE_SIZE = 20;

// International library
const libraryForm = document.getElementById("libraryForm");
const libraryInput = document.getElementById("libraryInput");
const libraryStatus = document.getElementById("libraryStatus");
const bookGrid = document.getElementById("bookGrid");
const moreButton = document.getElementById("moreButton");
const internationalCategory = document.getElementById("internationalCategory");
const internationalSubject = document.getElementById("internationalSubject");

// Kenyan library
const kenyanSearchForm = document.getElementById("kenyanSearchForm");
const kenyanSearchInput = document.getElementById("kenyanSearchInput");
const kenyanCategory = document.getElementById("kenyanCategory");
const kenyanSubject = document.getElementById("kenyanSubject");
const kenyanBookStatus = document.getElementById("kenyanBookStatus");
const kenyanBookGrid = document.getElementById("kenyanBookGrid");

// Application state
let session = null;
let savedKeys = new Set();

let currentQuery = "";
let currentPage = 1;
let totalFound = 0;
let shownCount = 0;
let internationalBooks = [];

let kenyanBooks = [];
let kenyanSubjects = [];
let kenyanSearchResults = [];
let kenyanSearchPage = 0;

// --------------------------------------------------
// GENERAL HELPERS
// --------------------------------------------------

function makeElement(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;

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

function formatLabel(value) {
    if (!value) return "Other";

    return String(value)
        .replace(/_/g, " ")
        .replace(/\b\w/g, function (letter) {
            return letter.toUpperCase();
        });
}

function safeExternalUrl(value) {
    if (!value) return null;

    try {
        const url = new URL(value);

        return url.protocol === "https:" ? url.href : null;
    } catch (error) {
        return null;
    }
}

// --------------------------------------------------
// CATEGORY DETECTION
// --------------------------------------------------

function detectCategory(subjects) {
    const text = (subjects || []).join(" ").toLowerCase();

    const rules = [
        {
            value: "mathematics",
            words: ["mathematics", "algebra", "calculus", "geometry", "statistics"]
        },
        {
            value: "science",
            words: ["science", "physics", "chemistry", "biology", "astronomy"]
        },
        {
            value: "technology",
            words: ["computer", "programming", "software", "technology", "engineering"]
        },
        {
            value: "literature",
            words: ["literature", "fiction", "poetry", "novel", "drama"]
        },
        {
            value: "business",
            words: ["business", "economics", "management", "accounting", "finance"]
        },
        {
            value: "history",
            words: ["history", "historical", "civilization"]
        },
        {
            value: "education",
            words: ["education", "teaching", "learning", "school"]
        }
    ];

    for (const rule of rules) {
        if (rule.words.some(function (word) {
            return text.includes(word);
        })) {
            return rule.value;
        }
    }

    return "other";
}

// --------------------------------------------------
// INTERNATIONAL LIBRARY
// --------------------------------------------------

function accessLabel(access) {
    if (access === "public") {
        return { text: "Free to read", css: "access-badge" };
    }

    if (access === "borrowable") {
        return { text: "Borrow free", css: "access-badge limited" };
    }

    return { text: "Catalogue only", css: "access-badge catalogue" };
}

function getInternationalCategory(book) {
    return detectCategory(book.subject);
}

function getInternationalSubject(book) {
    return book.subject && book.subject.length
        ? book.subject[0]
        : "Not specified";
}

function populateInternationalSubjects() {
    const selected = internationalSubject.value;

    internationalSubject.replaceChildren();
    addOption(internationalSubject, "", "All subjects");

    const subjects = new Set();

    internationalBooks.forEach(function (book) {
        (book.subject || []).forEach(function (subject) {
            if (typeof subject === "string" && subject.trim()) {
                subjects.add(subject.trim());
            }
        });
    });

    Array.from(subjects).sort().slice(0, 200).forEach(function (subject) {
        addOption(internationalSubject, subject, subject);
    });

    if (subjects.has(selected)) {
        internationalSubject.value = selected;
    }
}

function updateSaveButton(button, key) {
    const saved = savedKeys.has(key);

    button.textContent = saved ? "Saved ✓" : "Save";
    button.classList.toggle("saved", saved);
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
                title: (book.title || "Untitled").slice(0, 300),
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

function makeInternationalCard(book) {
    const card = makeElement("article", "book-result");

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

        image.alt = "Book cover";
        image.loading = "lazy";
        cover.append(image);
    } else {
        cover.textContent = "📖";
    }

    const info = makeElement("div", "book-info");

    info.append(makeElement("h3", "", book.title || "Untitled book"));

    info.append(
        makeElement(
            "p",
            "book-meta",
            book.author_name ? book.author_name[0] : "Unknown author"
        )
    );

    info.append(
        makeElement(
            "p",
            "book-meta",
            "Category: " + formatLabel(getInternationalCategory(book))
        )
    );

    info.append(
        makeElement(
            "p",
            "book-meta",
            "Subject: " + getInternationalSubject(book)
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

    const access = accessLabel(book.ebook_access);

    info.append(makeElement("span", access.css, access.text));

    link.append(cover, info);
    card.append(link);

    if (hasWorkPage) {
        const button = makeElement("button", "save-button");

        button.type = "button";
        updateSaveButton(button, book.key);

        button.addEventListener("click", function () {
            toggleSave(book, button);
        });

        card.append(button);
    }

    return card;
}

function displayInternationalBooks() {
    const category = internationalCategory.value;
    const subject = internationalSubject.value;

    const filtered = internationalBooks.filter(function (book) {
        const matchesCategory =
            !category || getInternationalCategory(book) === category;

        const matchesSubject =
            !subject || (book.subject || []).includes(subject);

        return matchesCategory && matchesSubject;
    });

    bookGrid.replaceChildren();

    if (!filtered.length) {
        libraryStatus.textContent =
            "No books match these filters. Try another category or subject.";
        return;
    }

    filtered.forEach(function (book) {
        bookGrid.append(makeInternationalCard(book));
    });

    libraryStatus.textContent =
        "Showing " + filtered.length +
        " matching books from " + shownCount + " loaded results.";
}

async function fetchInternationalBooks(query, page) {
    const params = new URLSearchParams({
        q: query,
        limit: String(PAGE_SIZE),
        page: String(page),
        fields: "key,title,author_name,first_publish_year,cover_i,ebook_access,subject"
    });

    const response = await fetch(SEARCH_URL + "?" + params.toString());

    if (!response.ok) {
        throw new Error("Open Library is not responding.");
    }

    return response.json();
}

async function runInternationalSearch(query, page) {
    libraryStatus.textContent = "Searching...";
    moreButton.hidden = true;

    try {
        const result = await fetchInternationalBooks(query, page);

        if (page === 1) {
            internationalBooks = [];
            shownCount = 0;
        }

        totalFound = result.numFound || 0;

        const books = result.docs || [];

        internationalBooks = internationalBooks.concat(books);
        shownCount += books.length;

        populateInternationalSubjects();
        displayInternationalBooks();

        if (!totalFound) {
            libraryStatus.textContent = "No books found for " + query + ".";
        }

        moreButton.hidden =
            shownCount >= totalFound || books.length === 0;

    } catch (error) {
        console.error(error);
        libraryStatus.textContent = error.message;
    }
}

// --------------------------------------------------
// KENYAN COLLECTION: SUPABASE
// --------------------------------------------------

function populateKenyanSubjects() {
    const selected = kenyanSubject.value;

    kenyanSubject.replaceChildren();
    addOption(kenyanSubject, "", "All subjects");

    const names = new Set();

    kenyanSubjects.forEach(function (subject) {
        names.add(subject.name);
    });

    kenyanBooks.forEach(function (book) {
        if (book.subject_name) names.add(book.subject_name);
    });

    Array.from(names).sort().forEach(function (name) {
        addOption(kenyanSubject, name, name);
    });

    if (names.has(selected)) {
        kenyanSubject.value = selected;
    }
}

function makeKenyanCard(book) {
    const card = makeElement("article", "book-result");
    const cover = makeElement("div", "book-cover");

    const coverUrl = safeExternalUrl(book.cover_url);

    if (coverUrl) {
        const image = document.createElement("img");
        image.src = coverUrl;
        image.alt = "Book cover";
        image.loading = "lazy";
        cover.append(image);
    } else {
        cover.textContent = "📚";
    }

    const info = makeElement("div", "book-info");

    info.append(
        makeElement("h3", "", book.title || "Untitled book")
    );

    info.append(
        makeElement("p", "book-meta", book.author || "Unknown author")
    );

    info.append(
        makeElement(
            "p",
            "book-meta",
            "Category: " + formatLabel(book.resource_type)
        )
    );

    info.append(
        makeElement(
            "p",
            "book-meta",
            "Subject: " + (book.subject_name || "General learning")
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

    info.append(makeElement("span", "access-badge", "LearnSphere"));

    card.append(cover, info);

    if (book.source_name) {
        card.append(
            makeElement("p", "book-meta", "Source: " + book.source_name)
        );
    }

    const sourceUrl = safeExternalUrl(book.source_url);

    if (sourceUrl) {
        const readLink = makeElement("a", "resource-link", "Open resource");
        readLink.href = sourceUrl;
        readLink.target = "_blank";
        readLink.rel = "noopener noreferrer";
        card.append(readLink);
    }

    if (book.download_allowed === true && book.file_path && session) {
        const button = makeElement("button", "save-button", "Download PDF");
        button.type = "button";

        button.addEventListener("click", function () {
            downloadKenyanBook(book, button);
        });

        card.append(button);
    }

    if (book.licence) {
        card.append(
            makeElement("p", "book-meta", "Licence: " + book.licence)
        );
    }

    return card;
}

async function downloadKenyanBook(book, button) {
    button.disabled = true;
    button.textContent = "Preparing download...";

    const { data, error } = await db.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(book.file_path, 60, { download: true });

    if (error || !data || !data.signedUrl) {
        console.error("Download error:", error);
        button.textContent = "Download unavailable";
        button.disabled = false;
        return;
    }

    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = "";
    link.rel = "noopener noreferrer";

    document.body.appendChild(link);
    link.click();
    link.remove();

    button.textContent = "Download PDF";
    button.disabled = false;
}

async function loadKenyanCatalogue() {
    const [
        { data: subjects, error: subjectError },
        { data: resources, error: resourceError }
    ] = await Promise.all([
        db
            .from("subjects")
            .select("id, name, sort_order")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),

        db
            .from("resources")
            .select(
                "title, description, author, resource_type, subject_id, language, publication_year, cover_url, source_name, source_url, licence, access_type, file_path, download_allowed, approval_status"
            )
            .eq("approval_status", "approved")
            .limit(200)
    ]);

    if (subjectError || resourceError) {
        console.error(subjectError, resourceError);
        throw new Error("Could not load the LearnSphere catalogue.");
    }

    kenyanSubjects = subjects || [];

    const subjectMap = new Map();

    kenyanSubjects.forEach(function (subject) {
        subjectMap.set(subject.id, subject.name);
    });

    kenyanBooks = (resources || []).map(function (book) {
        return {
            ...book,
            subject_name: subjectMap.get(book.subject_id) || ""
        };
    });
}

// --------------------------------------------------
// KENYAN COLLECTION: EXTERNAL CATALOGUES
// --------------------------------------------------

function normaliseOpenLibraryBook(book) {
    return {
        id: "ol:" + book.key,
        title: book.title || "Untitled book",
        author: book.author_name ? book.author_name[0] : "Unknown author",
        year: book.first_publish_year || null,
        subjects: Array.isArray(book.subject) ? book.subject : [],
        cover: Number.isInteger(book.cover_i)
            ? "https://covers.openlibrary.org/b/id/" + book.cover_i + "-M.jpg"
            : null,
        source: "Open Library",
        sourceUrl: book.key
            ? "https://openlibrary.org" + book.key
            : null,
        category: detectCategory(book.subject || [])
    };
}

function normaliseGoogleBook(item) {
    const volume = item.volumeInfo || {};
    const imageLinks = volume.imageLinks || {};

    const subjects = Array.isArray(volume.categories)
        ? volume.categories
        : [];

    let cover = imageLinks.thumbnail || imageLinks.smallThumbnail || null;

    if (cover) {
        cover = cover.replace(/^http:/, "https:");
    }

    return {
        id: "gb:" + item.id,
        title: volume.title || "Untitled book",
        author: volume.authors ? volume.authors[0] : "Unknown author",
        year: volume.publishedDate || null,
        subjects: subjects,
        cover: safeExternalUrl(cover),
        source: "Google Books",
        sourceUrl: safeExternalUrl(volume.infoLink || volume.previewLink),
        category: detectCategory(subjects)
    };
}

async function searchOpenLibrary(query, page) {
    const params = new URLSearchParams({
        q: query,
        limit: "20",
        page: String(page),
        fields: "key,title,author_name,first_publish_year,cover_i,subject"
    });

    const response = await fetch(SEARCH_URL + "?" + params.toString());

    if (!response.ok) {
        throw new Error("Open Library search failed.");
    }

    const result = await response.json();

    return (result.docs || []).map(normaliseOpenLibraryBook);
}

async function searchGoogleBooks(query, page) {
    const params = new URLSearchParams({
        q: query,
        startIndex: String((page - 1) * 20),
        maxResults: "20",
        printType: "books"
    });

    const response = await fetch(
        GOOGLE_BOOKS_URL + "?" + params.toString()
    );

    if (!response.ok) {
        throw new Error("Google Books search failed.");
    }

    const result = await response.json();

    return (result.items || []).map(normaliseGoogleBook);
}

function makeExternalKenyanCard(book) {
    const card = makeElement("article", "book-result");
    const cover = makeElement("div", "book-cover");

    if (book.cover) {
        const image = document.createElement("img");
        image.src = book.cover;
        image.alt = "Cover of " + book.title;
        image.loading = "lazy";
        cover.append(image);
    } else {
        cover.textContent = "📚";
    }

    const info = makeElement("div", "book-info");

    info.append(makeElement("h3", "", book.title));
    info.append(makeElement("p", "book-meta", book.author));

    info.append(
        makeElement(
            "p",
            "book-meta",
            "Category: " + formatLabel(book.category)
        )
    );

    info.append(
        makeElement(
            "p",
            "book-meta",
            "Subject: " + (book.subjects[0] || "Not specified")
        )
    );

    if (book.year) {
        info.append(
            makeElement("p", "book-meta", "Published: " + book.year)
        );
    }

    info.append(
        makeElement("span", "access-badge", book.source)
    );

    card.append(cover, info);

    if (book.sourceUrl) {
        const link = makeElement("a", "resource-link", "View book");
        link.href = book.sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.append(link);
    } else {
        card.append(
            makeElement("p", "book-meta", "Catalogue record only")
        );
    }

    return card;
}

function renderKenyanResults() {
    const searchTerm = kenyanSearchInput.value.trim().toLowerCase();
    const category = kenyanCategory.value;
    const subject = kenyanSubject.value;

    const allBooks = kenyanBooks.map(function (book) {
        return {
            kind: "local",
            book: book,
            title: book.title || "",
            author: book.author || "",
            subjects: [book.subject_name || ""],
            category: book.resource_type || "other"
        };
    }).concat(
        kenyanSearchResults.map(function (book) {
            return {
                kind: "external",
                book: book,
                title: book.title,
                author: book.author,
                subjects: book.subjects,
                category: book.category
            };
        })
    );

    const filtered = allBooks.filter(function (item) {
        const searchable = [
            item.title,
            item.author,
            item.subjects.join(" ")
        ].join(" ").toLowerCase();

        const matchesSearch = !searchTerm ||
            searchable.includes(searchTerm);

        const matchesCategory = !category ||
            item.category === category;

        const matchesSubject = !subject ||
            item.subjects.includes(subject);

        return matchesSearch && matchesCategory && matchesSubject;
    });

    kenyanBookGrid.replaceChildren();

    if (!filtered.length) {
        kenyanBookStatus.textContent =
            "No matching books found. Try another search.";

        return;
    }

    filtered.forEach(function (item) {
        if (item.kind === "local") {
            kenyanBookGrid.append(makeKenyanCard(item.book));
        } else {
            kenyanBookGrid.append(makeExternalKenyanCard(item.book));
        }
    });

    kenyanBookStatus.textContent =
        "Showing " + filtered.length +
        " results from LearnSphere and external catalogues.";
}

function populateKenyanSearchSubjects() {
    const selected = kenyanSubject.value;

    kenyanSubject.replaceChildren();
    addOption(kenyanSubject, "", "All subjects");

    const subjects = new Set();

    kenyanBooks.forEach(function (book) {
        if (book.subject_name) subjects.add(book.subject_name);
    });

    kenyanSearchResults.forEach(function (book) {
        (book.subjects || []).forEach(function (name) {
            if (name) subjects.add(name);
        });
    });

    Array.from(subjects).sort().slice(0, 200).forEach(function (name) {
        addOption(kenyanSubject, name, name);
    });

    if (subjects.has(selected)) {
        kenyanSubject.value = selected;
    }
}

async function searchKenyanBooks(query, page) {
    kenyanBookStatus.textContent = "Searching LearnSphere and external catalogues...";
    kenyanSearchPage = page;

    if (page === 1) {
        kenyanSearchResults = [];
    }

    const searches = await Promise.allSettled([
        searchOpenLibrary(query, page),
        searchGoogleBooks(query, page)
    ]);

    let externalResults = [];
    let failedSources = [];

    searches.forEach(function (result, index) {
        if (result.status === "fulfilled") {
            externalResults = externalResults.concat(result.value);
        } else {
            failedSources.push(index === 0 ? "Open Library" : "Google Books");
            console.error(result.reason);
        }
    });

    kenyanSearchResults = kenyanSearchResults.concat(externalResults);

    populateKenyanSearchSubjects();
    renderKenyanResults();

    if (failedSources.length) {
        kenyanBookStatus.textContent +=
            " Some sources could not be reached: " +
            failedSources.join(", ") + ".";
    }
}

// --------------------------------------------------
// SAVED BOOKS AND ACCOUNT
// --------------------------------------------------

async function loadSavedBooks() {
    const { data, error } = await db.auth.getSession();

    if (error) {
        console.error("Session error:", error);
        return;
    }

    session = data.session;

    if (!session) return;

    const { data: rows, error: bookmarkError } = await db
        .from("bookmarks")
        .select("external_id")
        .eq("source", "openlibrary");

    if (bookmarkError) {
        console.error("Could not load saved books:", bookmarkError);
        return;
    }

    (rows || []).forEach(function (row) {
        savedKeys.add(row.external_id);
    });
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

    runInternationalSearch(currentQuery, currentPage);
});

moreButton.addEventListener("click", function () {
    currentPage++;
    runInternationalSearch(currentQuery, currentPage);
});

internationalCategory.addEventListener("change", displayInternationalBooks);
internationalSubject.addEventListener("change", displayInternationalBooks);

kenyanSearchForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const query = kenyanSearchInput.value.trim();

    if (!query) {
        kenyanSearchResults = [];
        renderKenyanResults();
        return;
    }

    searchKenyanBooks(query, 1);
});

kenyanSearchInput.addEventListener("input", function () {
    if (!kenyanSearchInput.value.trim()) {
        kenyanSearchResults = [];
        renderKenyanResults();
    }
});

kenyanCategory.addEventListener("change", renderKenyanResults);
kenyanSubject.addEventListener("change", renderKenyanResults);

// --------------------------------------------------
// START
// --------------------------------------------------

async function start() {
    try {
        await loadSavedBooks();
        await loadKenyanCatalogue();

        populateKenyanSubjects();
        renderKenyanResults();

        const startingQuery =
            new URLSearchParams(window.location.search).get("q");

        if (startingQuery) {
            const query = startingQuery.slice(0, 200).trim();

            kenyanSearchInput.value = query;
            libraryInput.value = query;

            searchKenyanBooks(query, 1);
            runInternationalSearch(query, 1);
        }
    } catch (error) {
        console.error("Library startup error:", error);

        kenyanBookStatus.textContent =
            "Some library information could not be loaded.";
    }
}

start();
