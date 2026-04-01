const uploadView = document.getElementById("uploadView");
const confirmView = document.getElementById("confirmView");
const dashboardView = document.getElementById("dashboardView");

const csvInput = document.getElementById("csvInput");
const dropzone = document.getElementById("dropzone");
const dropzoneText = document.getElementById("dropzoneText");

const selectedFileName = document.getElementById("selectedFileName");
const confirmUploadButton = document.getElementById("confirmUploadButton");
const changeFileButton = document.getElementById("changeFileButton");
const confirmError = document.getElementById("confirmError");

const sourceBadge = document.getElementById("sourceBadge");
const statBooks = document.getElementById("statBooks");
const statAuthors = document.getElementById("statAuthors");
const statCountries = document.getElementById("statCountries");
const statPages = document.getElementById("statPages");
const statAvgRating = document.getElementById("statAvgRating");
const yearChart = document.getElementById("yearChart");
const yearMin = document.getElementById("yearMin");
const yearMax = document.getElementById("yearMax");
const decadesList = document.getElementById("decadesList");
const booksTab = document.getElementById("booksTab");
const ratingsTab = document.getElementById("ratingsTab");
const taxonomyMostReadTab = document.getElementById("taxonomyMostReadTab");
const taxonomyHighestRatedTab = document.getElementById("taxonomyHighestRatedTab");
const genreList = document.getElementById("genreList");
const countryList = document.getElementById("countryList");
const taxonomyNote = document.getElementById("taxonomyNote");
const themesMostReadTab = document.getElementById("themesMostReadTab");
const themesHighestRatedTab = document.getElementById("themesHighestRatedTab");
const themeList = document.getElementById("themeList");
const themesNote = document.getElementById("themesNote");
const collectionsCompleteTab = document.getElementById("collectionsCompleteTab");
const collectionsAlmostTab = document.getElementById("collectionsAlmostTab");
const collectionsGrid = document.getElementById("collectionsGrid");
const metadataSourcesWrap = document.getElementById("metadataSourcesWrap");
const exportOverridesBtn = document.getElementById("exportOverridesBtn");
const overrideEditor = document.getElementById("overrideEditor");
const overrideEditorTitle = document.getElementById("overrideEditorTitle");
const overrideBookKey = document.getElementById("overrideBookKey");
const overrideYear = document.getElementById("overrideYear");
const overrideCountries = document.getElementById("overrideCountries");
const overrideGenres = document.getElementById("overrideGenres");
const overrideCoverUrl = document.getElementById("overrideCoverUrl");
const saveOverrideBtn = document.getElementById("saveOverrideBtn");
const clearOverrideBtn = document.getElementById("clearOverrideBtn");
const cancelOverrideBtn = document.getElementById("cancelOverrideBtn");

let selectedFile = null;
let latestBooksMeta = [];
let currentYearMode = "books";
let currentTaxonomyMode = "most-read";
let currentThemesMode = "most-read";
let currentCollectionsMode = "complete";
let latestSeriesData = [];

// Optional manual metadata overrides (title or ISBN key).
const METADATA_OVERRIDES = {};
const OVERRIDES_STORAGE_KEY = "statreads_metadata_overrides_v1";
let runtimeOverrides = {};

const setVisibleView = (view) => {
  uploadView.classList.remove("is-visible");
  confirmView.classList.remove("is-visible");
  dashboardView.classList.remove("is-visible");
  view.classList.add("is-visible");
};

const parseCsv = (csvText) => {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  if (rows.length < 2) {
    throw new Error("CSV appears empty or invalid.");
  }

  const headers = rows[0].map((header) => header.trim());
  const dataRows = rows.slice(1).filter((dataRow) => dataRow.some((cell) => cell.trim() !== ""));
  return { headers, dataRows };
};

const normalize = (value) => value.trim().toLowerCase();

const detectSource = (headers) => {
  const normalized = new Set(headers.map(normalize));
  if (normalized.has("read status") && normalized.has("star rating")) return "StoryGraph";
  if (normalized.has("book id") && normalized.has("exclusive shelf")) return "Goodreads";
  return "Unknown";
};

const indexMap = (headers) => {
  const map = new Map();
  headers.forEach((header, index) => map.set(normalize(header), index));
  return map;
};

const getCell = (row, idxMap, key) => {
  const index = idxMap.get(normalize(key));
  if (index === undefined) return "";
  return (row[index] || "").trim();
};

const parseNumber = (value) => {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeTitle = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const scoreOpenLibraryDoc = (doc, book) => {
  const targetTitle = normalizeTitle(book.title);
  const docTitle = normalizeTitle(doc.title || "");
  const targetAuthor = normalizeTitle(book.authorHint || "");
  const docAuthors = (doc.author_name || []).map((name) => normalizeTitle(name));

  let score = 0;
  if (docTitle === targetTitle) score += 80;
  else if (docTitle.includes(targetTitle) || targetTitle.includes(docTitle)) score += 40;

  const targetWords = targetTitle.split(" ").filter(Boolean);
  const docWords = new Set(docTitle.split(" ").filter(Boolean));
  const wordOverlap = targetWords.filter((word) => docWords.has(word)).length;
  score += wordOverlap * 4;

  if (targetAuthor) {
    if (docAuthors.some((name) => name === targetAuthor)) score += 50;
    else if (docAuthors.some((name) => name.includes(targetAuthor) || targetAuthor.includes(name))) score += 25;
  }

  if (doc.first_publish_year) score += 10;
  if (doc.cover_i) score += 2;
  return score;
};

const titleSimilarity = (docTitle, targetTitle) => {
  const docWords = new Set(normalizeTitle(docTitle).split(" ").filter(Boolean));
  const targetWords = normalizeTitle(targetTitle).split(" ").filter(Boolean);
  if (targetWords.length === 0) return 0;
  const overlap = targetWords.filter((word) => docWords.has(word)).length;
  return overlap / targetWords.length;
};

const getRelatedDocs = (docs, targetTitle, threshold = 0.4) =>
  (docs || []).filter((doc) => titleSimilarity(doc.title || "", targetTitle) >= threshold);

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toTitleCase = (value) =>
  String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");

const toDirectImageUrl = (url) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();

    // Wikipedia file page -> direct media file path.
    if (host.includes("wikipedia.org") && parsed.pathname.startsWith("/wiki/File:")) {
      const fileName = decodeURIComponent(parsed.pathname.replace("/wiki/File:", ""));
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=420`;
    }
    // Wikimedia file page -> direct media path.
    if (host.includes("wikimedia.org") && parsed.pathname.startsWith("/wiki/File:")) {
      const fileName = decodeURIComponent(parsed.pathname.replace("/wiki/File:", ""));
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=420`;
    }
    return raw;
  } catch {
    return raw;
  }
};

const SOURCE_TAGS = new Set(["openlibrary", "google", "wikidata", "manual"]);

const setSource = (book, field, source) => {
  if (!book._sources) book._sources = {};
  if (SOURCE_TAGS.has(source)) book._sources[field] = source;
};

const sourceTag = (value) => {
  const normalized = SOURCE_TAGS.has(value) ? value : "openlibrary";
  return `<span class="source-tag ${normalized}">${normalized}</span>`;
};

const readOverridesFromStorage = () => {
  try {
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
    if (!raw) return { ...METADATA_OVERRIDES };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...METADATA_OVERRIDES };
    return { ...METADATA_OVERRIDES, ...parsed };
  } catch {
    return { ...METADATA_OVERRIDES };
  }
};

const persistOverridesToStorage = () => {
  try {
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(runtimeOverrides, null, 2));
  } catch {
    // Ignore storage errors.
  }
};

const keyForBook = (book) => book.isbn || book.title;

const getOverrideForBook = (book) => {
  const direct = runtimeOverrides[book.title];
  if (direct) return direct;
  if (book.isbn && runtimeOverrides[book.isbn]) return runtimeOverrides[book.isbn];
  return null;
};

const COUNTRY_SYNONYMS = [
  ["united states", "USA"],
  ["usa", "USA"],
  ["u s a", "USA"],
  ["u.s.a", "USA"],
  ["united kingdom", "UK"],
  ["uk", "UK"],
  ["india", "India"],
  ["japan", "Japan"],
  ["france", "France"],
  ["germany", "Germany"],
  ["canada", "Canada"],
  ["china", "China"],
  ["sweden", "Sweden"],
  ["netherlands", "Netherlands"],
  ["new zealand", "New Zealand"],
  ["iran", "Iran"],
  ["denmark", "Denmark"],
  ["hong kong", "Hong Kong"],
  ["ireland", "Ireland"],
  ["italy", "Italy"],
  ["norway", "Norway"],
  ["spain", "Spain"],
  ["korea", "Korea"],
  ["south korea", "South Korea"],
  ["russia", "Russia"],
  ["mexico", "Mexico"],
  ["brazil", "Brazil"],
  ["turkey", "Turkey"],
  ["australia", "Australia"],
  ["pakistan", "Pakistan"],
  ["united states of america", "USA"],
  ["america", "USA"],
  ["england", "UK"],
];

const USA_STATE_TERMS = [
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
  "district of columbia",
];

const splitTerms = (value) =>
  String(value || "")
    .split(/[\/,;|]+/g)
    .map((term) => term.trim())
    .filter(Boolean);

const extractCountries = (rawTerms = []) => {
  const found = new Set();
  rawTerms.forEach((term) => {
    const lowered = normalizeTitle(term);
    if (/(mumbai|bombay|delhi|kolkata|calcutta|chennai|madras|bangalore|bengaluru|hyderabad|maharashtra|uttar pradesh|india)/.test(lowered)) {
      found.add("India");
    }
    if (lowered === "us" || lowered === "u s") found.add("USA");
    if (USA_STATE_TERMS.some((state) => lowered.includes(state))) {
      found.add("USA");
    }
    COUNTRY_SYNONYMS.forEach(([needle, canonical]) => {
      if (lowered.includes(needle)) found.add(canonical);
    });
  });
  return Array.from(found);
};

const extractGenres = (rawTerms = []) => {
  const genres = new Set();
  rawTerms.forEach((term) => {
    splitTerms(term).forEach((part) => {
      const cleaned = part.replace(/\s+/g, " ").trim();
      if (!cleaned) return;
      if (cleaned.length < 3 || cleaned.length > 32) return;
      const lower = normalizeTitle(cleaned);
      if (COUNTRY_SYNONYMS.some(([needle]) => lower.includes(needle))) return;
      genres.add(cleaned);
    });
  });
  return Array.from(genres);
};

const mergeUnique = (left = [], right = []) => Array.from(new Set([...(left || []), ...(right || [])]));

const normalizeGenreEntry = (raw) => {
  const base = String(raw || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return null;

  const key = normalizeTitle(base);
  if (!key) return null;

  // Strict allowlist: only keep core display genres.
  if (key.includes("science fiction") || key.includes("sci fi") || key.includes("speculative fiction")) {
    return { key: "science fiction", label: "Science Fiction" };
  }
  if (key.includes("dystopian")) return { key: "dystopian", label: "Dystopian" };
  if (key.includes("horror")) return { key: "horror", label: "Horror" };
  if (key.includes("indic fiction")) return { key: "indic fiction", label: "Indic Fiction" };
  if (key.includes("indus civilization") || key.includes("indus civilisation")) {
    return { key: "indus civilization", label: "Indus Civilization" };
  }
  if (key.includes("fantasy")) return { key: "fantasy", label: "Fantasy" };
  if (key.includes("fiction")) return { key: "fiction", label: "Fiction" };
  if (key.includes("indic mythology") || key.includes("hindu mythology")) {
    return { key: "indic mythology", label: "Indic Mythology" };
  }
  if (key.includes("mythology") || key.includes("myth")) {
    return { key: "mythology", label: "Mythology" };
  }

  return null;
};

const normalizeThemeEntry = (raw) => {
  const base = String(raw || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return null;

  const key = normalizeTitle(base);
  if (!key) return null;

  if (key.includes("adventure")) return { key: "adventure", label: "Adventure" };
  if (key.includes("quest")) return { key: "quest", label: "Quest" };
  if (key.includes("war") && !key.includes("award")) return { key: "war", label: "War" };
  if (key.includes("revenge")) return { key: "revenge", label: "Revenge" };
  if (key.includes("survival")) return { key: "survival", label: "Survival" };
  if (key.includes("good and evil") || key.includes("good vs evil")) return { key: "good and evil", label: "Good & Evil" };
  if (key.includes("coming of age")) return { key: "coming of age", label: "Coming Of Age" };
  if (key.includes("love") || key.includes("romance")) return { key: "love", label: "Love & Romance" };
  if (key.includes("friendship")) return { key: "friendship", label: "Friendship" };
  if (key.includes("family")) return { key: "family", label: "Family" };
  if (key.includes("betrayal")) return { key: "betrayal", label: "Betrayal" };
  if (key.includes("identity")) return { key: "identity", label: "Identity" };
  if (key.includes("religion") || key.includes("spiritual")) return { key: "religion", label: "Religion & Spirituality" };
  if (key.includes("philosophy") || key.includes("philosophical")) return { key: "philosophy", label: "Philosophy" };
  if (key.includes("politic")) return { key: "politics", label: "Politics" };
  if (key.includes("history") || key.includes("historical")) return { key: "history", label: "History" };
  if (key.includes("magic") || key.includes("magical")) return { key: "magic", label: "Magic" };
  if (key.includes("supernatural")) return { key: "supernatural", label: "Supernatural" };
  if (key.includes("technology") || key.includes("artificial intelligence") || key.includes("computer")) {
    return { key: "technology", label: "Technology" };
  }
  if (key.includes("apocaly") || key.includes("post-apocaly")) return { key: "apocalyptic", label: "Apocalyptic" };
  if (key.includes("rebellion") || key.includes("revolution")) return { key: "revolution", label: "Revolution" };
  if (key.includes("hero")) return { key: "heroes", label: "Heroes" };
  if (key.includes("empire") || key.includes("kingdom")) return { key: "empires", label: "Empires & Kingdoms" };
  if (key.includes("prophecy") || key.includes("destiny")) return { key: "prophecy", label: "Prophecy & Destiny" };
  if (key.includes("sacrifice")) return { key: "sacrifice", label: "Sacrifice" };
  if (key.includes("power")) return { key: "power", label: "Power" };
  if (key.includes("death") || key.includes("mortality")) return { key: "death", label: "Death & Mortality" };
  if (key.includes("journey") || key.includes("voyage")) return { key: "journey", label: "Journey" };
  if (key.includes("ancient") || key.includes("civilization") || key.includes("civilisation")) {
    return { key: "ancient world", label: "Ancient World" };
  }
  if (key.includes("monster") || key.includes("creature")) return { key: "monsters", label: "Monsters & Creatures" };
  if (key.includes("psycholog")) return { key: "psychological", label: "Psychological" };
  if (key.includes("suspense") || key.includes("thriller")) return { key: "suspense", label: "Suspense" };
  if (key.includes("survival")) return { key: "survival", label: "Survival" };
  if (key.includes("isolation") || key.includes("loneliness")) return { key: "isolation", label: "Isolation" };
  if (key.includes("oppression") || key.includes("totalitarian") || key.includes("dystopian")) {
    return { key: "oppression", label: "Oppression" };
  }
  if (key.includes("horror") || key.includes("terror") || key.includes("fear")) return { key: "horror", label: "Horror & Fear" };
  if (key.includes("science fiction") || key.includes("sci fi")) return { key: "futuristic", label: "Futuristic" };
  if (key.includes("epic")) return { key: "epic", label: "Epic" };
  if (key.includes("torture") || key.includes("suffering") || key.includes("cruelty")) {
    return { key: "suffering", label: "Suffering" };
  }
  if (key.includes("humanity") || key.includes("human condition")) return { key: "humanity", label: "Humanity" };
  if (key.includes("trapped") || key.includes("captiv") || key.includes("prison")) {
    return { key: "captivity", label: "Captivity" };
  }

  return null;
};

const normalizeGenreLabels = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    const normalized = normalizeGenreEntry(item);
    if (!normalized) return;
    map.set(normalized.key, normalized.label);
  });
  return Array.from(map.values());
};

const pickSingleCountry = (countries = []) => {
  const normalized = extractCountries(countries);
  if (normalized.includes("USA")) return ["USA"];
  if (normalized.includes("India")) return ["India"];
  if (normalized.length > 0) return [normalized[0]];
  return [];
};

const countryCodeToName = (code) => {
  const map = {
    us: "USA",
    in: "India",
    gb: "UK",
    uk: "UK",
    jp: "Japan",
    fr: "France",
    de: "Germany",
    ca: "Canada",
    cn: "China",
    se: "Sweden",
    nl: "Netherlands",
    nz: "New Zealand",
    ir: "Iran",
    dk: "Denmark",
    hk: "Hong Kong",
    ie: "Ireland",
    it: "Italy",
    no: "Norway",
    es: "Spain",
    kr: "South Korea",
    ru: "Russia",
    mx: "Mexico",
    br: "Brazil",
    tr: "Turkey",
    au: "Australia",
    pk: "Pakistan",
  };
  return map[String(code || "").toLowerCase()] || "";
};

const inferCountriesFromAuthorPayload = (authorPayload) => {
  if (!authorPayload) return [];
  const terms = [authorPayload.birth_place || "", authorPayload.location || "", authorPayload.death_place || ""];
  return extractCountries(terms);
};

const getAuthorIdentityKey = (book) =>
  normalizeTitle((book.authors && book.authors[0]) || book.authorHint || "");

const collectAuthorCandidates = (book) =>
  (() => {
    const names = Array.from(
      new Set(
        [book.authorHint || "", ...(book.authors || [])]
          .map((name) => String(name || "").trim())
          .filter(Boolean)
      )
    );
    const multiWord = names.filter((name) => name.split(/\s+/).length >= 2);
    return multiWord.length > 0 ? multiWord : names;
  })();

const extractYearHintFromRow = (row, idx, source) => {
  const candidates =
    source === "Goodreads"
      ? ["Date Published", "Original Publication Year", "Year Published"]
      : ["Original Publication Year", "Publication Year", "Date Published"];

  for (const key of candidates) {
    const year = parsePublishedYear(getCell(row, idx, key));
    if (year) return year;
  }
  return null;
};

const extractAuthorHintFromRow = (row, idx, source) => {
  const value = source === "StoryGraph" ? getCell(row, idx, "Authors") : getCell(row, idx, "Author");
  if (!value) return "";
  const [firstAuthor] = value.split(",");
  return (firstAuthor || "").trim();
};

const buildStats = (headers, rows, source) => {
  const idx = indexMap(headers);
  let selectedRows = rows;

  if (source === "StoryGraph") {
    selectedRows = rows.filter((row) => normalize(getCell(row, idx, "Read Status")) === "read");
  } else if (source === "Goodreads") {
    selectedRows = rows.filter((row) => normalize(getCell(row, idx, "Exclusive Shelf")) === "read");
    if (selectedRows.length === 0) selectedRows = rows;
  }

  const bookMap = new Map();
  const csvAuthors = new Set();
  let ratingTotal = 0;
  let ratingCount = 0;

  selectedRows.forEach((row) => {
    const title = getCell(row, idx, "Title");
    if (title && !bookMap.has(title)) {
      const isbnRaw = source === "StoryGraph" ? getCell(row, idx, "ISBN/UID") : getCell(row, idx, "ISBN13") || getCell(row, idx, "ISBN");
      const isbn = (isbnRaw || "").replace(/[^0-9Xx]/g, "");
      const publishedYearHint = extractYearHintFromRow(row, idx, source);
      const authorHint = extractAuthorHintFromRow(row, idx, source);
      bookMap.set(title, { title, isbn, publishedYearHint, authorHint, userRatings: [] });
    }

    const authorField = source === "StoryGraph" ? getCell(row, idx, "Authors") : getCell(row, idx, "Author");
    authorField
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => csvAuthors.add(name));

    const ratingField = source === "StoryGraph" ? "Star Rating" : "My Rating";
    const rating = parseNumber(getCell(row, idx, ratingField));
    if (rating > 0) {
      ratingTotal += rating;
      ratingCount += 1;
      if (title && bookMap.has(title)) {
        bookMap.get(title).userRatings.push(rating);
      }
    }
  });

  const booksList = Array.from(bookMap.values()).map((book) => {
    const userRating =
      book.userRatings.length > 0 ? book.userRatings.reduce((sum, value) => sum + value, 0) / book.userRatings.length : null;
    return {
      title: book.title,
      isbn: book.isbn,
      publishedYearHint: book.publishedYearHint || null,
      authorHint: book.authorHint || "",
      userRating,
    };
  });

  return {
    books: booksList.length,
    csvAuthorCount: csvAuthors.size,
    avgRating: ratingCount > 0 ? ratingTotal / ratingCount : null,
    booksList,
  };
};

const formatNumber = (number) => number.toLocaleString("en-US");

const parsePublishedYear = (value) => {
  if (!value) return null;
  const match = String(value).match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  if (!Number.isFinite(year) || year < 1000 || year > 2100) return null;
  return year;
};

const fetchWikidataMetadata = async (book, fetchJson) => {
  const query = `${book.title} ${book.authorHint || ""}`.trim();
  const searchPayload = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&origin=*&search=${encodeURIComponent(
      query
    )}`
  );
  if (!searchPayload || !Array.isArray(searchPayload.search) || searchPayload.search.length === 0) return null;

  const ranked = [...searchPayload.search].sort((a, b) => {
    const simA = titleSimilarity(a.label || "", book.title);
    const simB = titleSimilarity(b.label || "", book.title);
    return simB - simA;
  });
  const best = ranked[0];
  if (!best || !best.id) return null;

  const entityPayload = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${encodeURIComponent(
      best.id
    )}&props=claims|labels&languages=en&origin=*`
  );
  const entity = entityPayload?.entities?.[best.id];
  if (!entity || !entity.claims) return null;

  const readEntityIdClaims = (pid) =>
    (entity.claims[pid] || [])
      .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);
  const readTimeClaimYear = (pid) => {
    const claim = (entity.claims[pid] || [])[0];
    const raw = claim?.mainsnak?.datavalue?.value?.time;
    return parsePublishedYear(raw);
  };
  const readStringClaim = (pid) => {
    const claim = (entity.claims[pid] || [])[0];
    return claim?.mainsnak?.datavalue?.value || null;
  };

  const publicationYear = readTimeClaimYear("P577");
  const imageFile = readStringClaim("P18");
  const genreIds = readEntityIdClaims("P136");
  const countryIds = readEntityIdClaims("P495");
  const authorIds = readEntityIdClaims("P50");

  let authorCountryIds = [];
  if (authorIds.length > 0) {
    const authorEntitiesPayload = await fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${encodeURIComponent(
        authorIds.join("|")
      )}&props=claims|labels&languages=en&origin=*`
    );
    authorIds.forEach((id) => {
      const authorEntity = authorEntitiesPayload?.entities?.[id];
      const ids =
        (authorEntity?.claims?.P27 || [])
          .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
          .filter(Boolean) || [];
      authorCountryIds.push(...ids);
    });
  }

  const idsToResolve = Array.from(new Set([...genreIds, ...countryIds, ...authorCountryIds]));
  let idLabelMap = new Map();
  if (idsToResolve.length > 0) {
    const labelsPayload = await fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${encodeURIComponent(
        idsToResolve.join("|")
      )}&props=labels&languages=en&origin=*`
    );
    idsToResolve.forEach((id) => {
      const label = labelsPayload?.entities?.[id]?.labels?.en?.value;
      if (label) idLabelMap.set(id, label);
    });
  }

  return {
    publicationYear,
    genres: genreIds.map((id) => idLabelMap.get(id)).filter(Boolean),
    countries: [...countryIds, ...authorCountryIds].map((id) => idLabelMap.get(id)).filter(Boolean),
    imageFile,
  };
};

const fetchWikidataAuthorCountries = async (authorQuery, fetchJsonFn) => {
  const query = String(authorQuery || "").trim();
  if (!query) return [];

  const wdFetch = async (url) => {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) return null;
    return resp.json();
  };

  const searchPayload = await wdFetch(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&origin=*&search=${encodeURIComponent(query)}`
  );
  if (!searchPayload || !Array.isArray(searchPayload.search) || searchPayload.search.length === 0) return [];

  const ranked = [...searchPayload.search].sort((a, b) => {
    const sa = titleSimilarity(a.label || "", query);
    const sb = titleSimilarity(b.label || "", query);
    return sb - sa;
  });
  const best = ranked[0];
  if (!best || !best.id) return [];

  const entityPayload = await wdFetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${encodeURIComponent(best.id)}&props=claims&languages=en&origin=*`
  );
  const entity = entityPayload?.entities?.[best.id];
  if (!entity) return [];

  // P27 = country of citizenship (most reliable for nationality)
  let idsToResolve = (entity.claims?.P27 || [])
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);

  // Fallback: P19 = place of birth → resolve its P17 (country) later
  if (idsToResolve.length === 0) {
    const birthPlaceIds = (entity.claims?.P19 || [])
      .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);
    if (birthPlaceIds.length > 0) {
      const bpPayload = await wdFetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${encodeURIComponent(birthPlaceIds[0])}&props=claims&languages=en&origin=*`
      );
      const bpEntity = bpPayload?.entities?.[birthPlaceIds[0]];
      idsToResolve = (bpEntity?.claims?.P17 || [])
        .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
        .filter(Boolean);
    }
  }

  if (idsToResolve.length === 0) return [];

  const labelsPayload = await wdFetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${encodeURIComponent(idsToResolve.join("|"))}&props=labels&languages=en&origin=*`
  );
  const labels = idsToResolve
    .map((id) => labelsPayload?.entities?.[id]?.labels?.en?.value)
    .filter(Boolean);
  return extractCountries(labels);
};

const detectSeriesFromText = (text) => {
  if (!text) return null;
  // "(Series Name Book 1)" or "(Series Name #2)" or "(Series Name Vol. 3)"
  const m1 = text.match(/\((.+?)(?:\s+Book\s+|\s*#\s*|\s+Vol\.?\s*)(\d+)\)/i);
  if (m1) return { name: m1[1].trim(), number: parseInt(m1[2], 10) };
  // "(The Shiva Trilogy Book 1)" or "(Shiva Trilogy)"
  const m2 = text.match(/\((?:The\s+)?(.+?Trilogy)(?:\s+Book\s*(\d+))?\)/i);
  if (m2) return { name: m2[1].trim(), number: m2[2] ? parseInt(m2[2], 10) : null };
  // "Title - Series Name Book 1"
  const m3 = text.match(/[-–—]\s*(.+?)(?:\s+Book\s+|\s*#\s*)(\d+)\s*$/i);
  if (m3) return { name: m3[1].trim(), number: parseInt(m3[2], 10) };
  // "The Series Name Book 1" or "Series Name Book 1" (standalone, e.g. subtitle)
  const m4 = text.match(/^(?:The\s+)?(.+?)(?:\s+Book\s+|\s*#\s*|\s+Vol\.?\s*)(\d+)\s*$/i);
  if (m4) return { name: m4[1].trim(), number: parseInt(m4[2], 10) };
  // "Book 1 of the Series Name"
  const m5 = text.match(/^Book\s+(\d+)\s+of\s+(?:the\s+)?(.+)$/i);
  if (m5) return { name: m5[2].trim(), number: parseInt(m5[1], 10) };
  // "Series Name 1" (number at end, e.g. "Shiva Trilogy 1")
  const m6 = text.match(/^(?:The\s+)?(.+?(?:Trilogy|Series|Saga|Chronicles))\s+(\d+)\s*$/i);
  if (m6) return { name: m6[1].trim(), number: parseInt(m6[2], 10) };
  return null;
};

const detectSeriesFromTitle = (title, subtitle) => {
  return detectSeriesFromText(title) || detectSeriesFromText(subtitle);
};

const cleanSeriesBookTitle = (title) =>
  String(title || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s*[-–—].*$/, "")
    .replace(/\s*:.*$/, "")
    .replace(/special\s+collector'?s?\s*edition/i, "")
    .replace(/collector'?s?\s*edition/i, "")
    .replace(/special\s*edition/i, "")
    .replace(/\b(anniversary|deluxe|illustrated|enhanced|expanded|revised)\s*edition\b/i, "")
    .replace(/\s+/g, " ")
    .trim();

const fetchBooksMetadata = async (booksList) => {
  const metadata = [];
  const requests = booksList.map(async (book) => {
    const merged = {
      ...book,
      authors: [],
      publishedYear: book.publishedYearHint || null,
      apiRating: null,
      coverUrl: "",
      genres: [],
      countries: [],
      pageCount: null,
      rawSubjects: [],
      seriesName: null,
      seriesNumber: null,
      _sources: {},
    };

    try {
      const fetchJson = async (url) => {
        const response = await fetch(url);
        if (!response.ok) return null;
        return response.json();
      };

      // Primary: Open Library Search (first_publish_year is original year)
      const titleUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}${
        book.authorHint ? `&author=${encodeURIComponent(book.authorHint)}` : ""
      }&limit=8&fields=key,title,author_name,author_key,first_publish_year,cover_i,subject,subject_place,place`;
      let titlePayload = await fetchJson(titleUrl);
      if (titlePayload) {
        const docs = titlePayload.docs || [];
        const relatedDocs = getRelatedDocs(docs, book.title, 0.4);
        const enrichmentDocs = relatedDocs.length > 0 ? relatedDocs : docs;

        const targetAuthor = normalizeTitle(book.authorHint || "");
        const strongDocs = docs.filter((doc) => titleSimilarity(doc.title || "", book.title) >= 0.6);
        const strongAuthorDocs = strongDocs.filter((doc) => {
          const authors = (doc.author_name || []).map((name) => normalizeTitle(name));
          if (!targetAuthor) return false;
          return authors.some((name) => name === targetAuthor || name.includes(targetAuthor) || targetAuthor.includes(name));
        });
        const candidateDocs = strongAuthorDocs.length > 0 ? strongAuthorDocs : strongDocs.length > 0 ? strongDocs : docs;

        const rankedDocs = [...candidateDocs].sort((a, b) => scoreOpenLibraryDoc(b, book) - scoreOpenLibraryDoc(a, book));
        const bestDoc = rankedDocs[0];
        const coverDoc =
          rankedDocs.find((doc) => doc.cover_i) ||
          enrichmentDocs.find((doc) => doc.cover_i) ||
          bestDoc;

        if (bestDoc) {
          const candidateYears = candidateDocs
            .map((doc) => parsePublishedYear(doc.first_publish_year))
            .filter((year) => typeof year === "number");
          const enrichmentYears = enrichmentDocs
            .map((doc) => parsePublishedYear(doc.first_publish_year))
            .filter((year) => typeof year === "number");
          const earliestCandidateYear = candidateYears.length > 0 ? Math.min(...candidateYears) : null;
          const earliestEnrichmentYear = enrichmentYears.length > 0 ? Math.min(...enrichmentYears) : null;

          if (merged.authors.length === 0) merged.authors = (bestDoc.author_name || []).filter(Boolean);
          const mergedSubjects = enrichmentDocs.flatMap((doc) => doc.subject || []);
          merged.rawSubjects = mergeUnique(merged.rawSubjects, mergedSubjects);
          const genreBefore = merged.genres.length;
          merged.genres = mergeUnique(merged.genres, extractGenres(mergedSubjects));
          if (merged.genres.length > genreBefore && !merged._sources.genres) setSource(merged, "genres", "openlibrary");
          if (earliestCandidateYear) {
            merged.publishedYear = earliestCandidateYear;
            setSource(merged, "publishedYear", "openlibrary");
          } else if (earliestEnrichmentYear) {
            merged.publishedYear = earliestEnrichmentYear;
            setSource(merged, "publishedYear", "openlibrary");
          }
          if (!merged.publishedYear) {
            merged.publishedYear = parsePublishedYear(bestDoc.first_publish_year) || merged.publishedYear;
            if (merged.publishedYear) setSource(merged, "publishedYear", "openlibrary");
          }
          if (!merged.coverUrl && coverDoc && coverDoc.cover_i) {
            merged.coverUrl = `https://covers.openlibrary.org/b/id/${coverDoc.cover_i}-L.jpg`;
            if (merged.coverUrl) setSource(merged, "coverUrl", "openlibrary");
          }

          // Pull the work-level first publish date (original release) when available.
          if (typeof bestDoc.key === "string" && bestDoc.key.startsWith("/works/")) {
            const workPayload = await fetchJson(`https://openlibrary.org${bestDoc.key}.json`);
            if (workPayload) {
              const workFirstYear =
                parsePublishedYear(workPayload.first_publish_date) || parsePublishedYear(workPayload.first_publish_year);
              if (workFirstYear) {
                merged.publishedYear = Math.min(merged.publishedYear || workFirstYear, workFirstYear);
                setSource(merged, "publishedYear", "openlibrary");
              }

              // Work-level taxonomy is often richer than search docs.
              const workGenreBefore = merged.genres.length;
              merged.rawSubjects = mergeUnique(merged.rawSubjects, workPayload.subjects || []);
              merged.genres = mergeUnique(merged.genres, extractGenres(workPayload.subjects || []));
              if (merged.genres.length > workGenreBefore && !merged._sources.genres) setSource(merged, "genres", "openlibrary");
              const workCovers = workPayload.covers || [];
              if (!merged.coverUrl && workCovers.length > 0) {
                merged.coverUrl = `https://covers.openlibrary.org/b/id/${workCovers[0]}-L.jpg`;
                if (merged.coverUrl) setSource(merged, "coverUrl", "openlibrary");
              }

              if (!merged.coverUrl || merged.pageCount === null) {
                const editionsPayload = await fetchJson(`https://openlibrary.org${bestDoc.key}/editions.json?limit=12`);
                if (editionsPayload && Array.isArray(editionsPayload.entries)) {
                  const entries = editionsPayload.entries;
                  const withCover = entries.find((entry) => entry.covers && entry.covers.length > 0);
                  if (!merged.coverUrl && withCover) {
                    merged.coverUrl = `https://covers.openlibrary.org/b/id/${withCover.covers[0]}-L.jpg`;
                    if (merged.coverUrl) setSource(merged, "coverUrl", "openlibrary");
                  }
                  if (merged.pageCount === null) {
                    const withPages = entries.find((entry) => entry.number_of_pages && entry.number_of_pages > 0);
                    if (withPages) merged.pageCount = withPages.number_of_pages;
                  }
                }
              }
            }
          }
        }
      }

      // Third source: Wikidata for canonical fields when still missing/sparse.
      // Wikidata lookup removed by request: use OpenLibrary + Google only.

      // Fallback: Google Books for missing author/cover/rating/pageCount (but not year)
      if (merged.authors.length === 0 || !merged.coverUrl || merged.apiRating === null || merged.pageCount === null) {
        const query = book.isbn
          ? `isbn:${book.isbn}`
          : `intitle:${book.title}${book.authorHint ? `+inauthor:${book.authorHint}` : ""}`;
        const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
          query
        )}&maxResults=3&printType=books`;
        const googlePayload = await fetchJson(googleUrl);
        if (googlePayload) {
          const items = googlePayload.items || [];
          const withCover = items.find(
            (entry) => entry?.volumeInfo?.imageLinks?.thumbnail || entry?.volumeInfo?.imageLinks?.smallThumbnail
          );
          const withYear = items.find((entry) => parsePublishedYear(entry?.volumeInfo?.publishedDate));
          const bestItem = withCover || withYear || items[0];
          if (bestItem && bestItem.volumeInfo) {
            const info = bestItem.volumeInfo;
            merged.authors = mergeUnique(merged.authors || [], info.authors || []);
            const gGenreBefore = merged.genres.length;
            merged.rawSubjects = mergeUnique(merged.rawSubjects, info.categories || []);
            merged.genres = mergeUnique(merged.genres, extractGenres(info.categories || []));
            if (merged.genres.length > gGenreBefore && !merged._sources.genres) setSource(merged, "genres", "google");
            if (!merged.coverUrl) {
              merged.coverUrl = (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "").replace(/^http:\/\//i, "https://");
              if (merged.coverUrl) setSource(merged, "coverUrl", "google");
            }
            if (merged.apiRating === null && typeof info.averageRating === "number") {
              merged.apiRating = info.averageRating;
              setSource(merged, "apiRating", "google");
            }
            if (merged.pageCount === null && typeof info.pageCount === "number" && info.pageCount > 0) {
              merged.pageCount = info.pageCount;
            }
          }
          if (merged.pageCount === null) {
            const withPages = items.find((entry) => entry?.volumeInfo?.pageCount > 0);
            if (withPages) merged.pageCount = withPages.volumeInfo.pageCount;
          }
          if (!merged.seriesName) {
            for (const entry of items) {
              const sd = detectSeriesFromTitle(entry?.volumeInfo?.title, entry?.volumeInfo?.subtitle);
              if (sd) { merged.seriesName = sd.name; merged.seriesNumber = sd.number; break; }
            }
          }
        }
      }

      // Author-level fallback for country signal.
      if (merged.countries.length === 0 && titlePayload && Array.isArray(titlePayload.docs)) {
        const docWithAuthor = titlePayload.docs.find((doc) => Array.isArray(doc.author_key) && doc.author_key.length > 0);
        if (docWithAuthor) {
          const authorKey = docWithAuthor.author_key[0];
          const authorPayload = await fetchJson(`https://openlibrary.org/authors/${authorKey}.json`);
          if (authorPayload) merged.countries = mergeUnique(merged.countries, inferCountriesFromAuthorPayload(authorPayload));
        }
      }

      // Last-pass title-only cover fallback from Open Library if still empty.
      if (!merged.coverUrl) {
        const broadPayload = await fetchJson(
          `https://openlibrary.org/search.json?title=${encodeURIComponent(
            book.title
          )}&limit=20&fields=key,title,author_name,author_key,first_publish_year,cover_i,subject,subject_place,place`
        );
        if (broadPayload && Array.isArray(broadPayload.docs)) {
          const relatedDocs = getRelatedDocs(broadPayload.docs, book.title, 0.35);
          const coverDoc = relatedDocs.find((doc) => doc.cover_i) || broadPayload.docs.find((doc) => doc.cover_i);
          if (coverDoc) {
            merged.coverUrl = `https://covers.openlibrary.org/b/id/${coverDoc.cover_i}-L.jpg`;
            if (merged.coverUrl) setSource(merged, "coverUrl", "openlibrary");
          }
          if (merged.genres.length === 0) {
            const relatedSubjects = (relatedDocs.length > 0 ? relatedDocs : broadPayload.docs).flatMap((doc) => doc.subject || []);
            merged.rawSubjects = mergeUnique(merged.rawSubjects, relatedSubjects);
            merged.genres = mergeUnique(merged.genres, extractGenres(relatedSubjects));
            if (merged.genres.length > 0 && !merged._sources.genres) setSource(merged, "genres", "openlibrary");
          }
        }
      }

      // Final cover/pageCount/series fallback: broader Google query.
      if (!merged.coverUrl || merged.pageCount === null || !merged.seriesName) {
        const broadGooglePayload = await fetchJson(
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
            `${book.title} ${book.authorHint || ""}`.trim()
          )}&maxResults=10&printType=books`
        );
        if (broadGooglePayload && Array.isArray(broadGooglePayload.items)) {
          const withCover = broadGooglePayload.items.find(
            (entry) => entry?.volumeInfo?.imageLinks?.thumbnail || entry?.volumeInfo?.imageLinks?.smallThumbnail
          );
          if (!merged.coverUrl && withCover && withCover.volumeInfo) {
            merged.coverUrl = (
              withCover.volumeInfo.imageLinks?.thumbnail || withCover.volumeInfo.imageLinks?.smallThumbnail || ""
            ).replace(/^http:\/\//i, "https://");
            if (merged.coverUrl) setSource(merged, "coverUrl", "google");
          }
          if (merged.pageCount === null) {
            const withPages = broadGooglePayload.items.find((entry) => entry?.volumeInfo?.pageCount > 0);
            if (withPages) merged.pageCount = withPages.volumeInfo.pageCount;
          }
          if (!merged.seriesName) {
            const allTitles = broadGooglePayload.items.map((e) => e?.volumeInfo?.title).filter(Boolean);
            console.log(`[StatReads] Series scan for "${book.title}":`, allTitles);
            for (const entry of broadGooglePayload.items) {
              const vi = entry?.volumeInfo;
              const sd = detectSeriesFromTitle(vi?.title, vi?.subtitle);
              if (sd) {
                console.log(`[StatReads] Series detected from title="${vi?.title}" subtitle="${vi?.subtitle}":`, sd);
                merged.seriesName = sd.name;
                merged.seriesNumber = sd.number;
                break;
              }
            }
            if (!merged.seriesName) console.log(`[StatReads] No series pattern found for "${book.title}"`);
          }
        }
      }
    } catch {
      // Keep merged defaults/fallback values.
    }

    metadata.push(merged);
  });

  await Promise.allSettled(requests);

  // Global author enrichment (for all books): if an author's country is known once,
  // reuse it for every book by the same author.
  const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  };
  const authorCountryMap = new Map();
  const uniqueAuthorCandidates = Array.from(
    new Set(
      metadata
        .flatMap((book) => collectAuthorCandidates(book))
        .map((name) => String(name || "").trim())
        .filter((name) => name.split(/\s+/).length >= 2)
    )
  );
  const authorRequests = uniqueAuthorCandidates.map(async (authorName) => {
    const authorKey = normalizeTitle(authorName);
    const query = authorName.replace(/\s+/g, " ").trim();
    if (!query) return;

    // Primary: Wikidata P27 (country of citizenship)
    try {
      console.log(`[StatReads] Trying Wikidata for "${query}"...`);
      const wdCountries = await fetchWikidataAuthorCountries(query, fetchJson);
      console.log(`[StatReads] Wikidata returned for "${query}":`, wdCountries);
      if (wdCountries.length > 0) {
        authorCountryMap.set(authorKey, { countries: wdCountries, source: "wikidata" });
        return;
      }
    } catch (wdErr) {
      console.warn(`[StatReads] Wikidata lookup failed for "${query}":`, wdErr);
    }

    // Fallback: Open Library author birth_place / location
    try {
      const searchPayload = await fetchJson(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(query)}&limit=5`);
      let countries = [];
      if (searchPayload && Array.isArray(searchPayload.docs) && searchPayload.docs.length > 0) {
        const docs = searchPayload.docs;
        const bestAuthorDoc =
          docs.find((doc) => normalizeTitle(doc.name || "") === authorKey) ||
          docs.find((doc) => normalizeTitle(doc.name || "").includes(authorKey) || authorKey.includes(normalizeTitle(doc.name || ""))) ||
          docs[0];
        if (bestAuthorDoc && bestAuthorDoc.key) {
          const authorPayload = await fetchJson(`https://openlibrary.org${bestAuthorDoc.key}.json`);
          countries = inferCountriesFromAuthorPayload(authorPayload);
        }
      }
      if (countries.length > 0) {
        authorCountryMap.set(authorKey, { countries, source: "openlibrary" });
      }
    } catch (olErr) {
      console.warn(`[StatReads] OL author lookup failed for "${query}":`, olErr);
    }
  });
  await Promise.allSettled(authorRequests);
  metadata.forEach((book) => {
    const candidates = collectAuthorCandidates(book).map((name) => normalizeTitle(name));
    const entries = candidates.map((key) => authorCountryMap.get(key)).filter(Boolean);
    const mergedCountries = entries.flatMap((e) => e.countries);
    const bestSource = entries.find((e) => e.source)?.source || "openlibrary";
    if (mergedCountries.length > 0) {
      const before = (book.countries || []).length;
      book.countries = mergeUnique(book.countries || [], mergedCountries);
      if ((book.countries || []).length > before && !book._sources?.countries) setSource(book, "countries", bestSource);
    }
  });

  // Share country signals across books by the same author hint.
  const authorToCountries = new Map();
  metadata.forEach((book) => {
    const key = getAuthorIdentityKey(book);
    if (!key) return;
    if (!authorToCountries.has(key)) authorToCountries.set(key, new Set());
    const bucket = authorToCountries.get(key);
    (book.countries || []).forEach((country) => bucket.add(country));
  });
  metadata.forEach((book) => {
    const key = getAuthorIdentityKey(book);
    if (!key) return;
    const authorCountries = Array.from(authorToCountries.get(key) || []);
    if (authorCountries.length > 0) {
      const before = (book.countries || []).length;
      book.countries = mergeUnique(book.countries || [], authorCountries);
      if ((book.countries || []).length > before && !book._sources?.countries) {
        const authorNormKey = normalizeTitle(key);
        const entry = authorCountryMap.get(authorNormKey);
        setSource(book, "countries", entry?.source || "openlibrary");
      }
    }
  });

  // Share genre signals across books by the same author hint.
  const authorToGenres = new Map();
  metadata.forEach((book) => {
    const key = normalizeTitle(book.authorHint || (book.authors && book.authors[0]) || "");
    if (!key) return;
    if (!authorToGenres.has(key)) authorToGenres.set(key, new Set());
    const bucket = authorToGenres.get(key);
    (book.genres || []).forEach((genre) => bucket.add(genre));
  });
  metadata.forEach((book) => {
    const key = normalizeTitle(book.authorHint || (book.authors && book.authors[0]) || "");
    if (!key) return;
    const authorGenres = Array.from(authorToGenres.get(key) || []);
    if (authorGenres.length > 0) {
      book.genres = mergeUnique(book.genres || [], authorGenres);
    }
  });

  // Share rawSubjects across books by the same author.
  const authorToSubjects = new Map();
  metadata.forEach((book) => {
    const key = normalizeTitle(book.authorHint || (book.authors && book.authors[0]) || "");
    if (!key) return;
    if (!authorToSubjects.has(key)) authorToSubjects.set(key, new Set());
    const bucket = authorToSubjects.get(key);
    (book.rawSubjects || []).forEach((s) => bucket.add(s));
  });
  metadata.forEach((book) => {
    const key = normalizeTitle(book.authorHint || (book.authors && book.authors[0]) || "");
    if (!key) return;
    const authorSubjects = Array.from(authorToSubjects.get(key) || []);
    if (authorSubjects.length > 0) {
      book.rawSubjects = mergeUnique(book.rawSubjects || [], authorSubjects);
    }
  });

  // Feed genres into rawSubjects so themes can also be derived from genre labels.
  metadata.forEach((book) => {
    if (book.genres && book.genres.length > 0) {
      book.rawSubjects = mergeUnique(book.rawSubjects || [], book.genres);
    }
  });

  // Optional manual overrides (title or ISBN key).
  metadata.forEach((book) => {
    const override = getOverrideForBook(book);
    if (!override) return;
    if (override.publishedYear) {
      book.publishedYear = override.publishedYear;
      setSource(book, "publishedYear", "manual");
    }
    if (Array.isArray(override.genres) && override.genres.length > 0) {
      book.genres = normalizeGenreLabels(override.genres);
      setSource(book, "genres", "manual");
    }
    if (Array.isArray(override.countries) && override.countries.length > 0) {
      book.countries = pickSingleCountry(override.countries);
      setSource(book, "countries", "manual");
    }
    if (override.coverUrl) {
      book.coverUrl = toDirectImageUrl(override.coverUrl);
      setSource(book, "coverUrl", "manual");
    }
  });

  // Country is singular in dashboard (author nationality).
  metadata.forEach((book) => {
    book.countries = pickSingleCountry(book.countries || []);
  });

  const authorSet = new Set();
  const countrySet = new Set();
  let totalPages = 0;
  metadata.forEach((book) => {
    (book.authors || []).forEach((name) => {
      if (name && name.trim()) authorSet.add(name.trim());
    });
    (book.countries || []).forEach((c) => {
      if (c && c.trim()) countrySet.add(c.trim());
    });
    if (book.pageCount && book.pageCount > 0) totalPages += book.pageCount;
  });

  // Common-prefix series detection for books without a seriesName (e.g., Harry Potter).
  const authorGroups = new Map();
  metadata.forEach((book) => {
    if (book.seriesName) return;
    const authorKey = normalizeTitle(book.authorHint || (book.authors && book.authors[0]) || "");
    if (!authorKey) return;
    if (!authorGroups.has(authorKey)) authorGroups.set(authorKey, []);
    authorGroups.get(authorKey).push(book);
  });
  authorGroups.forEach((books) => {
    if (books.length < 3) return;
    const titles = books.map((b) => b.title.split(/\s+/));
    let prefixWords = [];
    for (let i = 0; i < titles[0].length; i++) {
      const word = titles[0][i].toLowerCase();
      if (titles.every((t) => t[i] && t[i].toLowerCase() === word)) {
        prefixWords.push(titles[0][i]);
      } else break;
    }
    while (prefixWords.length > 0 && /^(and|the|of|in|a|an|&)$/i.test(prefixWords[prefixWords.length - 1])) {
      prefixWords.pop();
    }
    if (prefixWords.length >= 2) {
      const seriesName = prefixWords.join(" ");
      console.log(`[StatReads] Prefix-detected series: "${seriesName}" (${books.length} books)`);
      books.forEach((book) => { book.seriesName = seriesName; book._prefixSeries = true; });
    }
  });

  // Series enrichment: detect full series from Google Books for books with seriesName.
  metadata.forEach((book) => {
    console.log(`[StatReads] Book "${book.title}" seriesName=${book.seriesName}, seriesNumber=${book.seriesNumber}`);
  });
  const seriesMap = new Map();
  metadata.forEach((book) => {
    if (!book.seriesName) return;
    const key = normalizeTitle(book.seriesName);
    if (!seriesMap.has(key)) {
      seriesMap.set(key, {
        name: book.seriesName,
        authorHint: book.authorHint || (book.authors && book.authors[0]) || "",
        userBooks: [],
        prefixDetected: !!book._prefixSeries,
      });
    }
    seriesMap.get(key).userBooks.push(book);
  });

  const seriesData = [];
  const fetchJsonForSeries = async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return response.json();
    } catch { return null; }
  };

  const extractBookNumber = (title, subtitle, seriesName) => {
    const combined = `${title || ""} ${subtitle || ""}`;
    const sn = seriesName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${sn}[,:]?\\s*(?:Book\\s*|#\\s*|Vol\\.?\\s*)(\\d+)`, "i");
    const m = combined.match(re);
    if (m) return parseInt(m[1], 10);
    const re2 = new RegExp(`Book\\s+(\\d+)\\s+of\\s+(?:the\\s+)?${sn}`, "i");
    const m2 = combined.match(re2);
    if (m2) return parseInt(m2[1], 10);
    const re3 = new RegExp(`${sn}\\s+(\\d+)\\s*$`, "i");
    const m3 = combined.match(re3);
    if (m3) return parseInt(m3[1], 10);
    return null;
  };

  const seriesRequests = Array.from(seriesMap.entries()).map(async ([key, info]) => {
    try {
      // Prefix-detected series (e.g. Harry Potter): use user's own books directly.
      if (info.prefixDetected) {
        const covers = info.userBooks.map((book) => ({
          url: book.coverUrl || "",
          read: true,
        }));
        if (info.userBooks.length < 3) return;
        seriesData.push({
          name: info.name,
          totalBooks: info.userBooks.length,
          readCount: info.userBooks.length,
          covers,
        });
        console.log(`[StatReads] Prefix series "${info.name}": ${info.userBooks.length} user books`);
        return;
      }

      // API-detected series: search Google Books, use book numbers for total count.
      const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
        `intitle:"${info.name}"${info.authorHint ? ` inauthor:${info.authorHint}` : ""}`
      )}&maxResults=40&printType=books&langRestrict=en`;
      const payload = await fetchJsonForSeries(searchUrl);
      if (!payload || !Array.isArray(payload.items)) return;

      const skipPattern = /boxset|boxed?\s*set|omnibus|collection|bundle|complete\s+(trilogy|series)|set\s+of\s+\d+|\d+\s+book\s+set|companion|guide|handbook|almanac|encyclopedia|graphic\s+novel/i;
      const bookNumbers = new Map();
      const coversByNumber = new Map();

      for (const item of payload.items) {
        const vi = item.volumeInfo;
        if (!vi || !vi.title) continue;
        if (vi.language && vi.language !== "en") continue;
        if (skipPattern.test(vi.title) || skipPattern.test(vi.subtitle || "")) continue;

        const num = extractBookNumber(vi.title, vi.subtitle, info.name);
        if (num !== null && num > 0 && num <= 30) {
          if (!coversByNumber.has(num)) {
            const cover = (vi.imageLinks?.thumbnail || vi.imageLinks?.smallThumbnail || "").replace(/^http:\/\//i, "https://");
            const cleaned = normalizeTitle(cleanSeriesBookTitle(vi.title));
            coversByNumber.set(num, { cover, cleanTitle: cleaned, title: vi.title });
          }
          bookNumbers.set(num, true);
        }
      }

      const totalBooks = bookNumbers.size > 0 ? Math.max(...bookNumbers.keys()) : 0;
      console.log(`[StatReads] Series "${info.name}": numbers found = [${Array.from(bookNumbers.keys()).sort((a, b) => a - b).join(", ")}], total = ${totalBooks}`);
      if (totalBooks < 3) return;

      const userNormTitles = info.userBooks.map((b) => normalizeTitle(b.title));
      const stripThe = (s) => s.replace(/^the\s+/, "");
      const covers = [];
      let readCount = 0;

      for (let n = 1; n <= totalBooks; n++) {
        const entry = coversByNumber.get(n);
        const coverUrl = entry ? entry.cover : "";
        let isRead = false;
        if (entry) {
          const ct = stripThe(entry.cleanTitle);
          isRead = userNormTitles.some((ut) => {
            const utNoThe = stripThe(ut);
            return utNoThe === ct || utNoThe.includes(ct) || ct.includes(utNoThe);
          });
        }
        if (!isRead) {
          isRead = info.userBooks.some((ub) => ub.seriesNumber === n);
        }
        if (isRead) readCount++;
        covers.push({ url: coverUrl, read: isRead });
      }

      seriesData.push({
        name: info.name,
        totalBooks,
        readCount,
        covers,
      });
    } catch (err) {
      console.warn(`[StatReads] Series enrichment failed for "${info.name}":`, err);
    }
  });
  await Promise.allSettled(seriesRequests);

  return {
    booksMeta: metadata,
    authorCount: authorSet.size,
    countryCount: countrySet.size,
    totalPages,
    seriesData,
  };
};

const renderYearSection = (booksMeta, mode = "books") => {
  const yearData = new Map();
  booksMeta.forEach((book) => {
    if (!book.publishedYear) return;
    if (!yearData.has(book.publishedYear)) yearData.set(book.publishedYear, []);
    yearData.get(book.publishedYear).push(book);
  });

  if (yearData.size === 0) {
    yearChart.innerHTML = '<p class="section-empty">No publication-year data available.</p>';
    yearMin.textContent = "--";
    yearMax.textContent = "--";
    return;
  }

  const years = Array.from(yearData.keys()).sort((a, b) => a - b);
  const minYear = years[0];
  const maxYear = years[years.length - 1];

  const valueByYear = new Map();
  years.forEach((year) => {
    const books = yearData.get(year) || [];
    if (mode === "ratings") {
      const ratingValues = books
        .map((book) => book.userRating ?? book.apiRating)
        .filter((value) => typeof value === "number" && value > 0);
      const avg = ratingValues.length > 0 ? ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length : 0;
      valueByYear.set(year, avg);
    } else {
      valueByYear.set(year, books.length);
    }
  });

  const maxValue = Math.max(...Array.from(valueByYear.values()), 0);
  const positiveMax = maxValue > 0 ? maxValue : 1;

  const bars = [];
  for (let year = minYear; year <= maxYear; year += 1) {
    const value = valueByYear.get(year) || 0;
    const heightRatio = value > 0 ? value / positiveMax : 0.02;
    const barHeight = Math.max(2, Math.round(120 * heightRatio));
    const mix = (year - minYear) / Math.max(1, maxYear - minYear);
    const hue = mode === "ratings" ? 44 : Math.round(156 + mix * 36);
    const opacity = value > 0 ? 0.96 : 0.28;
    const titleValue = mode === "ratings" ? value.toFixed(2) : String(value);
    const suffix = mode === "ratings" ? "avg rating" : "book(s)";
    bars.push(
      `<span class="year-bar" style="height:${barHeight}px;background:hsl(${hue},82%,57%);opacity:${opacity}" title="${year}: ${titleValue} ${suffix}"></span>`
    );
  }

  yearChart.innerHTML = bars.join("");
  yearMin.textContent = String(minYear);
  yearMax.textContent = String(maxYear);
};

const setYearTab = (mode) => {
  currentYearMode = mode;
  booksTab.classList.toggle("is-active", mode === "books");
  ratingsTab.classList.toggle("is-active", mode === "ratings");
  renderYearSection(latestBooksMeta, currentYearMode);
};

const renderTaxonomyColumn = (container, rows, type, mode) => {
  if (!rows || rows.length === 0) {
    container.innerHTML = '<p class="section-empty">Not enough data.</p>';
    return;
  }

  const maxValue = Math.max(...rows.map((row) => row.value), 0);
  const safeMax = maxValue > 0 ? maxValue : 1;
  container.innerHTML = rows
    .map((row) => {
      const width = Math.max(3, Math.round((row.value / safeMax) * 100));
      const label = mode === "most-read" ? `${row.value} ${row.value === 1 ? "book" : "books"}` : `Avg ${row.value.toFixed(2)}`;
      return `
        <div class="taxonomy-item">
          <div class="taxonomy-label">${escapeHtml(row.name)}</div>
          <div class="taxonomy-bar-track">
            <div class="taxonomy-bar-fill ${type}" style="width:${width}%"></div>
            <span class="taxonomy-value">${escapeHtml(label)}</span>
          </div>
        </div>
      `;
    })
    .join("");
};

const buildTaxonomyRows = (booksMeta, extractor, mode, normalizer = null) => {
  const map = new Map();
  booksMeta.forEach((book) => {
    const rawKeys = extractor(book).filter(Boolean);
    if (rawKeys.length === 0) return;

    const normalizedEntries = rawKeys
      .map((key) => {
        if (!normalizer) return { key, label: key };
        return normalizer(key);
      })
      .filter(Boolean);

    const uniquePerBook = new Map();
    normalizedEntries.forEach((entry) => {
      if (!uniquePerBook.has(entry.key)) uniquePerBook.set(entry.key, entry.label);
    });

    uniquePerBook.forEach((label, key) => {
      if (!map.has(key)) map.set(key, { label, count: 0, ratingTotal: 0, ratingCount: 0 });
      const entry = map.get(key);
      entry.count += 1;
      if (book.userRating && book.userRating > 0) {
        entry.ratingTotal += book.userRating;
        entry.ratingCount += 1;
      }
    });
  });

  let rows = Array.from(map.entries()).map(([key, data]) => {
    if (mode === "highest-rated") {
      return {
        key,
        name: data.label || key,
        value: data.ratingCount > 0 ? data.ratingTotal / data.ratingCount : 0,
        ratedCount: data.ratingCount,
      };
    }
    return { key, name: data.label || key, value: data.count, ratedCount: data.ratingCount };
  });

  if (mode === "highest-rated") {
    rows = rows.filter((row) => row.ratedCount >= 3);
    rows.sort((a, b) => b.value - a.value || b.ratedCount - a.ratedCount);
  } else {
    rows.sort((a, b) => b.value - a.value);
  }

  return rows.slice(0, 50);
};

const renderTaxonomySection = (booksMeta, mode = "most-read") => {
  const genreRows = buildTaxonomyRows(booksMeta, (book) => book.genres || [], mode, normalizeGenreEntry);
  const countryRows = buildTaxonomyRows(booksMeta, (book) => book.countries || [], mode);
  renderTaxonomyColumn(genreList, genreRows, "genres", mode);
  renderTaxonomyColumn(countryList, countryRows, "countries", mode);
};

const setTaxonomyTab = (mode) => {
  currentTaxonomyMode = mode;
  taxonomyMostReadTab.classList.toggle("is-active", mode === "most-read");
  taxonomyHighestRatedTab.classList.toggle("is-active", mode === "highest-rated");
  if (taxonomyNote) taxonomyNote.style.display = mode === "highest-rated" ? "block" : "none";
  renderTaxonomySection(latestBooksMeta, currentTaxonomyMode);
};

const renderThemesList = (container, rows, mode) => {
  if (!rows || rows.length === 0) {
    container.innerHTML = '<p class="section-empty">Not enough data.</p>';
    return;
  }
  const maxValue = Math.max(...rows.map((row) => row.value), 0);
  const safeMax = maxValue > 0 ? maxValue : 1;
  container.innerHTML = rows
    .map((row) => {
      const width = Math.max(3, Math.round((row.value / safeMax) * 100));
      const label = mode === "most-read" ? `${row.value} ${row.value === 1 ? "book" : "books"}` : `Average ${row.value.toFixed(2)}`;
      return `
        <div class="theme-item">
          <span class="theme-name">${escapeHtml(row.name)}</span>
          <div class="theme-bar-track">
            <div class="theme-bar-fill" style="width:${width}%"></div>
          </div>
          <span class="theme-stat">${escapeHtml(label)}</span>
        </div>
      `;
    })
    .join("");
};

const renderThemesSection = (booksMeta, mode = "most-read") => {
  const themeRows = buildTaxonomyRows(
    booksMeta,
    (book) => {
      const all = (book.rawSubjects || []).filter(Boolean);
      const seen = new Set();
      const limited = [];
      for (const subject of all) {
        const entry = normalizeThemeEntry(subject);
        if (!entry || seen.has(entry.key)) continue;
        seen.add(entry.key);
        limited.push(subject);
        if (limited.length >= 2) break;
      }
      return limited;
    },
    mode,
    normalizeThemeEntry
  );
  renderThemesList(themeList, themeRows, mode);
};

const setThemesTab = (mode) => {
  currentThemesMode = mode;
  themesMostReadTab.classList.toggle("is-active", mode === "most-read");
  themesHighestRatedTab.classList.toggle("is-active", mode === "highest-rated");
  if (themesNote) themesNote.style.display = mode === "highest-rated" ? "block" : "none";
  renderThemesSection(latestBooksMeta, currentThemesMode);
};

const renderCollections = (seriesData, mode = "complete") => {
  if (!collectionsGrid) return;
  if (!seriesData || seriesData.length === 0) {
    collectionsGrid.innerHTML = '<p class="section-empty">No series detected.</p>';
    return;
  }

  const filtered = mode === "complete"
    ? seriesData.filter((s) => s.readCount >= s.totalBooks)
    : seriesData.filter((s) => s.readCount < s.totalBooks && s.totalBooks - s.readCount <= 2);

  if (filtered.length === 0) {
    const msg = mode === "complete" ? "No completed series yet." : "No almost-complete series.";
    collectionsGrid.innerHTML = `<p class="section-empty">${msg}</p>`;
    return;
  }

  collectionsGrid.innerHTML = filtered
    .map((series) => {
      const coversHtml = series.covers
        .slice(0, 6)
        .map((c) => {
          const opacity = c.read ? "1" : "0.35";
          const src = c.url || "";
          return src
            ? `<img src="${escapeHtml(src)}" alt="" class="collection-cover" style="opacity:${opacity}" loading="lazy" />`
            : `<div class="collection-cover collection-cover-placeholder" style="opacity:${opacity}"></div>`;
        })
        .join("");
      const countLabel = mode === "complete"
        ? `${series.readCount} read`
        : `${series.readCount} of ${series.totalBooks} read`;
      return `
        <div class="collection-card">
          <div class="collection-covers">${coversHtml}</div>
          <p class="collection-name">${escapeHtml(series.name)}</p>
          <p class="collection-count">${escapeHtml(countLabel)}</p>
        </div>
      `;
    })
    .join("");
};

const setCollectionsTab = (mode) => {
  currentCollectionsMode = mode;
  collectionsCompleteTab.classList.toggle("is-active", mode === "complete");
  collectionsAlmostTab.classList.toggle("is-active", mode === "almost");
  renderCollections(latestSeriesData, currentCollectionsMode);
};

const renderMetadataSources = (booksMeta) => {
  if (!metadataSourcesWrap) return;
  if (!booksMeta || booksMeta.length === 0) {
    metadataSourcesWrap.innerHTML = '<p class="section-empty">No metadata source tags available.</p>';
    return;
  }

  const rows = booksMeta
    .map((book) => {
      const sources = book._sources || {};
      const yearCell = book.publishedYear ? sourceTag(sources.publishedYear || "openlibrary") : "--";
      const genresCell = Array.isArray(book.genres) && book.genres.length > 0 ? sourceTag(sources.genres || "openlibrary") : "--";
      const countriesCell =
        Array.isArray(book.countries) && book.countries.length > 0 ? sourceTag(sources.countries || "openlibrary") : "--";
      const coverCell = book.coverUrl ? sourceTag(sources.coverUrl || "openlibrary") : "--";
      const editorKey = escapeHtml(keyForBook(book));
      const editorTitle = escapeHtml(book.title);
      return `
        <tr>
          <td title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</td>
          <td>${yearCell}</td>
          <td>${genresCell}</td>
          <td>${countriesCell}</td>
          <td>${coverCell}</td>
          <td><button type="button" class="secondary-button override-open-btn" data-override-key="${editorKey}" data-override-title="${editorTitle}">Edit Override</button></td>
        </tr>
      `;
    })
    .join("");

  metadataSourcesWrap.innerHTML = `
    <table class="metadata-table">
      <thead>
        <tr>
          <th>Book</th>
          <th>Year</th>
          <th>Genres</th>
          <th>Countries</th>
          <th>Cover</th>
          <th>Override</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

const openOverrideEditor = (bookKey, bookTitle) => {
  if (!overrideEditor) return;
  overrideBookKey.value = bookKey || "";
  overrideEditorTitle.textContent = `Override Metadata: ${bookTitle || bookKey}`;
  const existing = runtimeOverrides[bookKey] || {};
  overrideYear.value = existing.publishedYear || "";
  overrideCountries.value = Array.isArray(existing.countries) ? existing.countries[0] || "" : "";
  overrideGenres.value = Array.isArray(existing.genres) ? existing.genres.join(", ") : "";
  overrideCoverUrl.value = existing.coverUrl || "";
  overrideEditor.classList.add("is-visible");
  overrideEditor.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

const closeOverrideEditor = () => {
  if (!overrideEditor) return;
  overrideEditor.classList.remove("is-visible");
};

const parseCsvListInput = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const DEFAULT_DROPZONE_TEXT = "Drag 'n' drop CSV file here, or click to select file";

const applyRuntimeOverridesToCurrentBooks = () => {
  latestBooksMeta.forEach((book) => {
    const key = keyForBook(book);
    const override = runtimeOverrides[key] || runtimeOverrides[book.title];
    if (!override) return;
    if (override.publishedYear) {
      book.publishedYear = Number(override.publishedYear);
      setSource(book, "publishedYear", "manual");
    }
    if (Array.isArray(override.genres) && override.genres.length > 0) {
      book.genres = normalizeGenreLabels(override.genres);
      setSource(book, "genres", "manual");
    }
    if (Array.isArray(override.countries) && override.countries.length > 0) {
      book.countries = pickSingleCountry(override.countries);
      setSource(book, "countries", "manual");
    }
    if (override.coverUrl) {
      book.coverUrl = toDirectImageUrl(override.coverUrl);
      setSource(book, "coverUrl", "manual");
    }
  });
};

const rerenderFromCurrentMetadata = () => {
  setYearTab(currentYearMode);
  renderDecadesSection(latestBooksMeta);
  setTaxonomyTab(currentTaxonomyMode);
  setThemesTab(currentThemesMode);
  setCollectionsTab(currentCollectionsMode);
  renderMetadataSources(latestBooksMeta);
};

runtimeOverrides = readOverridesFromStorage();

const renderDecadesSection = (booksMeta) => {
  booksMeta.forEach((book) => {
    console.log(`[StatReads] Decade check: "${book.title}" publishedYear=${book.publishedYear} userRating=${book.userRating}`);
  });
  const groups = new Map();
  booksMeta.forEach((book) => {
    if (!book.publishedYear) return;
    const effectiveRating = book.userRating;
    if (!effectiveRating || effectiveRating <= 0) return;

    const decade = Math.floor(book.publishedYear / 10) * 10;
    if (!groups.has(decade)) {
      groups.set(decade, { total: 0, count: 0, books: [] });
    }
    const entry = groups.get(decade);
    entry.total += effectiveRating;
    entry.count += 1;
    entry.books.push(book);
  });

  const ranked = Array.from(groups.entries())
    .map(([decade, data]) => ({
      decade,
      avg: data.total / data.count,
      books: data.books,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  if (ranked.length === 0) {
    decadesList.innerHTML = '<p class="section-empty">No rated books available to compute highest rated decades.</p>';
    return;
  }

  decadesList.innerHTML = ranked
    .map((entry) => {
      const covers = entry.books
        .sort((a, b) => (a.publishedYear || 9999) - (b.publishedYear || 9999))
        .slice(0, 20)
        .map((book) => {
          if (book.coverUrl) {
            const safeTitle = escapeHtml(book.title);
            const googleFallback = book.isbn
              ? `https://books.google.com/books/content?vid=ISBN${encodeURIComponent(book.isbn)}&printsec=frontcover&img=1&zoom=1`
              : "";
            const onerrorAttr = googleFallback
              ? `onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';}" data-fallback="${googleFallback}"`
              : `onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';"`;
            return `<div class="cover-card" title="${safeTitle}"><img src="${book.coverUrl}" alt="${safeTitle} cover" loading="lazy" referrerpolicy="no-referrer" ${onerrorAttr} /></div>`;
          }
          return `<div class="cover-card" title="${escapeHtml(book.title)}"><div class="cover-fallback">${escapeHtml(
            book.title
          )}</div></div>`;
        })
        .join("");

      return `
        <article class="decade-row">
          <div class="decade-meta">
            <h3>${entry.decade}s</h3>
            <p>★ Average ${entry.avg.toFixed(2)}</p>
          </div>
          <div class="decade-books">${covers}</div>
        </article>
      `;
    })
    .join("");
};

const goToConfirmStep = (file) => {
  selectedFile = file;
  selectedFileName.textContent = file.name;
  confirmError.textContent = "";
  setVisibleView(confirmView);
};

const handleFile = (file) => {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv")) {
    dropzoneText.textContent = "Please upload a CSV file.";
    return;
  }

  const transfer = new DataTransfer();
  transfer.items.add(file);
  csvInput.files = transfer.files;
  goToConfirmStep(file);
};

csvInput.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  handleFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer?.files || [];
  handleFile(file);
});

changeFileButton.addEventListener("click", () => {
  selectedFile = null;
  csvInput.value = "";
  dropzoneText.textContent = DEFAULT_DROPZONE_TEXT;
  setVisibleView(uploadView);
});

confirmUploadButton.addEventListener("click", async () => {
  if (!selectedFile) {
    confirmError.textContent = "No file selected.";
    return;
  }

  confirmUploadButton.disabled = true;
  confirmUploadButton.textContent = "Loading...";
  confirmError.textContent = "";

  try {
    const csvText = await selectedFile.text();
    const { headers, dataRows } = parseCsv(csvText);
    const source = detectSource(headers);
    if (source === "Unknown") {
      throw new Error("Unsupported format. Please upload StoryGraph or Goodreads CSV export.");
    }

    const stats = buildStats(headers, dataRows, source);

    sourceBadge.textContent = `${source.toUpperCase()} STATS`;
    statBooks.textContent = formatNumber(stats.books);
    statAuthors.textContent = formatNumber(stats.csvAuthorCount);
    statAvgRating.textContent = stats.avgRating === null ? "--" : stats.avgRating.toFixed(2);
    statCountries.textContent = "...";
    statPages.textContent = "...";

    setVisibleView(dashboardView);
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const metadata = await fetchBooksMetadata(stats.booksList);
      // Authors stat is CSV-read-authors count only; keep existing value.
      statCountries.textContent = metadata.countryCount > 0 ? formatNumber(metadata.countryCount) : "--";
      statPages.textContent = metadata.totalPages > 0 ? formatNumber(metadata.totalPages) : "--";
      latestBooksMeta = metadata.booksMeta;
      latestSeriesData = metadata.seriesData || [];
      console.log("[StatReads] Series data for collections:", latestSeriesData);
      setYearTab(currentYearMode);
      renderDecadesSection(metadata.booksMeta);
      setTaxonomyTab(currentTaxonomyMode);
      setThemesTab(currentThemesMode);
      setCollectionsTab(currentCollectionsMode);
      renderMetadataSources(metadata.booksMeta);
    } catch {
      statCountries.textContent = "--";
      statPages.textContent = "--";
      latestBooksMeta = [];
      latestSeriesData = [];
      setYearTab(currentYearMode);
      renderDecadesSection([]);
      setTaxonomyTab(currentTaxonomyMode);
      setThemesTab(currentThemesMode);
      setCollectionsTab(currentCollectionsMode);
      renderMetadataSources([]);
    }
  } catch (error) {
    confirmError.textContent = error.message || "Unable to parse file.";
  } finally {
    confirmUploadButton.disabled = false;
    confirmUploadButton.textContent = "Click here to confirm";
  }
});

booksTab.addEventListener("click", () => setYearTab("books"));
ratingsTab.addEventListener("click", () => setYearTab("ratings"));
taxonomyMostReadTab.addEventListener("click", () => setTaxonomyTab("most-read"));
taxonomyHighestRatedTab.addEventListener("click", () => setTaxonomyTab("highest-rated"));
themesMostReadTab.addEventListener("click", () => setThemesTab("most-read"));
themesHighestRatedTab.addEventListener("click", () => setThemesTab("highest-rated"));
collectionsCompleteTab.addEventListener("click", () => setCollectionsTab("complete"));
collectionsAlmostTab.addEventListener("click", () => setCollectionsTab("almost"));

metadataSourcesWrap.addEventListener("click", (event) => {
  const button = event.target.closest(".override-open-btn");
  if (!button) return;
  const key = button.getAttribute("data-override-key") || "";
  const title = button.getAttribute("data-override-title") || key;
  openOverrideEditor(key, title);
});

overrideEditor.addEventListener("submit", (event) => {
  event.preventDefault();
  const key = overrideBookKey.value.trim();
  if (!key) return;
  const next = {};
  const yearValue = Number(overrideYear.value);
  if (Number.isFinite(yearValue) && yearValue >= 1000 && yearValue <= 2100) next.publishedYear = yearValue;
  const singleCountry = pickSingleCountry([overrideCountries.value.trim()]);
  if (singleCountry.length > 0) next.countries = singleCountry;
  const genres = parseCsvListInput(overrideGenres.value);
  if (genres.length > 0) next.genres = normalizeGenreLabels(genres);
  if (overrideCoverUrl.value.trim()) next.coverUrl = toDirectImageUrl(overrideCoverUrl.value.trim());

  if (Object.keys(next).length === 0) {
    delete runtimeOverrides[key];
  } else {
    runtimeOverrides[key] = next;
  }
  persistOverridesToStorage();
  applyRuntimeOverridesToCurrentBooks();
  rerenderFromCurrentMetadata();
  closeOverrideEditor();
});

clearOverrideBtn.addEventListener("click", () => {
  const key = overrideBookKey.value.trim();
  if (!key) return;
  delete runtimeOverrides[key];
  persistOverridesToStorage();
  rerenderFromCurrentMetadata();
  closeOverrideEditor();
});

cancelOverrideBtn.addEventListener("click", () => {
  closeOverrideEditor();
});

exportOverridesBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(runtimeOverrides, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "metadata-overrides.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});

