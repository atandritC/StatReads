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
const authorsGrid = document.getElementById("authorsGrid");
const authorsMostReadTab = document.getElementById("authorsMostReadTab");
const authorsHighestRatedTab = document.getElementById("authorsHighestRatedTab");
const authorsShowMore = document.getElementById("authorsShowMore");
const mostReadGrid = document.getElementById("mostReadGrid");
const metadataSourcesWrap = document.getElementById("metadataSourcesWrap");
const exportOverridesBtn = document.getElementById("exportOverridesBtn");
const overrideEditor = document.getElementById("overrideEditor");
const overrideEditorTitle = document.getElementById("overrideEditorTitle");
const overrideBookKey = document.getElementById("overrideBookKey");
const overrideYear = document.getElementById("overrideYear");
const overrideCountries = document.getElementById("overrideCountries");
const overrideGenres = document.getElementById("overrideGenres");
const overrideSeriesName = document.getElementById("overrideSeriesName");
const overrideCoverUrl = document.getElementById("overrideCoverUrl");
const saveOverrideBtn = document.getElementById("saveOverrideBtn");
const submitOverrideBtn = document.getElementById("submitOverrideBtn");
const clearOverrideBtn = document.getElementById("clearOverrideBtn");
const cancelOverrideBtn = document.getElementById("cancelOverrideBtn");

let selectedFile = null;
let latestBooksMeta = [];
let currentYearMode = "books";
let currentTaxonomyMode = "most-read";
let currentThemesMode = "most-read";
let currentCollectionsMode = "complete";
let currentAuthorsMode = "most-read";
let latestAuthorRows = [];
let authorsVisible = 10;
let latestSeriesData = [];

// Optional manual metadata overrides (title or ISBN key).
const OVERRIDES_STORAGE_KEY = "statreads_metadata_overrides_v1";
const AUTHOR_OVERRIDES_KEY = "statreads_author_overrides_v1";
const META_CACHE_KEY = "statreads_meta_cache_v4";

const readMetaCache = () => {
  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
};

const writeMetaCache = (cache) => {
  try {
    localStorage.setItem(META_CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage full — silently skip */ }
};

const cacheKeyForBook = (book) => {
  const parts = [book.isbn || "", book.title || "", book.authorHint || ""];
  return parts.join("|").toLowerCase().trim();
};

const CACHEABLE_FIELDS = [
  "authors", "publishedYear", "apiRating", "coverUrl", "genres",
  "countries", "pageCount", "rawSubjects", "seriesName", "seriesNumber", "_sources",
];

const bookToCache = (book) => {
  const entry = {};
  CACHEABLE_FIELDS.forEach((f) => { if (book[f] !== undefined) entry[f] = book[f]; });
  entry._cachedAt = Date.now();
  return entry;
};

const applyCacheToBook = (merged, cached) => {
  CACHEABLE_FIELDS.forEach((f) => {
    if (cached[f] !== undefined) merged[f] = cached[f];
  });
  merged._fromCache = true;
};
let sharedOverrides = {};
let sharedAuthorOverrides = {};
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

const loadSharedOverrides = async () => {
  try {
    const resp = await fetch("./shared-overrides.json");
    if (!resp.ok) return { books: {}, authors: {} };
    const data = await resp.json();
    const authors = data._authors || {};
    const books = { ...data };
    delete books._authors;
    return { books: sanitizeOverridesMap(books), authors };
  } catch {
    return { books: {}, authors: {} };
  }
};

const readOverridesFromStorage = () => {
  try {
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
};

const persistOverridesToStorage = () => {
  try {
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(runtimeOverrides, null, 2));
  } catch {
    // Ignore storage errors.
  }
};

const readAuthorOverrides = () => {
  try {
    const raw = localStorage.getItem(AUTHOR_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch { return {}; }
};

const persistAuthorOverrides = () => {
  try {
    localStorage.setItem(AUTHOR_OVERRIDES_KEY, JSON.stringify(authorOverrides, null, 2));
  } catch { /* storage full */ }
};

let authorOverrides = readAuthorOverrides();

const ALLOWED_COVER_HOSTS = [
  "covers.openlibrary.org",
  "books.google.com",
  "images-na.ssl-images-amazon.com",
  "m.media-amazon.com",
  "images-eu.ssl-images-amazon.com",
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "i.gr-assets.com",
  "s.gr-assets.com",
  "images-na.ssl-images-goodreads.com",
  "images.gr-assets.com",
  "upload.wikimedia.org",
  "cdn.kobo.com",
  "prodimage.images-bn.com",
  "pictures.abebooks.com",
];

const isAllowedCoverUrl = (url) => {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_COVER_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith("." + h));
  } catch {
    return false;
  }
};

const sanitizeText = (value, maxLen = 200) => {
  if (!value || typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, "").trim().slice(0, maxLen);
};

const sanitizeOverride = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const clean = {};
  if (entry.publishedYear) {
    const y = Number(entry.publishedYear);
    if (Number.isFinite(y) && y >= 1000 && y <= 2100) clean.publishedYear = y;
  }
  if (entry.coverUrl) {
    if (isAllowedCoverUrl(entry.coverUrl)) clean.coverUrl = entry.coverUrl;
  }
  if (entry.seriesName) clean.seriesName = sanitizeText(entry.seriesName, 120);
  if (Array.isArray(entry.countries)) {
    clean.countries = entry.countries.map((c) => sanitizeText(c, 80)).filter(Boolean);
  }
  if (Array.isArray(entry.genres)) {
    clean.genres = entry.genres.map((g) => sanitizeText(g, 80)).filter(Boolean);
  }
  return Object.keys(clean).length > 0 ? clean : null;
};

const sanitizeOverridesMap = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const safeKey = sanitizeText(key, 300);
    if (!safeKey) continue;
    const cleaned = sanitizeOverride(value);
    if (cleaned) out[safeKey] = cleaned;
  }
  return out;
};

const keyForBook = (book) => book.isbn || book.title;

const getOverrideForBook = (book) => {
  const local = runtimeOverrides[book.title] || (book.isbn && runtimeOverrides[book.isbn]) || null;
  const shared = sharedOverrides[book.title] || (book.isbn && sharedOverrides[book.isbn]) || null;
  if (!local && !shared) return null;
  if (!shared) return local;
  if (!local) return shared;
  return { ...shared, ...local };
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
      const dateReadRaw = source === "StoryGraph"
        ? getCell(row, idx, "Last Date Read") || getCell(row, idx, "Date Read")
        : getCell(row, idx, "Date Read");
      bookMap.set(title, { title, isbn, publishedYearHint, authorHint, userRatings: [], timesRead: 0, dateRead: dateReadRaw || null });
    }
    if (title && bookMap.has(title)) {
      const entry = bookMap.get(title);
      if (source === "Goodreads") {
        const grTimes = parseNumber(getCell(row, idx, "Number of Times Read"));
        entry.timesRead = Math.max(entry.timesRead, grTimes, 1);
      } else {
        entry.timesRead += 1;
      }
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
      timesRead: book.timesRead || 1,
      dateRead: book.dateRead || null,
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

const fetchBooksMetadata = async (booksList, onProgress) => {
  const metadata = [];
  let completed = 0;
  const total = booksList.length;
  const metaCache = readMetaCache();
  const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

  const processBook = async (book) => {
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

    const cKey = cacheKeyForBook(book);
    const cached = metaCache[cKey];
    if (cached && (Date.now() - (cached._cachedAt || 0)) < CACHE_MAX_AGE) {
      applyCacheToBook(merged, cached);
      metadata.push(merged);
      completed++;
      if (onProgress) onProgress(completed, total, "books");
      return;
    }

    try {
      const fetchJson = async (url) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);
          if (!response.ok) return null;
          return response.json();
        } catch {
          clearTimeout(timeout);
          return null;
        }
      };

      // Fire OpenLibrary + Google Books in parallel.
      const titleUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}${
        book.authorHint ? `&author=${encodeURIComponent(book.authorHint)}` : ""
      }&limit=8&fields=key,title,author_name,author_key,first_publish_year,cover_i,subject,subject_place,place`;
      const googleQuery = book.isbn
        ? `isbn:${book.isbn}`
        : `intitle:${book.title}${book.authorHint ? `+inauthor:${book.authorHint}` : ""}`;
      const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
        googleQuery
      )}&maxResults=3&printType=books`;

      const [titlePayload, googlePayload] = await Promise.all([
        fetchJson(titleUrl),
        fetchJson(googleUrl),
      ]);

      // --- Process OpenLibrary search results (primary source) ---
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
            setSource(merged, "coverUrl", "openlibrary");
          }
          // Work-level details: only fetch if we still need year, genres, cover, or page count.
          const needsWork = !merged.publishedYear || merged.genres.length === 0 || !merged.coverUrl || merged.pageCount === null;
          if (needsWork && typeof bestDoc.key === "string" && bestDoc.key.startsWith("/works/")) {
            const workPayload = await fetchJson(`https://openlibrary.org${bestDoc.key}.json`);
            if (workPayload) {
              const workFirstYear =
                parsePublishedYear(workPayload.first_publish_date) || parsePublishedYear(workPayload.first_publish_year);
              if (workFirstYear) {
                merged.publishedYear = Math.min(merged.publishedYear || workFirstYear, workFirstYear);
                setSource(merged, "publishedYear", "openlibrary");
              }
              const workGenreBefore = merged.genres.length;
              merged.rawSubjects = mergeUnique(merged.rawSubjects, workPayload.subjects || []);
              merged.genres = mergeUnique(merged.genres, extractGenres(workPayload.subjects || []));
              if (merged.genres.length > workGenreBefore && !merged._sources.genres) setSource(merged, "genres", "openlibrary");
              const workCovers = workPayload.covers || [];
              if (!merged.coverUrl && workCovers.length > 0) {
                merged.coverUrl = `https://covers.openlibrary.org/b/id/${workCovers[0]}-L.jpg`;
                setSource(merged, "coverUrl", "openlibrary");
              }

              if ((!merged.coverUrl || merged.pageCount === null)) {
                const editionsPayload = await fetchJson(`https://openlibrary.org${bestDoc.key}/editions.json?limit=8`);
                if (editionsPayload && Array.isArray(editionsPayload.entries)) {
                  const entries = editionsPayload.entries;
                  if (!merged.coverUrl) {
                    const withCover = entries.find((entry) => entry.covers && entry.covers.length > 0);
                    if (withCover) {
                      merged.coverUrl = `https://covers.openlibrary.org/b/id/${withCover.covers[0]}-L.jpg`;
                      setSource(merged, "coverUrl", "openlibrary");
                    }
                  }
                  if (merged.pageCount === null) {
                    const withPages = entries.find((entry) => entry.number_of_pages && entry.number_of_pages > 0);
                    if (withPages) merged.pageCount = withPages.number_of_pages;
                  }
                }
              }
            }
          }

          // Author-level country signal (only if still missing).
          if (merged.countries.length === 0) {
            const docWithAuthor = docs.find((doc) => Array.isArray(doc.author_key) && doc.author_key.length > 0);
            if (docWithAuthor) {
              const authorKey = docWithAuthor.author_key[0];
              const authorPayload = await fetchJson(`https://openlibrary.org/authors/${authorKey}.json`);
              if (authorPayload) merged.countries = mergeUnique(merged.countries, inferCountriesFromAuthorPayload(authorPayload));
            }
          }
        }
      }

      // --- Merge Google Books results (fill gaps left by OpenLibrary) ---
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

      // Last-resort cover fallback: broad Google search.
      if (!merged.coverUrl) {
        const broadGooglePayload = await fetchJson(
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
            `${book.title} ${book.authorHint || ""}`.trim()
          )}&maxResults=5&printType=books`
        );
        if (broadGooglePayload && Array.isArray(broadGooglePayload.items)) {
          const withCover = broadGooglePayload.items.find(
            (entry) => entry?.volumeInfo?.imageLinks?.thumbnail || entry?.volumeInfo?.imageLinks?.smallThumbnail
          );
          if (withCover && withCover.volumeInfo) {
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
            for (const entry of broadGooglePayload.items) {
              const vi = entry?.volumeInfo;
              const sd = detectSeriesFromTitle(vi?.title, vi?.subtitle);
              if (sd) { merged.seriesName = sd.name; merged.seriesNumber = sd.number; break; }
            }
          }
        }
      }
    } catch {
      // Keep merged defaults/fallback values.
    }

    metaCache[cKey] = bookToCache(merged);
    metadata.push(merged);
    completed++;
    if (onProgress) onProgress(completed, total, "books");
  };

  const BATCH_SIZE = 15;
  for (let i = 0; i < booksList.length; i += BATCH_SIZE) {
    const batch = booksList.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map((book) => processBook(book)));
  }
  writeMetaCache(metaCache);

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
  const lookupAuthor = async (authorName) => {
    const authorKey = normalizeTitle(authorName);
    const query = authorName.replace(/\s+/g, " ").trim();
    if (!query) return;

    try {
      const wdCountries = await fetchWikidataAuthorCountries(query, fetchJson);
      if (wdCountries.length > 0) {
        authorCountryMap.set(authorKey, { countries: wdCountries, source: "wikidata" });
        return;
      }
    } catch { /* ignore */ }

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
    } catch { /* ignore */ }
  };

  if (onProgress) onProgress(total, total, "countries");
  for (let i = 0; i < uniqueAuthorCandidates.length; i += BATCH_SIZE) {
    const batch = uniqueAuthorCandidates.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map((name) => lookupAuthor(name)));
  }
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
    if (override.seriesName) {
      book.seriesName = override.seriesName;
      book._manualSeries = true;
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

  // Common-prefix series detection (e.g., Harry Potter).
  // Groups ALL books by author — if some already have an API-detected seriesName,
  // unassigned books sharing the same title prefix get absorbed into that series.
  const authorGroupsAll = new Map();
  metadata.forEach((book) => {
    const authorKey = normalizeTitle(book.authorHint || (book.authors && book.authors[0]) || "");
    if (!authorKey) return;
    if (!authorGroupsAll.has(authorKey)) authorGroupsAll.set(authorKey, []);
    authorGroupsAll.get(authorKey).push(book);
  });
  authorGroupsAll.forEach((books) => {
    const withSeries = books.filter((b) => b.seriesName);
    const withoutSeries = books.filter((b) => !b.seriesName);

    // Try to absorb unassigned books into an existing API-detected series by title prefix.
    if (withSeries.length > 0 && withoutSeries.length > 0) {
      const seriesCounts = new Map();
      withSeries.forEach((b) => {
        const k = normalizeTitle(b.seriesName);
        seriesCounts.set(k, (seriesCounts.get(k) || 0) + 1);
      });
      const dominantKey = [...seriesCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const dominantName = withSeries.find((b) => normalizeTitle(b.seriesName) === dominantKey).seriesName;
      const prefixLower = dominantName.toLowerCase().split(/\s+/);

      withoutSeries.forEach((book) => {
        const titleWords = book.title.toLowerCase().split(/\s+/);
        const matches = prefixLower.every((pw, i) => titleWords[i] === pw);
        if (matches) {
          book.seriesName = dominantName;
          book._prefixSeries = true;
        }
      });
    }

    // Pure prefix detection for author groups with no API-detected series at all.
    if (withSeries.length === 0 && withoutSeries.length >= 3) {
      const titles = withoutSeries.map((b) => b.title.split(/\s+/));
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
        console.log(`[StatReads] Prefix-detected series: "${seriesName}" (${withoutSeries.length} books)`);
        withoutSeries.forEach((book) => { book.seriesName = seriesName; book._prefixSeries = true; });
      }
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
        prefixDetected: true,
      });
    }
    const entry = seriesMap.get(key);
    entry.userBooks.push(book);
    if (!book._prefixSeries) entry.prefixDetected = false;
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

  const seriesEntries = Array.from(seriesMap.entries());
  const processSeriesEntry = async ([key, info]) => {
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
        let matchedBook = null;
        if (entry) {
          const ct = stripThe(entry.cleanTitle);
          const matchIdx = userNormTitles.findIndex((ut) => {
            const utNoThe = stripThe(ut);
            return utNoThe === ct || utNoThe.includes(ct) || ct.includes(utNoThe);
          });
          if (matchIdx !== -1) {
            isRead = true;
            matchedBook = info.userBooks[matchIdx];
          }
        }
        if (!isRead) {
          matchedBook = info.userBooks.find((ub) => ub.seriesNumber === n);
          if (matchedBook) isRead = true;
        }
        if (isRead) readCount++;
        if (matchedBook && !matchedBook.coverUrl && coverUrl) {
          matchedBook.coverUrl = coverUrl;
        }
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
  };
  if (onProgress) onProgress(total, total, "series");
  for (let i = 0; i < seriesEntries.length; i += BATCH_SIZE) {
    const batch = seriesEntries.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map((entry) => processSeriesEntry(entry)));
  }
  seriesData.sort((a, b) => a.name.localeCompare(b.name));

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

  const yearRange = maxYear - minYear;
  const sparseMode = yearRange > 80;
  const yearList = sparseMode ? years : Array.from({ length: yearRange + 1 }, (_, i) => minYear + i);

  const bars = [];
  yearList.forEach((year) => {
    const value = valueByYear.get(year) || 0;
    const heightRatio = value > 0 ? value / positiveMax : 0;
    const barHeight = value > 0 ? Math.max(4, Math.round(130 * heightRatio)) : 0;
    const mix = (year - minYear) / Math.max(1, yearRange);
    const isDark = document.documentElement.getAttribute("data-theme") !== "light";
    if (mode === "ratings") {
      let r, g, b;
      if (isDark) { r = Math.round(230 + mix * 20); g = Math.round(170 + mix * 20); b = Math.round(70 + mix * 20); }
      else { r = Math.round(100 - mix * 15); g = Math.round(60 - mix * 10); b = Math.round(35 + mix * 10); }
      bars.push(
        `<span class="year-bar${value > 0 ? "" : " year-bar-empty"}" data-year="${year}" data-value="${value > 0 ? "Average " + value.toFixed(2) : ""}" data-label="Published in ${year}" style="height:${barHeight}px;background:rgb(${r},${g},${b})"></span>`
      );
    } else {
      let r, g, b;
      if (isDark) { r = Math.round(90 + mix * 20); g = Math.round(200 + mix * 40); b = Math.round(235 + mix * 15); }
      else { r = Math.round(25 + mix * 15); g = Math.round(55 + mix * 25); b = Math.round(85 + mix * 20); }
      const label = value === 1 ? "1 book" : `${value} books`;
      bars.push(
        `<span class="year-bar${value > 0 ? "" : " year-bar-empty"}" data-year="${year}" data-value="${value > 0 ? label : ""}" data-label="Published in ${year}" style="height:${barHeight}px;background:rgb(${r},${g},${b})"></span>`
      );
    }
  });

  yearChart.innerHTML = bars.join("") + '<div class="year-tooltip" id="yearTooltip"></div>';
  yearMin.textContent = String(minYear);
  yearMax.textContent = String(maxYear);

  const tooltip = yearChart.querySelector(".year-tooltip");
  if (tooltip) {
    yearChart.addEventListener("mouseover", (e) => {
      const bar = e.target.closest(".year-bar");
      if (!bar || !bar.dataset.value) { tooltip.style.opacity = "0"; return; }
      tooltip.innerHTML = `<strong>${bar.dataset.value}</strong><span>${bar.dataset.label}</span>`;
      tooltip.style.opacity = "1";
      const rect = bar.getBoundingClientRect();
      const parentRect = yearChart.getBoundingClientRect();
      let left = rect.left - parentRect.left + rect.width / 2 - 70;
      left = Math.max(0, Math.min(left, parentRect.width - 140));
      tooltip.style.left = left + "px";
      tooltip.style.bottom = (parentRect.bottom - rect.top + 8) + "px";
    });
    yearChart.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget || !yearChart.contains(e.relatedTarget)) tooltip.style.opacity = "0";
    });
  }
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

const getPieColors = () => {
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  if (isDark) {
    return [
      "#6ccef0", "#f0b858", "#78f0b0", "#f0d078", "#d098e8",
      "#60e098", "#e8a048", "#58c8e8", "#e8c888", "#90d8f0",
      "#b8e0a8", "#f0c878",
    ];
  }
  return [
    "#2a5570", "#704828", "#3a7898", "#886040", "#584870",
    "#386850", "#805830", "#2e6888", "#a08058", "#1e4858",
    "#486848", "#785028",
  ];
};

const draw2dPie = (canvas, rows) => {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = 300, h = 300;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!rows || rows.length === 0) return;
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return;

  const cc = getChartColors();
  const cx = w / 2, cy = h / 2;
  const r = w * 0.4;

  ctx.save();
  ctx.shadowColor = cc.isDark ? "rgba(0,0,0,0.5)" : "rgba(80,50,30,0.2)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = cc.isDark ? "#1a3050" : "#e8dcd0";
  ctx.fill();
  ctx.restore();

  let angle = -Math.PI / 2;
  rows.forEach((row, i) => {
    const sweep = (row.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = getPieColors()[i % getPieColors().length];
    ctx.fill();
    ctx.strokeStyle = cc.pieSep;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    angle += sweep;
  });

  canvas._pieData = { rows, cx, cy, r };
};

const renderThemeLegend = (container, rows, mode) => {
  if (!container || !rows || rows.length === 0) {
    if (container) container.innerHTML = "";
    return;
  }
  const total = rows.reduce((s, r) => s + r.value, 0);
  container.innerHTML = rows
    .map((row, i) => {
      const color = getPieColors()[i % getPieColors().length];
      const label = mode === "most-read"
        ? `${row.name} (${row.value})`
        : `${row.name} (${row.value.toFixed(1)})`;
      return `<span class="theme-legend-item"><span class="theme-legend-swatch" style="background:${color}"></span>${escapeHtml(label)}</span>`;
    })
    .join("");
};

const getThemeRows = (booksMeta, mode) =>
  buildTaxonomyRows(
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

const renderThemesSection = (booksMeta) => {
  const mostReadCanvas = document.getElementById("themePieMostRead");
  const highestRatedCanvas = document.getElementById("themePieHighestRated");
  const mostReadLegend = document.getElementById("themeLegendMostRead");
  const highestRatedLegend = document.getElementById("themeLegendHighestRated");

  const mostReadRows = getThemeRows(booksMeta, "most-read").slice(0, 10);
  const highestRatedRows = getThemeRows(booksMeta, "highest-rated").slice(0, 10);

  if (mostReadCanvas) draw2dPie(mostReadCanvas, mostReadRows);
  renderThemeLegend(mostReadLegend, mostReadRows, "most-read");
  if (highestRatedCanvas) draw2dPie(highestRatedCanvas, highestRatedRows);
  renderThemeLegend(highestRatedLegend, highestRatedRows, "highest-rated");
};

const setThemesTab = (mode) => {
  currentThemesMode = mode;
  renderThemesSection(latestBooksMeta);
};

const normalizeAuthorKey = (name) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const buildAuthorRows = (booksMeta, mode) => {
  const map = new Map();
  const keyToDisplay = new Map();

  booksMeta.forEach((book) => {
    const rawNames = [book.authorHint, ...(book.authors || [])].map((n) => (n || "").trim()).filter(Boolean);
    // Pick the longest variant per book as the canonical name, merge shorter substrings.
    const deduped = [];
    const seen = new Set();
    const sorted = [...rawNames].sort((a, b) => b.length - a.length);
    sorted.forEach((name) => {
      const key = normalizeAuthorKey(name);
      if (seen.has(key)) return;
      const isSubOf = deduped.some((d) => normalizeAuthorKey(d).includes(key));
      if (isSubOf) return;
      deduped.push(name);
      seen.add(key);
    });

    deduped.forEach((name) => {
      const key = normalizeAuthorKey(name);
      if (!keyToDisplay.has(key) || name.length > keyToDisplay.get(key).length) {
        keyToDisplay.set(key, name);
      }
      if (!map.has(key)) map.set(key, { bookCount: 0, ratingTotal: 0, ratingCount: 0 });
      const entry = map.get(key);
      entry.bookCount++;
      const rating = book.userRating;
      if (typeof rating === "number" && rating > 0) {
        entry.ratingTotal += rating;
        entry.ratingCount++;
      }
    });
  });

  const rows = Array.from(map.entries()).map(([key, e]) => ({
    name: keyToDisplay.get(key) || key,
    bookCount: e.bookCount,
    avgRating: e.ratingCount > 0 ? e.ratingTotal / e.ratingCount : 0,
    ratingCount: e.ratingCount,
  }));
  if (mode === "highest-rated") {
    return rows
      .filter((r) => r.ratingCount >= 1)
      .sort((a, b) => b.avgRating - a.avgRating || a.name.localeCompare(b.name));
  }
  return rows.sort((a, b) => b.bookCount - a.bookCount || a.name.localeCompare(b.name));
};

const authorPhotoCache = new Map();

const fetchAuthorPhoto = async (name) => {
  if (authorPhotoCache.has(name)) return authorPhotoCache.get(name);
  try {
    // Search Wikidata for the author entity.
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&limit=5&format=json&origin=*`;
    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) { authorPhotoCache.set(name, ""); return ""; }
    const searchData = await searchResp.json();
    const results = searchData.search || [];
    if (results.length === 0) { authorPhotoCache.set(name, ""); return ""; }

    // Try each result until we find one with a photo (P18 claim).
    for (const result of results) {
      const entityId = result.id;
      const claimsUrl = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${entityId}&property=P18&format=json&origin=*`;
      const claimsResp = await fetch(claimsUrl);
      if (!claimsResp.ok) continue;
      const claimsData = await claimsResp.json();
      const p18 = (claimsData.claims || {}).P18;
      if (!p18 || p18.length === 0) continue;
      const filename = p18[0].mainsnak?.datavalue?.value;
      if (!filename) continue;
      const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=200`;
      authorPhotoCache.set(name, url);
      return url;
    }
  } catch { /* ignore */ }
  authorPhotoCache.set(name, "");
  return "";
};

const renderAuthorCard = (row, mode) => {
  const safeName = escapeHtml(row.name);
  const stat = mode === "highest-rated"
    ? `avg ${row.avgRating.toFixed(2)}`
    : `${row.bookCount} ${row.bookCount === 1 ? "book" : "books"}`;
  const placeholder = `<div class="author-photo-fallback">&#9787;</div>`;
  return `
    <div class="author-card" data-author="${safeName}">
      <button class="author-override-btn" type="button" title="Override photo">&#x22EE;</button>
      <div class="author-photo">${placeholder}</div>
      <p class="author-name" title="${safeName}">${safeName}</p>
      <p class="author-stat">${stat}</p>
    </div>
  `;
};

const applyAuthorPhotoToCard = (card, url, name) => {
  const photoDiv = card.querySelector(".author-photo");
  if (photoDiv && url) {
    photoDiv.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<div class=\\'author-photo-fallback\\'>&#9787;</div>';" />`;
  }
};

const loadAuthorPhotos = (container) => {
  const cards = container.querySelectorAll(".author-card[data-author]");
  const PHOTO_BATCH = 5;
  let idx = 0;
  const loadNext = async () => {
    const batch = [];
    while (idx < cards.length && batch.length < PHOTO_BATCH) {
      const card = cards[idx++];
      if (card.dataset.photoLoaded) continue;
      const name = card.dataset.author;
      const overrideUrl = authorOverrides[name]?.photoUrl || sharedAuthorOverrides[name]?.photoUrl;
      if (overrideUrl) {
        card.dataset.photoLoaded = "1";
        applyAuthorPhotoToCard(card, overrideUrl, name);
        continue;
      }
      batch.push(card);
    }
    if (batch.length === 0) { if (idx < cards.length) loadNext(); return; }
    await Promise.allSettled(batch.map(async (card) => {
      const name = card.dataset.author;
      const url = await fetchAuthorPhoto(name);
      card.dataset.photoLoaded = "1";
      if (url) applyAuthorPhotoToCard(card, url, name);
    }));
    if (idx < cards.length) loadNext();
  };
  loadNext();
};

const renderAuthorsSection = (booksMeta, mode) => {
  if (!authorsGrid) return;
  if (!booksMeta || booksMeta.length === 0) {
    authorsGrid.innerHTML = '<p class="section-empty">No author data available.</p>';
    if (authorsShowMore) authorsShowMore.style.display = "none";
    return;
  }
  latestAuthorRows = buildAuthorRows(booksMeta, mode);
  authorsVisible = 10;
  renderAuthorsSlice();
};

const renderAuthorsSlice = () => {
  if (!authorsGrid) return;
  const mode = currentAuthorsMode;
  const visible = latestAuthorRows.slice(0, authorsVisible);
  authorsGrid.innerHTML = visible.map((r) => renderAuthorCard(r, mode)).join("");
  loadAuthorPhotos(authorsGrid);
  if (authorsShowMore) {
    authorsShowMore.style.display = authorsVisible < latestAuthorRows.length ? "" : "none";
  }
};

const setAuthorsTab = (mode) => {
  currentAuthorsMode = mode;
  if (authorsMostReadTab) authorsMostReadTab.classList.toggle("is-active", mode === "most-read");
  if (authorsHighestRatedTab) authorsHighestRatedTab.classList.toggle("is-active", mode === "highest-rated");
  renderAuthorsSection(latestBooksMeta, mode);
};

if (authorsMostReadTab) authorsMostReadTab.addEventListener("click", () => setAuthorsTab("most-read"));
if (authorsHighestRatedTab) authorsHighestRatedTab.addEventListener("click", () => setAuthorsTab("highest-rated"));
if (authorsShowMore) authorsShowMore.addEventListener("click", () => {
  authorsVisible += 10;
  renderAuthorsSlice();
});

const renderCollections = (seriesData, mode = "complete") => {
  if (!collectionsGrid) return;
  if (!seriesData || seriesData.length === 0) {
    collectionsGrid.innerHTML = '<p class="section-empty">No series detected.</p>';
    return;
  }

  const filtered = (mode === "complete"
    ? seriesData.filter((s) => s.readCount >= s.totalBooks)
    : seriesData.filter((s) => s.readCount < s.totalBooks && s.totalBooks - s.readCount <= 2)
  ).sort((a, b) => a.name.localeCompare(b.name));

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

const formatTimesRead = (count) => {
  if (count <= 1) return "Once";
  if (count === 2) return "Twice";
  if (count === 3) return "Thrice";
  return `${count} times`;
};

const renderMostRead = (booksMeta) => {
  if (!mostReadGrid) return;
  if (!booksMeta || booksMeta.length === 0) {
    mostReadGrid.innerHTML = '<p class="section-empty">No books available.</p>';
    return;
  }

  const sorted = [...booksMeta].sort((a, b) => {
    const timeDiff = (b.timesRead || 1) - (a.timesRead || 1);
    if (timeDiff !== 0) return timeDiff;
    return (a.publishedYear || 9999) - (b.publishedYear || 9999);
  });

  mostReadGrid.innerHTML = sorted
    .slice(0, 36)
    .map((book) => {
      const safeTitle = escapeHtml(book.title);
      const coverHtml = book.coverUrl
        ? `<img src="${escapeHtml(book.coverUrl)}" alt="${safeTitle}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';" />`
        : `<div class="cover-fallback">${safeTitle}</div>`;
      const times = book.timesRead || 1;
      return `
        <div class="most-read-card">
          <div class="most-read-cover" title="${safeTitle}">${coverHtml}</div>
          <p class="most-read-count">${formatTimesRead(times)}</p>
        </div>
      `;
    })
    .join("");
};

/* ── Theme-aware chart palette helper ─────────────── */
const getChartColors = () => {
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  return {
    isDark,
    axis: isDark ? "rgba(200,220,240,0.3)" : "rgba(100,70,45,0.2)",
    axisLabel: isDark ? "rgba(200,220,240,0.8)" : "rgba(70,50,35,0.7)",
    gridLine: isDark ? "rgba(200,220,240,0.18)" : "rgba(100,70,45,0.14)",
    primary: isDark ? "#6ccef0" : "#2a5570",
    primaryFill: isDark ? "rgba(108,206,240,0.25)" : "rgba(42,85,112,0.15)",
    secondary: isDark ? "#f0b858" : "#704828",
    secondaryFill: isDark ? "rgba(240,184,88,0.2)" : "rgba(112,72,40,0.1)",
    dot: isDark
      ? ["#6ccef0","#78f0b0","#f0b858","#f0d078","#d098e8","#60e098","#e8a048","#58c8e8"]
      : ["#2a5570","#486848","#704828","#886040","#584870","#386850","#805830","#3a7898"],
    radarFill: isDark ? "rgba(108,206,240,0.2)" : "rgba(42,85,112,0.12)",
    radarStroke: isDark ? "rgba(108,206,240,0.8)" : "rgba(42,85,112,0.6)",
    radarDot: isDark ? "#6ccef0" : "#2a5570",
    text: isDark ? "rgba(255,245,235,0.9)" : "rgba(35,25,18,0.85)",
    textDim: isDark ? "rgba(255,245,235,0.6)" : "rgba(35,25,18,0.5)",
    tooltipBg: isDark ? "rgba(10,26,40,0.94)" : "rgba(248,240,232,0.96)",
    tooltipBorder: isDark ? "rgba(200,220,240,0.3)" : "rgba(100,70,45,0.2)",
    pieSep: isDark ? "rgba(10,26,40,0.6)" : "rgba(240,230,218,0.7)",
  };
};

/* ── Reading Pace chart (with line-redraw hover animation) ── */
let _paceAnimFrame = null;
const renderReadingPace = (booksMeta) => {
  const canvas = document.getElementById("readingPaceCanvas");
  if (!canvas) return;
  if (_paceAnimFrame) { cancelAnimationFrame(_paceAnimFrame); _paceAnimFrame = null; }

  const booksWithDate = booksMeta.filter((b) => b.dateRead);
  if (booksWithDate.length === 0) {
    canvas.parentElement.innerHTML = '<p class="section-empty">No date-read data available.</p>';
    return;
  }

  const monthly = new Map();
  const monthlyPages = new Map();
  booksWithDate.forEach((b) => {
    const d = new Date(b.dateRead);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly.set(key, (monthly.get(key) || 0) + 1);
    monthlyPages.set(key, (monthlyPages.get(key) || 0) + (b.pageCount || 0));
  });

  if (monthly.size === 0) {
    canvas.parentElement.innerHTML = '<p class="section-empty">No valid date-read data.</p>';
    return;
  }

  const keys = Array.from(monthly.keys()).sort();
  const first = keys[0], last = keys[keys.length - 1];
  const allMonths = [];
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m++) {
    if (m > 12) { m = 1; y++; }
    allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
  }

  const bookCounts = allMonths.map((k) => monthly.get(k) || 0);
  const pageCounts = allMonths.map((k) => monthlyPages.get(k) || 0);
  const maxBooks = Math.max(...bookCounts, 1);
  const maxPages = Math.max(...pageCounts, 1);

  const dpr = window.devicePixelRatio || 1;
  const W = Math.min(1100, Math.max(600, allMonths.length * 28));
  const H = 260;
  const pad = { top: 20, right: 50, bottom: 40, left: 44 };
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d");
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const xStep = plotW / Math.max(1, allMonths.length - 1);
  const totalLen = allMonths.length;

  let progress = 1;

  const drawFrame = () => {
    const cc = getChartColors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i <= 4; i++) {
      const y = pad.top + plotH - (i / 4) * plotH;
      ctx.strokeStyle = cc.gridLine; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = cc.axisLabel; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
      ctx.fillText(Math.round((maxBooks / 4) * i), pad.left - 6, y + 3);
    }

    ctx.fillStyle = cc.axisLabel; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    const labelEvery = Math.max(1, Math.floor(allMonths.length / 12));
    allMonths.forEach((k, i) => {
      if (i % labelEvery === 0 || i === allMonths.length - 1) {
        ctx.fillText(k.slice(2).replace("-", "/"), pad.left + i * xStep, H - pad.bottom + 16);
      }
    });

    const visibleCount = Math.max(1, Math.ceil(progress * totalLen));

    const drawArea = (values, max, strokeColor, fillColor) => {
      ctx.beginPath();
      for (let i = 0; i < visibleCount && i < values.length; i++) {
        const x = pad.left + i * xStep;
        const y = pad.top + plotH - (values[i] / max) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = strokeColor; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
      const lastI = Math.min(visibleCount - 1, values.length - 1);
      ctx.lineTo(pad.left + lastI * xStep, pad.top + plotH);
      ctx.lineTo(pad.left, pad.top + plotH);
      ctx.closePath();
      ctx.fillStyle = fillColor; ctx.fill();
    };

    drawArea(pageCounts, maxPages, cc.secondary, cc.secondaryFill);
    drawArea(bookCounts, maxBooks, cc.primary, cc.primaryFill);

    const legendY = 10;
    ctx.font = "11px sans-serif";
    [{ label: "Books", color: cc.primary, x: W - pad.right - 120 },
     { label: "Pages", color: cc.secondary, x: W - pad.right - 40 }].forEach((l) => {
      ctx.fillStyle = l.color; ctx.fillRect(l.x, legendY, 10, 10);
      ctx.fillStyle = cc.text; ctx.textAlign = "left"; ctx.fillText(l.label, l.x + 14, legendY + 9);
    });
  };

  let drawing = false;

  const animate = () => {
    progress += 0.008;
    if (progress >= 1) { progress = 1; drawing = false; }
    drawFrame();
    if (drawing) _paceAnimFrame = requestAnimationFrame(animate);
  };

  drawFrame();

  canvas.onmouseenter = () => { progress = 0; drawing = true; if (_paceAnimFrame) cancelAnimationFrame(_paceAnimFrame); drawFrame(); _paceAnimFrame = requestAnimationFrame(animate); };
  canvas.onmouseleave = () => { drawing = false; progress = 1; if (_paceAnimFrame) cancelAnimationFrame(_paceAnimFrame); drawFrame(); };
};

/* ── Scatter plot (dots lift on hover) ──────────── */
let _scatterAnimFrame = null;
const renderScatterPlot = (booksMeta) => {
  const canvas = document.getElementById("scatterCanvas");
  if (!canvas) return;
  if (_scatterAnimFrame) { cancelAnimationFrame(_scatterAnimFrame); _scatterAnimFrame = null; }

  const valid = booksMeta.filter((b) => b.pageCount > 0 && b.userRating > 0);
  if (valid.length === 0) {
    canvas.parentElement.innerHTML = '<p class="section-empty">Not enough data for scatter plot.</p>';
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const W = 700, H = 400;
  const pad = { top: 20, right: 20, bottom: 44, left: 50 };
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d");

  const maxPages = Math.min(Math.max(...valid.map((b) => b.pageCount)), 1500);
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const genreMap = new Map();
  let gIdx = 0;
  valid.forEach((b) => {
    const g = (b.genres && b.genres[0]) || "Unknown";
    if (!genreMap.has(g)) genreMap.set(g, gIdx++);
  });

  const dots = valid.map((b) => {
    const g = (b.genres && b.genres[0]) || "Unknown";
    const ci = genreMap.get(g) || 0;
    const pages = Math.min(b.pageCount, maxPages);
    return {
      baseX: pad.left + (pages / maxPages) * plotW,
      baseY: pad.top + plotH - (b.userRating / 5) * plotH,
      ci,
    };
  });

  let liftT = 0;
  let liftDir = 0;

  const drawFrame = () => {
    const cc = getChartColors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i <= 5; i++) {
      const y = pad.top + plotH - (i / 5) * plotH;
      ctx.strokeStyle = cc.gridLine; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = cc.axisLabel; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
      ctx.fillText(i, pad.left - 8, y + 3);
    }
    for (let p = 0; p <= maxPages; p += 200) {
      const x = pad.left + (p / maxPages) * plotW;
      ctx.strokeStyle = cc.gridLine;
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
      ctx.fillStyle = cc.axisLabel; ctx.textAlign = "center";
      ctx.fillText(p, x, H - pad.bottom + 16);
    }
    ctx.fillStyle = cc.textDim; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Pages", W / 2, H - 4);
    ctx.save(); ctx.translate(12, pad.top + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("Rating", 0, 0); ctx.restore();

    const lift = liftT * 6;
    const scale = 1 + liftT * 0.4;
    dots.forEach((d) => {
      ctx.beginPath();
      ctx.arc(d.baseX, d.baseY - lift, 5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = cc.dot[d.ci % cc.dot.length];
      ctx.globalAlpha = 0.7 + liftT * 0.3;
      ctx.fill();
      if (liftT > 0.01) {
        ctx.shadowColor = cc.dot[d.ci % cc.dot.length];
        ctx.shadowBlur = 6 * liftT;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    });

    const legendGenres = Array.from(genreMap.entries()).slice(0, 8);
    ctx.font = "10px sans-serif";
    legendGenres.forEach(([name, idx], i) => {
      const lx = pad.left + (i % 4) * 160;
      const ly = pad.top + plotH + 28 + Math.floor(i / 4) * 14;
      ctx.fillStyle = cc.dot[idx % cc.dot.length];
      ctx.fillRect(lx, ly - 8, 8, 8);
      ctx.fillStyle = cc.textDim; ctx.textAlign = "left";
      ctx.fillText(name.length > 18 ? name.slice(0, 17) + "…" : name, lx + 12, ly);
    });
  };

  const animate = () => {
    liftT += liftDir * 0.06;
    if (liftT >= 1) { liftT = 1; liftDir = 0; }
    if (liftT <= 0) { liftT = 0; liftDir = 0; }
    drawFrame();
    if (liftDir !== 0) _scatterAnimFrame = requestAnimationFrame(animate);
  };

  drawFrame();

  canvas.onmouseenter = () => { liftDir = 1; if (_scatterAnimFrame) cancelAnimationFrame(_scatterAnimFrame); _scatterAnimFrame = requestAnimationFrame(animate); };
  canvas.onmouseleave = () => { liftDir = -1; if (_scatterAnimFrame) cancelAnimationFrame(_scatterAnimFrame); _scatterAnimFrame = requestAnimationFrame(animate); };
};

/* ── Genre Radar / Spider chart (expand from center on hover) ── */
let _radarAnimFrame = null;
const renderRadarChart = (booksMeta) => {
  const canvas = document.getElementById("radarCanvas");
  if (!canvas) return;
  if (_radarAnimFrame) { cancelAnimationFrame(_radarAnimFrame); _radarAnimFrame = null; }

  const genreStats = new Map();
  booksMeta.forEach((b) => {
    if (!b.genres || b.genres.length === 0) return;
    const g = b.genres[0];
    if (!genreStats.has(g)) genreStats.set(g, { count: 0, ratingSum: 0, ratingN: 0, pageSum: 0, pageN: 0 });
    const s = genreStats.get(g);
    s.count++;
    if (b.userRating > 0) { s.ratingSum += b.userRating; s.ratingN++; }
    if (b.pageCount > 0) { s.pageSum += b.pageCount; s.pageN++; }
  });

  const topGenres = Array.from(genreStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);

  if (topGenres.length < 3) {
    canvas.parentElement.innerHTML = '<p class="section-empty">Not enough genre data for radar chart.</p>';
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const W = 480, H = 480;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d");

  const cxC = W / 2, cyC = H / 2;
  const R = Math.min(W, H) * 0.36;
  const n = topGenres.length;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;
  const maxCount = Math.max(...topGenres.map(([, s]) => s.count));

  const dataVals = topGenres.map(([, stats]) => stats.count / maxCount);

  let expandT = 1;

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const drawFrame = () => {
    const cc = getChartColors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (let ring = 1; ring <= 4; ring++) {
      const r = (ring / 4) * R;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = startAngle + i * angleStep;
        const x = cxC + r * Math.cos(a);
        const y = cyC + r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = cc.gridLine; ctx.lineWidth = 1; ctx.stroke();
    }

    topGenres.forEach(([name], i) => {
      const a = startAngle + i * angleStep;
      const x1 = cxC + R * Math.cos(a);
      const y1 = cyC + R * Math.sin(a);
      ctx.beginPath(); ctx.moveTo(cxC, cyC); ctx.lineTo(x1, y1); ctx.strokeStyle = cc.gridLine; ctx.stroke();
      const lx = cxC + (R + 18) * Math.cos(a);
      const ly = cyC + (R + 18) * Math.sin(a);
      ctx.fillStyle = cc.text; ctx.font = "11px sans-serif";
      ctx.textAlign = Math.abs(a) < 0.1 || Math.abs(a + Math.PI) < 0.1 ? "center" : a > -Math.PI / 2 && a < Math.PI / 2 ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillText(name.length > 14 ? name.slice(0, 13) + "…" : name, lx, ly);
    });

    const ease = easeOutCubic(expandT);

    ctx.beginPath();
    dataVals.forEach((val, i) => {
      const scaledVal = val * ease;
      const a = startAngle + i * angleStep;
      const x = cxC + scaledVal * R * Math.cos(a);
      const y = cyC + scaledVal * R * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = cc.radarFill; ctx.fill();
    ctx.strokeStyle = cc.radarStroke; ctx.lineWidth = 2; ctx.stroke();

    dataVals.forEach((val, i) => {
      const scaledVal = val * ease;
      const a = startAngle + i * angleStep;
      const x = cxC + scaledVal * R * Math.cos(a);
      const y = cyC + scaledVal * R * Math.sin(a);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = cc.radarDot; ctx.fill();
    });
  };

  let expanding = false;

  const animate = () => {
    expandT += 0.012;
    if (expandT >= 1) { expandT = 1; expanding = false; }
    drawFrame();
    if (expanding) _radarAnimFrame = requestAnimationFrame(animate);
  };

  drawFrame();

  canvas.onmouseenter = () => { expandT = 0; expanding = true; if (_radarAnimFrame) cancelAnimationFrame(_radarAnimFrame); drawFrame(); _radarAnimFrame = requestAnimationFrame(animate); };
  canvas.onmouseleave = () => { expanding = false; expandT = 1; if (_radarAnimFrame) cancelAnimationFrame(_radarAnimFrame); drawFrame(); };
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
  overrideSeriesName.value = existing.seriesName || "";
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
    if (override.seriesName) {
      book.seriesName = override.seriesName;
      book._manualSeries = true;
    }
  });
};

const buildManualSeriesEntries = () => {
  const manualGroups = new Map();
  latestBooksMeta.forEach((book) => {
    if (!book._manualSeries || !book.seriesName) return;
    const key = normalizeTitle(book.seriesName);
    if (!manualGroups.has(key)) manualGroups.set(key, { name: book.seriesName, books: [] });
    manualGroups.get(key).books.push(book);
  });
  const entries = [];
  manualGroups.forEach(({ name, books }) => {
    if (books.length < 1) return;
    entries.push({
      name,
      totalBooks: books.length,
      readCount: books.length,
      covers: books.map((b) => ({ url: b.coverUrl || "", read: true })),
      _manual: true,
    });
  });
  return entries;
};

const rerenderFromCurrentMetadata = () => {
  const manualEntries = buildManualSeriesEntries();
  const existingApiNames = new Set(latestSeriesData.filter((s) => !s._manual).map((s) => normalizeTitle(s.name)));
  latestSeriesData = [
    ...latestSeriesData.filter((s) => !s._manual),
    ...manualEntries.filter((s) => !existingApiNames.has(normalizeTitle(s.name))),
  ].sort((a, b) => a.name.localeCompare(b.name));
  setYearTab(currentYearMode);
  renderDecadesSection(latestBooksMeta);
  setTaxonomyTab(currentTaxonomyMode);
  setThemesTab(currentThemesMode);
  setAuthorsTab(currentAuthorsMode);
  setCollectionsTab(currentCollectionsMode);
  renderMostRead(latestBooksMeta);
  renderMetadataSources(latestBooksMeta);
};

runtimeOverrides = readOverridesFromStorage();
loadSharedOverrides().then((data) => { sharedOverrides = data.books; sharedAuthorOverrides = data.authors; });

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

let _justDropped = false;
dropzone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer?.files || [];
  _justDropped = true;
  setTimeout(() => { _justDropped = false; }, 400);
  handleFile(file);
});

dropzone.addEventListener("click", () => {
  if (_justDropped) return;
  csvInput.click();
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

    const loadingWrap = document.getElementById("loadingWrap");
    const loadingBarFill = document.getElementById("loadingBarFill");
    const loadingText = document.getElementById("loadingText");
    if (loadingWrap) loadingWrap.style.display = "";

    const updateProgress = (done, total, phase) => {
      if (!loadingBarFill || !loadingText) return;
      if (phase === "books") {
        const pct = Math.round((done / total) * 80);
        loadingBarFill.style.width = pct + "%";
        loadingText.textContent = `Fetching book metadata… ${done}/${total}`;
      } else if (phase === "countries") {
        loadingBarFill.style.width = "85%";
        loadingText.textContent = "Resolving author countries…";
      } else if (phase === "series") {
        loadingBarFill.style.width = "92%";
        loadingText.textContent = "Enriching series data…";
      }
    };

    try {
      const metadata = await fetchBooksMetadata(stats.booksList, updateProgress);
      if (loadingBarFill) loadingBarFill.style.width = "100%";
      if (loadingText) loadingText.textContent = "Done!";
      setTimeout(() => { if (loadingWrap) loadingWrap.style.display = "none"; }, 800);
      statCountries.textContent = metadata.countryCount > 0 ? formatNumber(metadata.countryCount) : "--";
      statPages.textContent = metadata.totalPages > 0 ? formatNumber(metadata.totalPages) : "--";
      latestBooksMeta = metadata.booksMeta;
      latestSeriesData = metadata.seriesData || [];
      console.log("[StatReads] Series data for collections:", latestSeriesData);
      setYearTab(currentYearMode);
      renderDecadesSection(metadata.booksMeta);
      setTaxonomyTab(currentTaxonomyMode);
      setThemesTab(currentThemesMode);
      setAuthorsTab(currentAuthorsMode);
      setCollectionsTab(currentCollectionsMode);
      renderMostRead(metadata.booksMeta);
      renderReadingPace(metadata.booksMeta);
      renderScatterPlot(metadata.booksMeta);
      renderRadarChart(metadata.booksMeta);
      renderMetadataSources(metadata.booksMeta);
    } catch {
      if (loadingWrap) loadingWrap.style.display = "none";
      statCountries.textContent = "--";
      statPages.textContent = "--";
      latestBooksMeta = [];
      latestSeriesData = [];
      setYearTab(currentYearMode);
      renderDecadesSection([]);
      setTaxonomyTab(currentTaxonomyMode);
      setThemesTab(currentThemesMode);
      setAuthorsTab(currentAuthorsMode);
      setCollectionsTab(currentCollectionsMode);
      renderMostRead([]);
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
if (themesMostReadTab) themesMostReadTab.addEventListener("click", () => setThemesTab("most-read"));
if (themesHighestRatedTab) themesHighestRatedTab.addEventListener("click", () => setThemesTab("highest-rated"));
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

  const rawCoverUrl = overrideCoverUrl.value.trim();
  if (rawCoverUrl && !isAllowedCoverUrl(toDirectImageUrl(rawCoverUrl))) {
    alert(
      "Cover URL must be HTTPS from a known book cover source:\n" +
      ALLOWED_COVER_HOSTS.join(", ")
    );
    overrideCoverUrl.focus();
    return;
  }

  const next = {};
  const yearValue = Number(overrideYear.value);
  if (Number.isFinite(yearValue) && yearValue >= 1000 && yearValue <= 2100) next.publishedYear = yearValue;
  const singleCountry = pickSingleCountry([overrideCountries.value.trim()]);
  if (singleCountry.length > 0) next.countries = singleCountry;
  const genres = parseCsvListInput(overrideGenres.value);
  if (genres.length > 0) next.genres = normalizeGenreLabels(genres);
  if (overrideSeriesName.value.trim()) next.seriesName = sanitizeText(overrideSeriesName.value, 120);
  if (rawCoverUrl) next.coverUrl = toDirectImageUrl(rawCoverUrl);

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

const GITHUB_REPO = "atandritC/StatReads";

submitOverrideBtn.addEventListener("click", () => {
  const key = overrideBookKey.value.trim();
  if (!key) return;
  const entry = runtimeOverrides[key];
  if (!entry || Object.keys(entry).length === 0) {
    alert("Save the override first, then submit.");
    return;
  }
  const json = JSON.stringify({ [key]: entry }, null, 2);
  const title = encodeURIComponent(`[Override] ${key}`);
  const body = encodeURIComponent(
    `### Book\n**${key}**\n\n### Override JSON\n\`\`\`json\n${json}\n\`\`\`\n\n### Why\n_Briefly describe what was wrong or missing._`
  );
  window.open(
    `https://github.com/${GITHUB_REPO}/issues/new?title=${title}&body=${body}&labels=override`,
    "_blank"
  );
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

// Author photo override popup wiring.
const authorPhotoOverlay = document.getElementById("authorPhotoOverlay");
const authorPopupTitle = document.getElementById("authorPopupTitle");
const authorPopupKey = document.getElementById("authorPopupKey");
const authorPopupUrl = document.getElementById("authorPopupUrl");
const authorPopupSave = document.getElementById("authorPopupSave");
const authorPopupSubmit = document.getElementById("authorPopupSubmit");
const authorPopupClear = document.getElementById("authorPopupClear");
const authorPopupCancel = document.getElementById("authorPopupCancel");

const openAuthorPopup = (authorName) => {
  if (!authorPhotoOverlay) return;
  authorPopupKey.value = authorName;
  authorPopupTitle.textContent = authorName;
  const existing = authorOverrides[authorName];
  authorPopupUrl.value = existing?.photoUrl || "";
  authorPhotoOverlay.style.display = "";
  authorPopupUrl.focus();
};

const closeAuthorPopup = () => {
  if (authorPhotoOverlay) authorPhotoOverlay.style.display = "none";
};

if (authorsGrid) {
  authorsGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".author-override-btn");
    if (!btn) return;
    const card = btn.closest(".author-card");
    if (!card) return;
    openAuthorPopup(card.dataset.author);
  });
}

if (authorPopupSave) {
  authorPopupSave.addEventListener("click", () => {
    const name = authorPopupKey.value;
    if (!name) return;
    const rawUrl = authorPopupUrl.value.trim();
    if (rawUrl && !isAllowedCoverUrl(rawUrl)) {
      alert("Photo URL must be HTTPS from a known host:\n" + ALLOWED_COVER_HOSTS.join(", "));
      authorPopupUrl.focus();
      return;
    }
    if (rawUrl) {
      authorOverrides[name] = { photoUrl: rawUrl };
    } else {
      delete authorOverrides[name];
    }
    persistAuthorOverrides();
    authorPhotoCache.delete(name);
    // Refresh the card photo in-place.
    const card = authorsGrid?.querySelector(`.author-card[data-author="${CSS.escape(name)}"]`);
    if (card) {
      card.dataset.photoLoaded = "";
      const photoDiv = card.querySelector(".author-photo");
      if (rawUrl) {
        card.dataset.photoLoaded = "1";
        applyAuthorPhotoToCard(card, rawUrl, name);
      } else if (photoDiv) {
        photoDiv.innerHTML = `<div class="author-photo-fallback">&#9787;</div>`;
        loadAuthorPhotos(authorsGrid);
      }
    }
    closeAuthorPopup();
  });
}

if (authorPopupSubmit) {
  authorPopupSubmit.addEventListener("click", () => {
    const name = authorPopupKey.value;
    if (!name) return;
    const entry = authorOverrides[name];
    if (!entry || !entry.photoUrl) {
      alert("Save the author photo override first, then submit.");
      return;
    }
    const json = JSON.stringify({ [name]: entry }, null, 2);
    const title = encodeURIComponent(`[Author Override] ${name}`);
    const body = encodeURIComponent(
      `### Author\n**${name}**\n\n### Override JSON\n\`\`\`json\n${json}\n\`\`\`\n\n### Why\n_Briefly describe what was wrong or missing._`
    );
    window.open(
      `https://github.com/${GITHUB_REPO}/issues/new?title=${title}&body=${body}&labels=override`,
      "_blank"
    );
  });
}

if (authorPopupClear) {
  authorPopupClear.addEventListener("click", () => {
    const name = authorPopupKey.value;
    if (!name) return;
    delete authorOverrides[name];
    persistAuthorOverrides();
    authorPhotoCache.delete(name);
    const card = authorsGrid?.querySelector(`.author-card[data-author="${CSS.escape(name)}"]`);
    if (card) {
      card.dataset.photoLoaded = "";
      const photoDiv = card.querySelector(".author-photo");
      if (photoDiv) photoDiv.innerHTML = `<div class="author-photo-fallback">&#9787;</div>`;
      loadAuthorPhotos(authorsGrid);
    }
    closeAuthorPopup();
  });
}

if (authorPopupCancel) {
  authorPopupCancel.addEventListener("click", closeAuthorPopup);
}

if (authorPhotoOverlay) {
  authorPhotoOverlay.addEventListener("click", (e) => {
    if (e.target === authorPhotoOverlay) closeAuthorPopup();
  });
}

/* ── Re-render all charts on theme change ─────────── */
function refreshChartsForTheme() {
  if (typeof drawHeroBars === "function") drawHeroBars();
  if (!latestBooksMeta || latestBooksMeta.length === 0) return;
  setYearTab(currentYearMode);
  setTaxonomyTab(currentTaxonomyMode);
  setThemesTab(currentThemesMode);
  renderReadingPace(latestBooksMeta);
  renderScatterPlot(latestBooksMeta);
  renderRadarChart(latestBooksMeta);
}

/* ── Theme toggle ──────────────────────────────────── */
(function initTheme() {
  const THEME_KEY = "statreads_theme";
  const btn = document.getElementById("globalThemeToggle");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  const apply = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    const moonSvg = '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>';
    const sunSvg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    if (btn) btn.innerHTML = theme === "dark" ? moonSvg : sunSvg;
  };

  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") {
    apply(saved);
  } else {
    apply(prefersDark.matches ? "dark" : "light");
  }

  if (btn) {
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || (prefersDark.matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      btn.classList.add("is-switching");
      setTimeout(() => btn.classList.remove("is-switching"), 300);
      apply(next);
      refreshChartsForTheme();
    });
  }

  prefersDark.addEventListener("change", (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      apply(e.matches ? "dark" : "light");
      refreshChartsForTheme();
    }
  });
})();

/* ── Hero wave graphs ─────────────────────────────── */
const HERO_W = 300, HERO_H = 180;
let heroAnimFrame = null;
let heroAnimT = 0;
let heroAnimating = false;

const heroWaves = { left: [], right: [] };

function getWaveStyles() {
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  if (isDark) {
    return [
      { stroke: "rgba(255,241,231,0.30)", fill: "rgba(255,241,231,0.04)", width: 1.8 },
      { stroke: "rgba(255,241,231,0.22)", fill: "rgba(255,241,231,0.03)", width: 1.5 },
      { stroke: "rgba(255,241,231,0.18)", fill: "rgba(255,241,231,0.025)",width: 1.5 },
      { stroke: "rgba(255,241,231,0.14)", fill: "rgba(255,241,231,0.02)", width: 1.2 },
      { stroke: "rgba(255,241,231,0.10)", fill: "rgba(255,241,231,0.015)",width: 1.0 },
    ];
  }
  return [
    { stroke: "rgba(50,96,128,0.22)",  fill: "rgba(50,96,128,0.03)",  width: 1.8 },
    { stroke: "rgba(128,82,50,0.18)",  fill: "rgba(128,82,50,0.025)", width: 1.5 },
    { stroke: "rgba(50,96,128,0.15)",  fill: "rgba(50,96,128,0.02)",  width: 1.5 },
    { stroke: "rgba(128,82,50,0.12)",  fill: "rgba(128,82,50,0.015)", width: 1.2 },
    { stroke: "rgba(50,96,128,0.09)",  fill: "rgba(50,96,128,0.01)",  width: 1.0 },
  ];
}

function initHeroWaves() {
  ["left", "right"].forEach((side) => {
    heroWaves[side] = [];
    for (let l = 0; l < 5; l++) {
      const centerY = HERO_H * (0.25 + l * 0.12) + (Math.random() - 0.5) * 20;
      heroWaves[side].push({
        centerY,
        amp: 12 + Math.random() * 22,
        freq: 1.2 + Math.random() * 1.0,
        phase: Math.random() * Math.PI * 2,
        drift: 0.4 + Math.random() * 0.8,
      });
    }
  });
}

function buildWavePath(ctx, wave, t) {
  const steps = 60;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const norm = i / steps;
    const x = norm * HERO_W;
    const animOff = heroAnimating ? Math.sin(t * wave.drift + norm * 3) * 6 : 0;
    const y = wave.centerY
      + Math.sin(norm * Math.PI * wave.freq + wave.phase + t * wave.drift) * wave.amp
      + animOff;
    pts.push({ x, y: Math.max(4, Math.min(HERO_H - 4, y)) });
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const cpx = (prev.x + cur.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, cur.y, cur.x, cur.y);
  }
  return pts;
}

function drawHeroBars() {
  const styles = getWaveStyles();

  ["Left", "Right"].forEach((side) => {
    const canvas = document.getElementById("heroLine" + side);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = HERO_W * dpr;
    canvas.height = HERO_H * dpr;
    canvas.style.width = HERO_W + "px";
    canvas.style.height = HERO_H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, HERO_W, HERO_H);

    const waves = heroWaves[side.toLowerCase()];
    waves.forEach((wave, i) => {
      const s = styles[i % styles.length];

      buildWavePath(ctx, wave, heroAnimT);

      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      ctx.lineTo(HERO_W, HERO_H);
      ctx.lineTo(0, HERO_H);
      ctx.closePath();
      ctx.fillStyle = s.fill;
      ctx.fill();
    });

    const outerFade = HERO_W * 0.3;
    const innerFade = HERO_W * 0.2;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    if (side === "Left") {
      const gOuter = ctx.createLinearGradient(0, 0, outerFade, 0);
      gOuter.addColorStop(0, "rgba(0,0,0,1)");
      gOuter.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gOuter;
      ctx.fillRect(0, 0, outerFade, HERO_H);

      const gInner = ctx.createLinearGradient(HERO_W - innerFade, 0, HERO_W, 0);
      gInner.addColorStop(0, "rgba(0,0,0,0)");
      gInner.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = gInner;
      ctx.fillRect(HERO_W - innerFade, 0, innerFade, HERO_H);
    } else {
      const gOuter = ctx.createLinearGradient(HERO_W - outerFade, 0, HERO_W, 0);
      gOuter.addColorStop(0, "rgba(0,0,0,0)");
      gOuter.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = gOuter;
      ctx.fillRect(HERO_W - outerFade, 0, outerFade, HERO_H);

      const gInner = ctx.createLinearGradient(0, 0, innerFade, 0);
      gInner.addColorStop(0, "rgba(0,0,0,1)");
      gInner.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gInner;
      ctx.fillRect(0, 0, innerFade, HERO_H);
    }
    ctx.restore();
  });
}

function heroAnimLoop() {
  heroAnimT += 0.02;
  drawHeroBars();
  if (heroAnimating) {
    heroAnimFrame = requestAnimationFrame(heroAnimLoop);
  }
}

initHeroWaves();
drawHeroBars();

const heroEl = document.querySelector(".dashboard-hero");
if (heroEl) {
  heroEl.addEventListener("mouseenter", () => {
    heroAnimating = true;
    if (!heroAnimFrame) heroAnimLoop();
  });
  heroEl.addEventListener("mouseleave", () => {
    heroAnimating = false;
    if (heroAnimFrame) {
      cancelAnimationFrame(heroAnimFrame);
      heroAnimFrame = null;
    }
    heroAnimT = 0;
    drawHeroBars();
  });
}

