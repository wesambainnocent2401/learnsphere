const SEARCH_URL = "https://openlibrary.org/search.json";
const PAGE_SIZE = 20;

const libraryForm = document.getElementById("libraryForm");
const libraryInput = document.getElementById("libraryInput");
const libraryStatus = document.getElementById("libraryStatus");
const bookGrid = document.getElementById("bookGrid");
const moreButton = document.getElementById("moreButton");

let currentQuery = "";
let currentPage = 1;
let totalFound = 0;
let shownCount = 0;

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function accessLabel(access) {
  if (access === "public") return { text: "Free to read", css: "access-badge" };
  if (access === "borrowable") return { text: "Borrow free", css: "access-badge limited" };
  return { text: "Catalogue only", css: "access-badge catalogue" };
}

function makeBookCard(book) {
  const card = makeElement("a", "book-result");

  // Only link to real Open Library work pages
  if (typeof book.key === "string" && book.key.startsWith("/works/")) {
    card.href = "https://openlibrary.org" + book.key;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }

  const cover = makeElement("div", "book-cover");
  if (Number.isInteger(book.cover_i)) {
    const image = document.createElement("img");
    image.src = "https://covers.openlibrary.org/b/id/" + book.cover_i + "-M.jpg";
    image.alt = "Cover of " + book.title;
    image.loading = "lazy";
    cover.append(image);
  } else {
    cover.textContent = "📖";
  }

  const info = makeElement("div", "book-info");
  info.append(makeElement("h3", "", book.title));

  const author = book.author_name ? book.author_name[0] : "Unknown author";
  info.append(makeElement("p", "book-meta", author));

  if (book.first_publish_year) {
    info.append(makeElement("p", "book-meta", "First published " + book.first_publish_year));
  }

  const label = accessLabel(book.ebook_access);
  info.append(makeElement("span", label.css, label.text));

  card.append(cover, info);
  return card;
}

async function fetchBooks(query, page) {
  const params = new URLSearchParams({
    q: query,
    limit: PAGE_SIZE,
    page: page,
    fields: "key,title,author_name,first_publish_year,cover_i,ebook_access"
  });

  const response = await fetch(SEARCH_URL + "?" + params.toString());
  if (!response.ok) throw new Error("The book catalogue is not responding. Please try again.");
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

    totalFound = result.numFound;
    result.docs.forEach(function (book) {
      bookGrid.append(makeBookCard(book));
    });
    shownCount += result.docs.length;

    if (totalFound === 0) {
      libraryStatus.textContent = 'No books found for "' + query + '".';
    } else {
      libraryStatus.textContent = "Showing " + shownCount + " of " + totalFound.toLocaleString() + " results";
    }

    moreButton.hidden = shownCount >= totalFound;
  } catch (error) {
    libraryStatus.textContent = error.message;
  }
}

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

// Allow links like library.html?q=calculus
const startingQuery = new URLSearchParams(window.location.search).get("q");
if (startingQuery) {
  libraryInput.value = startingQuery.slice(0, 200);
  currentQuery = libraryInput.value.trim();
  if (currentQuery) runSearch(currentQuery, 1);
}
