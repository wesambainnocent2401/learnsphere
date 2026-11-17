
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

// State
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

// Verified Kenyan catalogue record.
// This is a catalogue entry, NOT a downloadable ebook.
const knownKenyanBooks = [
    {
        id: "kenya-isbn-9789966657534",
        title: "The Samaritan",
        author: "John Lara",
        year: "2022",
        isbn: "9789966657534",
        publisher: "Kenya Literature Bureau",
        subjects: ["Literature", "Fiction"],
        category: "set_book",
        source: "Kenyan Library Catalogue",
        sourceUrl: "https://library.mmarau.ac.ke/bib/33365"
    }
];

// --------------------------------------------------
// GENERAL HELPERS
// --------------------------------------------------

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

function normaliseText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

// --------------------------------------------------
// INTERNATIONAL CATEGORY DETECTION
// --------------------------------------------------

function detectInternationalCategory(subjects) {
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
// KENYAN CATEGORY DETECTION
// --------------------------------------------------

// These values match the actual Kenyan HTML dropdown.
function detectKenyanCategory(book) {
    const title = normaliseText(book.title);
    const subjects = (book.subjects || []).join(" ").toLowerCase();
    const description = String(book.description || "").toLowerCase();
    const text = title + " " + subjects + " " + description;

    // Known Kenyan set books must be classified accurately.
    const knownBook = knownKenyanBooks.find(function (item) {
        return normaliseText(item.title) === title;
    });

    if (knownBook) return knownBook.category;

    if (
        text.includes("revision") ||
        text.includes("exam preparation") ||
        text.includes("past paper")
    ) {
        return "revision";
    }

    if (
        text.includes("textbook") ||
        text.includes("text book")
    ) {
        return "textbook";
    }

    if (
        text.includes("university textbook") ||
        text.includes("college textbook") ||
        text.includes("higher education")
    ) {
        return "university";
    }

    // Do not label every novel as a Kenyan set book.
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
            "Category: " + formatLabel(
                detectInternationalCategory(book.subject)
            )
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
            !category ||
            detectInternationalCategory(book.subject) === category;

        const matchesSubject =
            !subject ||
            (book.subject || []).includes(subject);

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
// KENYAN BOOKS: SUPABASE
// --------------------------------------------------

function populateKenyanSubjects() {
    const selected = kenyanSubject.value;

    kenyanSubject.replaceChildren();
    addOption(kenyanSubject, "", "All subjects");

    const subjects = new Set();

    kenyanSubjects.forEach(function (subject) {
        subjects.add(subject.name);
    });

    kenyanBooks.forEach(function (book) {
        if (book.subject_name) subjects.add(book.subject_name);
    });

    kenyanSearchResults.forEach(function (book) {
        (book.subjects || []).forEach(function (subject) {
            if (subject) subjects.add(subject);
        });
    });

    Array.from(subjects).sort().slice(0, 200).forEach(function (name) {
        addOption(kenyanSubject, name, name);
    });

    if (subjects.has(selected)) {
        kenyanSubject.value = selected;
    }
}

function makeKenyanLocalCard(book) {
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
                "Published: " + book.publication_year
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
        const link = makeElement("a", "resource-link", "Open resource");
        link.href = sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.append(link);
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
                "title, description, author, resource_type, subject_id, language, publication_year, cover_url, source_name, source_url, licence, access_type, file_path, download_allowed"
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
// KENYAN BOOKS: EXTERNAL SOURCES
// --------------------------------------------------

function normaliseOpenLibraryBook(book) {
    const subjects = Array.isArray(book.subject) ? book.subject : [];

    return {
        id: "ol:" + book.key,
        title: book.title || "Untitled book",
        author: book.author_name ? book.author_name[0] : "Unknown author",
        year: book.first_publish_year || "",
        subjects: subjects,
        category: "other",
        cover: Number.isInteger(book.cover_i)
            ? "https://covers.openlibrary.org/b/id/" + book.cover_i + "-M.jpg"
            : null,
        source: "Open Library",
        sourceUrl: book.key
            ? "https://openlibrary.org" + book.key
            : null,
        isbn: Array.isArray(book.isbn) ? book.isbn[0] : ""
    };
}

function normaliseGoogleBook(item) {
    const volume = item.volumeInfo || {};
    const imageLinks = volume.imageLinks || {};
    const subjects = Array.isArray(volume.categories)
        ? volume.categories
        : [];

    let cover = imageLinks.thumbnail || imageLinks.smallThumbnail || null;

    if (cover) cover = cover.replace(/^http:/, "https:");

    return {
        id: "gb:" + item.id,
        title: volume.title || "Untitled book",
        author: volume.authors ? volume.authors[0] : "Unknown author",
        year: volume.publishedDate || "",
        subjects: subjects,
        category: "other",
        cover: safeExternalUrl(cover),
        source: "Google Books",
        sourceUrl: safeExternalUrl(volume.infoLink || volume.previewLink),
        isbn: ""
    };
}

async function searchOpenLibrary(query) {
    const params = new URLSearchParams({
        q: query,
        limit: "20",
        fields: "key,title,author_name,first_publish_year,cover_i,subject,isbn"
    });

    const response = await fetch(SEARCH_URL + "?" + params.toString());

    if (!response.ok) throw new Error("Open Library search failed.");

    const result = await response.json();

    return (result.docs || []).map(normaliseOpenLibraryBook);
}

async function searchGoogleBooks(query) {
    const params = new URLSearchParams({
        q: query,
        maxResults: "20",
        printType: "books"
    });

    const response = await fetch(
        GOOGLE_BOOKS_URL + "?" + params.toString()
    );

    if (!response.ok) throw new Error("Google Books search failed.");

    const result = await response.json();

    return (result.items || []).map(normaliseGoogleBook);
}

function findKnownKenyanBooks(query) {
    const search = normaliseText(query);

    return knownKenyanBooks.filter(function (book) {
        return (
            normaliseText(book.title).includes(search) ||
            search.includes(normaliseText(book.title)) ||
            normaliseText(book.author).includes(search) ||
            book.isbn.includes(search)
        );
    });
}

function makeExternalKenyanCard(book) {
    const card = makeElement("article", "book-result");
    const cover = makeElement("div", "book-cover");

    const coverUrl = safeExternalUrl(book.cover);

    if (coverUrl) {
        const image = document.createElement("img");
        image.src = coverUrl;
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

    if (book.publisher) {
        info.append(
            makeElement("p", "book-meta", "Publisher: " + book.publisher)
        );
    }

    if (book.year) {
        info.append(
            makeElement("p", "book-meta", "Year: " + book.year)
        );
    }

    if (book.isbn) {
        info.append(
            makeElement("p", "book-meta", "ISBN: " + book.isbn)
        );
    }

    info.append(makeElement("span", "access-badge", book.source));
    card.append(cover, info);

    if (book.sourceUrl) {
        const link = makeElement("a", "resource-link", "View catalogue record");
        link.href = book.sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.append(link);
    }

    return card;
}

// --------------------------------------------------
// KENYAN SEARCH AND FILTERING
// --------------------------------------------------

function renderKenyanResults() {
    const searchTerm = kenyanSearchInput.value.trim().toLowerCase();
    const selectedCategory = kenyanCategory.value;
    const selectedSubject = kenyanSubject.value;

    const localResults = kenyanBooks.map(function (book) {
        return {
            kind: "local",
            book: book,
            title: book.title || "",
            author: book.author || "",
            subjects: [book.subject_name || ""],
            category: book.resource_type || "other"
        };
    });

    const externalResults = kenyanSearchResults.map(function (book) {
        return {
            kind: "external",
            book: book,
            title: book.title,
            author: book.author,
            subjects: book.subjects || [],
            category: book.category || "other"
        };
    });

    const allResults = localResults.concat(externalResults);

    const filtered = allResults.filter(function (item) {
        const searchable = [
            item.title,
            item.author,
            item.subjects.join(" ")
        ].join(" ").toLowerCase();

        const matchesSearch =
            !searchTerm || searchable.includes(searchTerm);

        const matchesCategory =
            !selectedCategory || item.category === selectedCategory;

        const matchesSubject =
            !selectedSubject || item.subjects.some(function (subject) {
                return subject.toLowerCase() === selectedSubject.toLowerCase();
            });

        return matchesSearch && matchesCategory && matchesSubject;
    });

    kenyanBookGrid.replaceChildren();

    if (!filtered.length) {
        kenyanBookStatus.textContent =
            "No matching books found. Try another search or filter.";
        return;
    }

    filtered.forEach(function (item) {
        if (item.kind === "local") {
            kenyanBookGrid.append(makeKenyanLocalCard(item.book));
        } else {
            kenyanBookGrid.append(makeExternalKenyanCard(item.book));
        }
    });

    kenyanBookStatus.textContent =
        "Showing " + filtered.length +
        " results from LearnSphere and external catalogues.";
}

async function searchKenyanBooks(query) {
    kenyanBookStatus.textContent =
        "Searching LearnSphere and external catalogues...";

    kenyanSearchResults = [];

    const results = await Promise.allSettled([
        searchOpenLibrary(query),
        searchGoogleBooks(query)
    ]);

    let externalBooks = [];
    const failedSources = [];

    results.forEach(function (result, index) {
        if (result.status === "fulfilled") {
            externalBooks = externalBooks.concat(result.value);
        } else {
            failedSources.push(
                index === 0 ? "Open Library" : "Google Books"
            );
            console.error(result.reason);
        }
    });

    // Add known Kenyan catalogue records when the query matches.
    const knownBooks = findKnownKenyanBooks(query);

    // Remove duplicate external records by title + author.
    const seen = new Set();

    externalBooks.forEach(function (book) {
        const key =
            normaliseText(book.title) + "|" +
            normaliseText(book.author);

        if (!seen.has(key)) {
            seen.add(key);
            book.category = detectKenyanCategory(book);
            kenyanSearchResults.push(book);
        }
    });

    knownBooks.forEach(function (book) {
        const key =
            normaliseText(book.title) + "|" +
            normaliseText(book.author);

        if (!seen.has(key)) {
            seen.add(key);
            kenyanSearchResults.unshift(book);
        }
    });

    populateKenyanSubjects();
    renderKenyanResults();

    if (failedSources.length) {
        kenyanBookStatus.textContent +=
            " Unavailable sources: " + failedSources.join(", ") + ".";
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

    searchKenyanBooks(query);
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
// START THE LIBRARY
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

            searchKenyanBooks(query);
            runInternationalSearch(query, 1);
        }

    } catch (error) {
        console.error("Library startup error:", error);

        kenyanBookStatus.textContent =
            "Some library information could not be loaded.";
    }
}

start();
