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
const decadesReadList = document.getElementById("decadesReadList");
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
const overrideSeriesTotalBooks = document.getElementById("overrideSeriesTotalBooks");
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
  if (entry.seriesTotalBooks) {
    const tb = Number(entry.seriesTotalBooks);
    if (Number.isFinite(tb) && tb >= 2 && tb <= 200) clean.seriesTotalBooks = tb;
  }
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

const keyForBook = (book) => book.title || book.isbn;

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
    if (override.seriesTotalBooks && Number(override.seriesTotalBooks) >= 2) {
      book._seriesTotalBooks = Number(override.seriesTotalBooks);
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
    if (book.seriesName.length > entry.name.length || (book.seriesName.length === entry.name.length && book.seriesName < entry.name)) {
      entry.name = book.seriesName;
    }
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
        const sorted = [...info.userBooks].sort((a, b) => {
          const ya = a.publishedYear || 9999;
          const yb = b.publishedYear || 9999;
          if (ya !== yb) return ya - yb;
          const na = a.seriesNumber || 9999;
          const nb = b.seriesNumber || 9999;
          return na - nb;
        });
        const covers = sorted.map((book) => ({
          url: book.coverUrl || "",
          isbn: book.isbn || "",
          read: true,
        }));
        if (sorted.length < 3) return;
        seriesData.push({
          name: info.name,
          totalBooks: sorted.length,
          readCount: sorted.length,
          covers,
          books: sorted,
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
        covers.push({ url: coverUrl, isbn: matchedBook?.isbn || "", read: isRead });
      }

      seriesData.push({
        name: info.name,
        totalBooks,
        readCount,
        covers,
        books: info.userBooks,
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

const showCollectionPopup = (series) => {
  const overlay = document.getElementById("collectionPopupOverlay");
  if (!overlay) return;
  const titleEl = document.getElementById("collectionPopupTitle");
  const listEl = document.getElementById("collectionPopupList");
  if (titleEl) titleEl.textContent = `${series.name} — ${series.readCount} of ${series.totalBooks} book${series.totalBooks !== 1 ? "s" : ""}`;
  if (listEl) {
    listEl.scrollTop = 0;
    listEl.innerHTML = (series.books || []).map((b) => {
      const gFb = b.isbn ? `https://books.google.com/books/content?vid=ISBN${encodeURIComponent(b.isbn)}&printsec=frontcover&img=1&zoom=1` : "";
      let cover;
      if (b.coverUrl) {
        const oe = gFb
          ? `onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='');}" data-fallback="${gFb}"`
          : `onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='');"`;
        cover = `<img src="${b.coverUrl}" alt="" class="wm-popup-cover" loading="lazy" referrerpolicy="no-referrer" ${oe} /><div class="wm-popup-cover wm-popup-cover-empty" style="display:none"></div>`;
      } else if (gFb) {
        cover = `<img src="${gFb}" alt="" class="wm-popup-cover" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='');" /><div class="wm-popup-cover wm-popup-cover-empty" style="display:none"></div>`;
      } else {
        cover = `<div class="wm-popup-cover wm-popup-cover-empty"></div>`;
      }
      const author = (b.authors && b.authors[0]) || b.authorHint || "";
      const year = b.publishedYear || "";
      const rating = b.userRating > 0 ? `${"★".repeat(Math.round(b.userRating))}${"☆".repeat(5 - Math.round(b.userRating))}` : "";
      return `<div class="wm-popup-book">${cover}<div class="wm-popup-info"><div class="wm-popup-book-title">${escapeHtml(b.title || "Untitled")}</div><div class="wm-popup-book-author">${escapeHtml(author)}${year ? ` (${year})` : ""}</div>${rating ? `<div class="wm-popup-book-rating">${rating}</div>` : ""}</div></div>`;
    }).join("");
  }
  overlay.style.display = "";
};

(() => {
  const overlay = document.getElementById("collectionPopupOverlay");
  const closeBtn = document.getElementById("collectionPopupClose");
  if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.style.display = "none"; });
  if (closeBtn) closeBtn.addEventListener("click", () => { if (overlay) overlay.style.display = "none"; });
})();

const buildCoverImg = (c) => {
  const opacity = c.read ? "1" : "0.35";
  const src = c.url || "";
  const gFb = c.isbn ? `https://books.google.com/books/content?vid=ISBN${encodeURIComponent(c.isbn)}&printsec=frontcover&img=1&zoom=1` : "";
  if (src) {
    const oe = gFb
      ? `onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='');}" data-fallback="${gFb}"`
      : `onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='');"`;
    return `<img src="${escapeHtml(src)}" alt="" class="collection-cover" style="opacity:${opacity}" loading="lazy" referrerpolicy="no-referrer" ${oe} /><div class="collection-cover collection-cover-placeholder" style="opacity:${opacity};display:none"></div>`;
  }
  if (gFb) {
    return `<img src="${gFb}" alt="" class="collection-cover" style="opacity:${opacity}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='');" /><div class="collection-cover collection-cover-placeholder" style="opacity:${opacity};display:none"></div>`;
  }
  return `<div class="collection-cover collection-cover-placeholder" style="opacity:${opacity}"></div>`;
};

let _collectionSeriesMap = [];

const renderCollections = (seriesData, mode = "complete") => {
  if (!collectionsGrid) return;
  if (!seriesData || seriesData.length === 0) {
    collectionsGrid.innerHTML = '<p class="section-empty">No series detected.</p>';
    _collectionSeriesMap = [];
    return;
  }

  const filtered = (mode === "complete"
    ? seriesData.filter((s) => s.readCount >= s.totalBooks)
    : seriesData.filter((s) => s.readCount < s.totalBooks && s.totalBooks - s.readCount <= 2)
  ).sort((a, b) => a.name.localeCompare(b.name));

  if (filtered.length === 0) {
    const msg = mode === "complete" ? "No completed series yet." : "No almost-complete series.";
    collectionsGrid.innerHTML = `<p class="section-empty">${msg}</p>`;
    _collectionSeriesMap = [];
    return;
  }

  _collectionSeriesMap = filtered;

  collectionsGrid.innerHTML = filtered
    .map((series, si) => {
      const covers = series.covers;
      const count = covers.length;
      const stackHtml = covers.map((c, i) => {
        const offset = i * 6;
        const zIndex = count - i;
        const inner = buildCoverImg(c);
        return `<div style="position:absolute;bottom:0;left:${offset}px;z-index:${zIndex};" class="collection-cover-slot" data-idx="${i}">${inner}</div>`;
      }).join("");
      const stackW = 54 + (count - 1) * 6 + 6;
      const countLabel = mode === "complete"
        ? `${series.readCount} read`
        : `${series.readCount} of ${series.totalBooks} read`;
      return `
        <div class="collection-card" data-series-idx="${si}">
          <div class="collection-stack" style="width:${stackW}px;" title="Click to see all books">
            ${stackHtml}
          </div>
          <p class="collection-name">${escapeHtml(series.name)}</p>
          <p class="collection-count">${escapeHtml(countLabel)}</p>
        </div>
      `;
    })
    .join("");
};

if (collectionsGrid) {
  collectionsGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".collection-card");
    if (!card) return;
    const idx = Number(card.dataset.seriesIdx);
    const series = _collectionSeriesMap[idx];
    if (series) showCollectionPopup(series);
  });

  collectionsGrid.addEventListener("mouseenter", (e) => {
    const stack = e.target.closest(".collection-stack");
    if (!stack) return;
    const slots = stack.querySelectorAll(".collection-cover-slot");
    const expandGap = 28;
    slots.forEach((slot) => {
      const i = Number(slot.dataset.idx);
      slot.style.left = (i * expandGap) + "px";
      slot.style.transform = "translateY(-4px)";
    });
    stack.style.width = (54 + (slots.length - 1) * expandGap + 6) + "px";
  }, true);

  collectionsGrid.addEventListener("mouseleave", (e) => {
    const stack = e.target.closest(".collection-stack");
    if (!stack) return;
    const slots = stack.querySelectorAll(".collection-cover-slot");
    const collapseGap = 6;
    slots.forEach((slot) => {
      const i = Number(slot.dataset.idx);
      slot.style.left = (i * collapseGap) + "px";
      slot.style.transform = "";
    });
    stack.style.width = (54 + (slots.length - 1) * collapseGap + 6) + "px";
  }, true);
}

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
      const googleFallback = book.isbn
        ? `https://books.google.com/books/content?vid=ISBN${encodeURIComponent(book.isbn)}&printsec=frontcover&img=1&zoom=1`
        : "";
      let coverHtml;
      if (book.coverUrl) {
        const onerrorAttr = googleFallback
          ? `onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';}" data-fallback="${googleFallback}"`
          : `onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';"`;
        coverHtml = `<img src="${escapeHtml(book.coverUrl)}" alt="${safeTitle}" loading="lazy" referrerpolicy="no-referrer" ${onerrorAttr} />`;
      } else if (googleFallback) {
        coverHtml = `<img src="${googleFallback}" alt="${safeTitle}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';" />`;
      } else {
        coverHtml = `<div class="cover-fallback">${safeTitle}</div>`;
      }
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

/* ── Reading Pace chart — Pages per Day per month ── */
let _paceAnimFrame = null;
const renderReadingPace = (booksMeta) => {
  const canvas = document.getElementById("readingPaceCanvas");
  if (!canvas) return;
  if (_paceAnimFrame) { cancelAnimationFrame(_paceAnimFrame); _paceAnimFrame = null; }

  const booksWithDate = booksMeta.filter((b) => b.dateRead && b.pageCount > 0);
  if (booksWithDate.length === 0) {
    canvas.parentElement.innerHTML = '<p class="section-empty">No date-read / page data available.</p>';
    return;
  }

  const monthlyPages = new Map();
  booksWithDate.forEach((b) => {
    const d = new Date(b.dateRead);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyPages.set(key, (monthlyPages.get(key) || 0) + (b.pageCount || 0));
  });

  if (monthlyPages.size === 0) {
    canvas.parentElement.innerHTML = '<p class="section-empty">No valid date-read data.</p>';
    return;
  }

  const daysInMonth = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  };

  const keys = Array.from(monthlyPages.keys()).sort();
  const first = keys[0], last = keys[keys.length - 1];
  const allMonths = [];
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m++) {
    if (m > 12) { m = 1; y++; }
    allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
  }

  const ppd = allMonths.map((k) => {
    const pages = monthlyPages.get(k) || 0;
    return pages > 0 ? Math.round((pages / daysInMonth(k)) * 10) / 10 : 0;
  });
  const maxPpd = Math.max(...ppd, 1);

  const dpr = window.devicePixelRatio || 1;
  const W = Math.min(1100, Math.max(600, allMonths.length * 28));
  const H = 260;
  const pad = { top: 24, right: 20, bottom: 40, left: 50 };
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

    const gridSteps = 5;
    const niceMax = Math.ceil(maxPpd / gridSteps) * gridSteps;
    for (let i = 0; i <= gridSteps; i++) {
      const y = pad.top + plotH - (i / gridSteps) * plotH;
      ctx.strokeStyle = cc.gridLine; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = cc.axisLabel; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
      ctx.fillText(Math.round((niceMax / gridSteps) * i), pad.left - 6, y + 3);
    }

    ctx.fillStyle = cc.axisLabel; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    const labelEvery = Math.max(1, Math.floor(allMonths.length / 12));
    allMonths.forEach((k, i) => {
      if (i % labelEvery === 0 || i === allMonths.length - 1) {
        ctx.fillText(k.slice(2).replace("-", "/"), pad.left + i * xStep, H - pad.bottom + 16);
      }
    });

    const visibleCount = Math.max(1, Math.ceil(progress * totalLen));

    // Fill area
    ctx.beginPath();
    for (let i = 0; i < visibleCount && i < ppd.length; i++) {
      const x = pad.left + i * xStep;
      const y = pad.top + plotH - (ppd[i] / niceMax) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const lastI = Math.min(visibleCount - 1, ppd.length - 1);
    ctx.lineTo(pad.left + lastI * xStep, pad.top + plotH);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = cc.primaryFill; ctx.fill();

    // Stroke line
    ctx.beginPath();
    for (let i = 0; i < visibleCount && i < ppd.length; i++) {
      const x = pad.left + i * xStep;
      const y = pad.top + plotH - (ppd[i] / niceMax) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = cc.primary; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();

    // Dots on non-zero months
    for (let i = 0; i < visibleCount && i < ppd.length; i++) {
      if (ppd[i] > 0) {
        const x = pad.left + i * xStep;
        const y = pad.top + plotH - (ppd[i] / niceMax) * plotH;
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = cc.primary; ctx.fill();
        ctx.strokeStyle = cc.tooltipBg; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }

    // Y-axis label
    ctx.save();
    ctx.fillStyle = cc.textDim; ctx.font = "10px sans-serif";
    ctx.translate(12, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("pages / day", 0, 0);
    ctx.restore();
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

/* ── Genre vs Rating violin plot ──────────────── */
let _scatterAnimFrame = null;
const renderScatterPlot = (booksMeta) => {
  const canvas = document.getElementById("scatterCanvas");
  if (!canvas) return;
  if (_scatterAnimFrame) { cancelAnimationFrame(_scatterAnimFrame); _scatterAnimFrame = null; }

  const valid = booksMeta.filter((b) => b.userRating > 0 && b.genres && b.genres.length > 0);
  if (valid.length === 0) {
    canvas.parentElement.innerHTML = '<p class="section-empty">Not enough rated data for genre chart.</p>';
    return;
  }

  const genreRatings = new Map();
  valid.forEach((b) => {
    const g = b.genres[0];
    if (!genreRatings.has(g)) genreRatings.set(g, []);
    genreRatings.get(g).push(b.userRating);
  });

  const sorted = Array.from(genreRatings.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8);

  const kde = (ratings, bw = 0.35) => {
    const points = [];
    for (let r = 0; r <= 5; r += 0.1) {
      let sum = 0;
      ratings.forEach((v) => {
        const z = (r - v) / bw;
        sum += Math.exp(-0.5 * z * z);
      });
      points.push({ r, d: sum / (ratings.length * bw * Math.sqrt(2 * Math.PI)) });
    }
    return points;
  };

  const violins = sorted.map(([name, ratings], i) => ({
    name,
    ratings,
    count: ratings.length,
    mean: ratings.reduce((a, b) => a + b, 0) / ratings.length,
    median: [...ratings].sort((a, b) => a - b)[Math.floor(ratings.length / 2)],
    kde: kde(ratings),
    ci: i,
  }));

  const maxDensity = Math.max(...violins.flatMap((v) => v.kde.map((p) => p.d)), 0.01);

  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(600, violins.length * 90 + 80);
  const H = 380;
  const pad = { top: 20, right: 20, bottom: 50, left: 50 };
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d");
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const colW = plotW / violins.length;
  const maxHalfW = colW * 0.38;

  let expandT = 1;
  let expanding = false;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const drawFrame = () => {
    const cc = getChartColors();
    const t = easeOut(expandT);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i <= 5; i++) {
      const y = pad.top + plotH - (i / 5) * plotH;
      ctx.strokeStyle = cc.gridLine; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = cc.axisLabel; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
      ctx.fillText(i, pad.left - 8, y + 3);
    }

    ctx.save(); ctx.fillStyle = cc.textDim; ctx.font = "10px sans-serif";
    ctx.translate(14, pad.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.fillText("Rating", 0, 0); ctx.restore();

    violins.forEach((v, vi) => {
      const cx = pad.left + colW * vi + colW / 2;
      const color = cc.dot[v.ci % cc.dot.length];

      // Draw violin shape (mirrored KDE)
      ctx.beginPath();
      const pts = v.kde;
      for (let i = 0; i < pts.length; i++) {
        const y = pad.top + plotH - (pts[i].r / 5) * plotH;
        const hw = (pts[i].d / maxDensity) * maxHalfW * t;
        if (i === 0) ctx.moveTo(cx + hw, y);
        else ctx.lineTo(cx + hw, y);
      }
      for (let i = pts.length - 1; i >= 0; i--) {
        const y = pad.top + plotH - (pts[i].r / 5) * plotH;
        const hw = (pts[i].d / maxDensity) * maxHalfW * t;
        ctx.lineTo(cx - hw, y);
      }
      ctx.closePath();
      ctx.fillStyle = color; ctx.globalAlpha = 0.3 * t; ctx.fill();
      ctx.globalAlpha = 0.8 * t; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.globalAlpha = 1;

      // Median line
      const medY = pad.top + plotH - (v.median / 5) * plotH;
      const medKde = v.kde.reduce((best, p) => Math.abs(p.r - v.median) < Math.abs(best.r - v.median) ? p : best, v.kde[0]);
      const medHw = (medKde.d / maxDensity) * maxHalfW * t;
      ctx.beginPath(); ctx.moveTo(cx - medHw, medY); ctx.lineTo(cx + medHw, medY);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();

      // Mean dot
      const meanY = pad.top + plotH - (v.mean / 5) * plotH;
      ctx.beginPath(); ctx.arc(cx, meanY, 3.5 * t, 0, Math.PI * 2);
      ctx.fillStyle = cc.tooltipBg; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();

      // Genre label
      ctx.fillStyle = cc.axisLabel; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      const label = v.name.length > 12 ? v.name.slice(0, 11) + "…" : v.name;
      ctx.fillText(label, cx, H - pad.bottom + 14);
      ctx.fillStyle = cc.textDim; ctx.font = "9px sans-serif";
      ctx.fillText(`(${v.count})`, cx, H - pad.bottom + 26);
    });
  };

  const animate = () => {
    expandT += 0.015;
    if (expandT >= 1) { expandT = 1; expanding = false; }
    drawFrame();
    if (expanding) _scatterAnimFrame = requestAnimationFrame(animate);
  };

  drawFrame();
  canvas.onmouseenter = () => { expandT = 0; expanding = true; if (_scatterAnimFrame) cancelAnimationFrame(_scatterAnimFrame); drawFrame(); _scatterAnimFrame = requestAnimationFrame(animate); };
  canvas.onmouseleave = () => { expanding = false; expandT = 1; if (_scatterAnimFrame) cancelAnimationFrame(_scatterAnimFrame); drawFrame(); };
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

/* ── World Map (Google Charts GeoChart) ───────────── */
let _geoChartReady = false;
let _geoChart = null;
let _geoChartData = null;
let _geoChartBooksMeta = null;

if (typeof google !== "undefined" && google.charts) {
  google.charts.load("current", { packages: ["geochart"] });
  google.charts.setOnLoadCallback(() => { _geoChartReady = true; });
}

const APP_TO_GEOCHART_NAME = {
  "USA": "United States", "UK": "United Kingdom", "Korea": "South Korea",
  "Russia": "Russia", "Iran": "Iran", "Czech Republic": "Czechia",
  "Vietnam": "Vietnam", "Tanzania": "Tanzania", "Myanmar": "Myanmar",
  "Hong Kong": "Hong Kong",
};

const toGeoChartName = (appName) => APP_TO_GEOCHART_NAME[appName] || appName;

const showCountryPopup = (countryName, books) => {
  const overlay = document.getElementById("worldmapPopupOverlay");
  if (!overlay) return;
  const titleEl = document.getElementById("worldmapPopupTitle");
  const listEl = document.getElementById("worldmapPopupList");
  if (titleEl) titleEl.textContent = `${countryName} — ${books.length} book${books.length !== 1 ? "s" : ""}`;
  if (listEl) {
    listEl.scrollTop = 0;
    listEl.innerHTML = books.map((b) => {
      const gFb = b.isbn ? `https://books.google.com/books/content?vid=ISBN${encodeURIComponent(b.isbn)}&printsec=frontcover&img=1&zoom=1` : "";
      let cover;
      if (b.coverUrl) {
        const oe = gFb
          ? `onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='');}" data-fallback="${gFb}"`
          : `onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='');"`;
        cover = `<img src="${b.coverUrl}" alt="" class="wm-popup-cover" loading="lazy" referrerpolicy="no-referrer" ${oe} /><div class="wm-popup-cover wm-popup-cover-empty" style="display:none"></div>`;
      } else if (gFb) {
        cover = `<img src="${gFb}" alt="" class="wm-popup-cover" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='');" /><div class="wm-popup-cover wm-popup-cover-empty" style="display:none"></div>`;
      } else {
        cover = `<div class="wm-popup-cover wm-popup-cover-empty"></div>`;
      }
      const author = (b.authors && b.authors[0]) || b.authorHint || "";
      const year = b.publishedYear || "";
      const rating = b.userRating > 0 ? `${"★".repeat(Math.round(b.userRating))}${"☆".repeat(5 - Math.round(b.userRating))}` : "";
      return `<div class="wm-popup-book">${cover}<div class="wm-popup-info"><div class="wm-popup-book-title">${b.title || "Untitled"}</div><div class="wm-popup-book-author">${author}${year ? ` (${year})` : ""}</div>${rating ? `<div class="wm-popup-book-rating">${rating}</div>` : ""}</div></div>`;
    }).join("");
  }
  overlay.style.display = "";
};

const renderWorldMap = (booksMeta) => {
  const container = document.getElementById("worldMap");
  if (!container) return;
  if (!_geoChartReady) {
    setTimeout(() => renderWorldMap(booksMeta), 300);
    return;
  }

  _geoChartBooksMeta = booksMeta;

  const countryCounts = new Map();
  const countryBooks = new Map();
  booksMeta.forEach((b) => {
    (b.countries || []).forEach((c) => {
      const gName = toGeoChartName(c);
      countryCounts.set(gName, (countryCounts.get(gName) || 0) + 1);
      if (!countryBooks.has(gName)) countryBooks.set(gName, []);
      countryBooks.get(gName).push(b);
    });
  });

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";

  const ALL_COUNTRIES = [
    "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia",
    "Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados",
    "Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina",
    "Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia",
    "Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia",
    "Congo","Costa Rica","Croatia","Cuba","Cyprus","Czechia","Denmark","Dominican Republic",
    "Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Ethiopia",
    "Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece",
    "Greenland","Guatemala","Guinea","Guyana","Haiti","Honduras","Hungary","Iceland","India",
    "Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan",
    "Kazakhstan","Kenya","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho",
    "Liberia","Libya","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Mali",
    "Malta","Mauritania","Mauritius","Mexico","Moldova","Mongolia","Montenegro","Morocco",
    "Mozambique","Myanmar","Namibia","Nepal","Netherlands","New Zealand","Nicaragua",
    "Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan",
    "Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal",
    "Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Sierra Leone",
    "Singapore","Slovakia","Slovenia","Somalia","South Africa","South Korea","South Sudan",
    "Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan",
    "Tajikistan","Tanzania","Thailand","Togo","Trinidad and Tobago","Tunisia","Turkey",
    "Turkmenistan","Uganda","Ukraine","United Arab Emirates","United Kingdom",
    "United States","Uruguay","Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
  ];

  const dataTable = new google.visualization.DataTable();
  dataTable.addColumn("string", "Country");
  dataTable.addColumn("number", "Books");
  dataTable.addColumn({ type: "string", role: "tooltip", p: { html: true } });

  const tipBg = isDark ? "#2a3e50" : "#3a3a3a";
  const tipColor = isDark ? "#e8dcd0" : "#f0f0f0";
  const tipDim = isDark ? "#90b8d0" : "#b0b0b0";
  const mkTooltip = (name, count) =>
    `<div style="background:${tipBg};color:${tipColor};padding:8px 14px;border-radius:6px;font-family:sans-serif;font-size:12px;min-width:90px;">` +
    `<div style="font-weight:700;font-size:13px;margin-bottom:${count > 0 ? "3px" : "0"}">${name}</div>` +
    (count > 0 ? `<div style="color:${tipDim};font-size:11px;">Books read: &nbsp;${count}</div>` : "") +
    `</div>`;

  const added = new Set();
  countryCounts.forEach((count, name) => {
    dataTable.addRow([name, count, mkTooltip(name, count)]);
    added.add(name);
  });

  ALL_COUNTRIES.forEach((name) => {
    if (!added.has(name)) {
      dataTable.addRow([name, null, mkTooltip(name, 0)]);
    }
  });

  _geoChartData = { countryCounts, countryBooks, dataTable };

  const options = {
    backgroundColor: isDark ? "#0e1e2e" : "#f0e4d8",
    colorAxis: {
      colors: isDark
        ? ["#80ffcc", "#50f0a0", "#28b868", "#0a7038"]
        : ["#c8e8b8", "#78c060", "#388828", "#0e5010"],
      minValue: 1,
    },
    defaultColor: isDark ? "#1c2c38" : "#ddd2c6",
    datalessRegionColor: isDark ? "#1c2c38" : "#ddd2c6",
    legend: "none",
    tooltip: { isHtml: true, trigger: "hover", showTitle: false },
    keepAspectRatio: true,
    width: container.offsetWidth || 1100,
    height: 480,
    borderColor: isDark ? "#4a6878" : "#a09080",
  };

  if (!_geoChart) {
    _geoChart = new google.visualization.GeoChart(container);
    google.visualization.events.addListener(_geoChart, "select", () => {
      const sel = _geoChart.getSelection();
      if (!sel || sel.length === 0 || !_geoChartData) return;
      const row = sel[0].row;
      if (row == null || !_geoChartData.dataTable) return;
      const name = _geoChartData.dataTable.getValue(row, 0);
      const books = _geoChartData.countryBooks.get(name) || [];
      _geoChart.setSelection([]);
      if (books.length === 0) return;
      showCountryPopup(name, books);
    });
    google.visualization.events.addListener(_geoChart, "regionClick", (e) => {
      if (!_geoChartData) return;
      const books = _geoChartData.countryBooks.get(e.region) || [];
      _geoChart.setSelection([]);
      if (books.length === 0) return;
      showCountryPopup(e.region, books);
    });
  }

  _geoChart.draw(dataTable, options);
};

const wmOverlay = document.getElementById("worldmapPopupOverlay");
const wmCloseBtn = document.getElementById("worldmapPopupClose");
const _closeWorldmapPopup = () => {
  if (wmOverlay) wmOverlay.style.display = "none";
  if (_geoChart) _geoChart.setSelection([]);
};
if (wmOverlay) {
  wmOverlay.addEventListener("click", (e) => { if (e.target === wmOverlay) _closeWorldmapPopup(); });
}
if (wmCloseBtn) {
  wmCloseBtn.addEventListener("click", _closeWorldmapPopup);
}

const renderMetadataSources = (booksMeta) => {
  if (!metadataSourcesWrap) return;
  if (!booksMeta || booksMeta.length === 0) {
    metadataSourcesWrap.innerHTML = '<p class="section-empty">No metadata source tags available.</p>';
    return;
  }

  const sorted = [...booksMeta].sort((a, b) =>
    (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" })
  );

  const letterSet = new Set();
  sorted.forEach((book) => {
    const ch = (book.title || "?")[0].toUpperCase();
    letterSet.add(/[A-Z]/.test(ch) ? ch : "#");
  });

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");
  const navHtml = `<div class="meta-alpha-nav">${alphabet
    .map((ch) => {
      const has = letterSet.has(ch);
      return `<button type="button" class="meta-alpha-btn${has ? "" : " disabled"}" data-letter="${ch}"${has ? "" : " disabled"}>${ch}</button>`;
    })
    .join("")}</div>`;

  let lastLetter = "";
  const rows = sorted
    .map((book) => {
      const ch = (book.title || "?")[0].toUpperCase();
      const letter = /[A-Z]/.test(ch) ? ch : "#";
      let anchor = "";
      if (letter !== lastLetter) {
        lastLetter = letter;
        anchor = ` id="meta-letter-${letter}"`;
      }
      const sources = book._sources || {};
      const yearCell = book.publishedYear ? sourceTag(sources.publishedYear || "openlibrary") : "--";
      const genresCell = Array.isArray(book.genres) && book.genres.length > 0 ? sourceTag(sources.genres || "openlibrary") : "--";
      const countriesCell =
        Array.isArray(book.countries) && book.countries.length > 0 ? sourceTag(sources.countries || "openlibrary") : "--";
      const coverCell = book.coverUrl ? sourceTag(sources.coverUrl || "openlibrary") : "--";
      const editorKey = escapeHtml(keyForBook(book));
      const editorTitle = escapeHtml(book.title);
      return `
        <tr${anchor}>
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
    ${navHtml}
    <div class="metadata-table-scroll">
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
    </div>
  `;

  const navEl = metadataSourcesWrap.querySelector(".meta-alpha-nav");
  if (navEl) {
    navEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".meta-alpha-btn:not(.disabled)");
      if (!btn) return;
      const letter = btn.dataset.letter;
      const target = document.getElementById(`meta-letter-${letter}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
};

const deleteFromPendingBtn = document.getElementById("deleteFromPendingBtn");

const updatePendingBtnState = (bookKey) => {
  const pending = loadPendingOverrides();
  const isPending = !!pending.books[bookKey];
  if (submitOverrideBtn) submitOverrideBtn.textContent = isPending ? "Update in Pending" : "Submit to Community";
  if (deleteFromPendingBtn) deleteFromPendingBtn.style.display = isPending ? "" : "none";
};

const openOverrideEditor = (bookKey, bookTitle) => {
  if (!overrideEditor) return;
  overrideBookKey.value = bookKey || "";
  overrideEditorTitle.textContent = `Override Metadata: ${bookTitle || bookKey}`;
  const local = runtimeOverrides[bookKey] || {};
  const pending = loadPendingOverrides().books[bookKey] || {};
  const existing = { ...pending, ...local };
  overrideYear.value = existing.publishedYear || "";
  overrideCountries.value = Array.isArray(existing.countries) ? existing.countries[0] || "" : "";
  overrideGenres.value = Array.isArray(existing.genres) ? existing.genres.join(", ") : "";
  overrideSeriesName.value = existing.seriesName || "";
  overrideSeriesTotalBooks.value = existing.seriesTotalBooks || "";
  overrideCoverUrl.value = existing.coverUrl || "";
  updatePendingBtnState(bookKey);
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
    const override = runtimeOverrides[key] || runtimeOverrides[book.title] || (book.isbn && runtimeOverrides[book.isbn]);
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
    if (override.seriesTotalBooks && Number(override.seriesTotalBooks) >= 2) {
      book._seriesTotalBooks = Number(override.seriesTotalBooks);
    }
  });
};

const buildManualSeriesEntries = () => {
  const overrideKeyOrder = new Map();
  let orderIdx = 0;
  [sharedOverrides, runtimeOverrides].forEach((src) => {
    Object.keys(src).forEach((k) => {
      if (!overrideKeyOrder.has(k)) overrideKeyOrder.set(k, orderIdx++);
    });
  });

  const manualGroups = new Map();
  latestBooksMeta.forEach((book) => {
    if (!book._manualSeries || !book.seriesName) return;
    const key = normalizeTitle(book.seriesName);
    if (!manualGroups.has(key)) manualGroups.set(key, { name: book.seriesName, declaredTotal: null, books: [] });
    const grp = manualGroups.get(key);
    if (book.seriesName.length > grp.name.length || (book.seriesName.length === grp.name.length && book.seriesName < grp.name)) {
      grp.name = book.seriesName;
    }
    if (book._seriesTotalBooks && (!grp.declaredTotal || book._seriesTotalBooks > grp.declaredTotal)) {
      grp.declaredTotal = book._seriesTotalBooks;
    }
    grp.books.push(book);
  });

  manualGroups.forEach((grp) => {
    grp.books.sort((a, b) => {
      const ya = a.publishedYear || 9999;
      const yb = b.publishedYear || 9999;
      if (ya !== yb) return ya - yb;
      const na = a.seriesNumber || 9999;
      const nb = b.seriesNumber || 9999;
      if (na !== nb) return na - nb;
      const oa = overrideKeyOrder.get(a.title) ?? overrideKeyOrder.get(a.isbn) ?? 9999;
      const ob = overrideKeyOrder.get(b.title) ?? overrideKeyOrder.get(b.isbn) ?? 9999;
      return oa - ob;
    });
  });
  const entries = [];
  manualGroups.forEach(({ name, declaredTotal, books }) => {
    if (books.length < 1) return;
    const totalBooks = declaredTotal || books.length;
    const readCount = books.length;
    entries.push({
      name,
      totalBooks,
      readCount,
      covers: books.map((b) => ({ url: b.coverUrl || "", isbn: b.isbn || "", read: true })),
      books,
      _manual: true,
    });
  });
  return entries;
};

const mergeManualSeriesIntoLatest = () => {
  const manualEntries = buildManualSeriesEntries();
  if (manualEntries.length === 0) return;
  const manualByKey = new Map(manualEntries.map((s) => [normalizeTitle(s.name), s]));
  const apiEntries = latestSeriesData.filter((s) => !s._manual);
  const merged = [];
  const handled = new Set();
  apiEntries.forEach((s) => {
    const k = normalizeTitle(s.name);
    const manual = manualByKey.get(k);
    if (manual) {
      merged.push({ ...s, totalBooks: manual.totalBooks, readCount: manual.readCount, books: manual.books || s.books, _manual: true });
      handled.add(k);
    } else {
      merged.push(s);
    }
  });
  manualEntries.forEach((s) => {
    if (!handled.has(normalizeTitle(s.name))) merged.push(s);
  });
  latestSeriesData = merged.sort((a, b) => a.name.localeCompare(b.name));
};

const rerenderFromCurrentMetadata = () => {
  mergeManualSeriesIntoLatest();
  setYearTab(currentYearMode);
  renderDecadesSection(latestBooksMeta);
  renderMostReadDecades(latestBooksMeta);
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
          const safeTitle = escapeHtml(book.title);
          const googleFallback = book.isbn
            ? `https://books.google.com/books/content?vid=ISBN${encodeURIComponent(book.isbn)}&printsec=frontcover&img=1&zoom=1`
            : "";
          if (book.coverUrl) {
            const onerrorAttr = googleFallback
              ? `onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';}" data-fallback="${googleFallback}"`
              : `onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';"`;
            return `<div class="cover-card" title="${safeTitle}"><img src="${book.coverUrl}" alt="${safeTitle} cover" loading="lazy" referrerpolicy="no-referrer" ${onerrorAttr} /></div>`;
          }
          if (googleFallback) {
            return `<div class="cover-card" title="${safeTitle}"><img src="${googleFallback}" alt="${safeTitle} cover" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';" /></div>`;
          }
          return `<div class="cover-card" title="${safeTitle}"><div class="cover-fallback">${safeTitle}</div></div>`;
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

const renderMostReadDecades = (booksMeta) => {
  if (!decadesReadList) return;
  const groups = new Map();
  booksMeta.forEach((book) => {
    if (!book.publishedYear) return;
    const decade = Math.floor(book.publishedYear / 10) * 10;
    if (!groups.has(decade)) groups.set(decade, []);
    groups.get(decade).push(book);
  });

  const ranked = Array.from(groups.entries())
    .map(([decade, books]) => ({ decade, count: books.length, books }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (ranked.length === 0) {
    decadesReadList.innerHTML = '<p class="section-empty">No books with publication year available.</p>';
    return;
  }

  decadesReadList.innerHTML = ranked
    .map((entry) => {
      const covers = entry.books
        .sort((a, b) => (a.publishedYear || 9999) - (b.publishedYear || 9999))
        .slice(0, 20)
        .map((book) => {
          const safeTitle = escapeHtml(book.title);
          const googleFallback = book.isbn
            ? `https://books.google.com/books/content?vid=ISBN${encodeURIComponent(book.isbn)}&printsec=frontcover&img=1&zoom=1`
            : "";
          if (book.coverUrl) {
            const onerrorAttr = googleFallback
              ? `onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';}" data-fallback="${googleFallback}"`
              : `onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';"`;
            return `<div class="cover-card" title="${safeTitle}"><img src="${book.coverUrl}" alt="${safeTitle} cover" loading="lazy" referrerpolicy="no-referrer" ${onerrorAttr} /></div>`;
          }
          if (googleFallback) {
            return `<div class="cover-card" title="${safeTitle}"><img src="${googleFallback}" alt="${safeTitle} cover" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'cover-fallback\\'>${safeTitle}</div>';" /></div>`;
          }
          return `<div class="cover-card" title="${safeTitle}"><div class="cover-fallback">${safeTitle}</div></div>`;
        })
        .join("");

      return `
        <article class="decade-row">
          <div class="decade-meta">
            <h3>${entry.decade}s</h3>
            <p><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> Books Read: ${entry.count}</p>
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
      mergeManualSeriesIntoLatest();
      setYearTab(currentYearMode);
      renderDecadesSection(metadata.booksMeta);
      renderMostReadDecades(metadata.booksMeta);
      setTaxonomyTab(currentTaxonomyMode);
      setThemesTab(currentThemesMode);
      setAuthorsTab(currentAuthorsMode);
      setCollectionsTab(currentCollectionsMode);
      renderMostRead(metadata.booksMeta);
      renderReadingPace(metadata.booksMeta);
      renderScatterPlot(metadata.booksMeta);
      renderRadarChart(metadata.booksMeta);
      renderWorldMap(metadata.booksMeta);
      renderMetadataSources(metadata.booksMeta);
    } catch {
      if (loadingWrap) loadingWrap.style.display = "none";
      statCountries.textContent = "--";
      statPages.textContent = "--";
      latestBooksMeta = [];
      latestSeriesData = [];
      setYearTab(currentYearMode);
      renderDecadesSection([]);
      renderMostReadDecades([]);
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

const getExistingSeriesTotalBooks = (seriesName, excludeKey) => {
  const normName = normalizeTitle(seriesName);
  const allOverrides = { ...sharedOverrides, ...runtimeOverrides };
  for (const [k, v] of Object.entries(allOverrides)) {
    if (k === excludeKey) continue;
    if (v.seriesName && normalizeTitle(v.seriesName) === normName && v.seriesTotalBooks) {
      return v.seriesTotalBooks;
    }
  }
  return null;
};

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
  if (overrideSeriesName.value.trim()) {
    next.seriesName = sanitizeText(overrideSeriesName.value, 120);
    const totalBooksVal = Number(overrideSeriesTotalBooks.value);
    if (!Number.isFinite(totalBooksVal) || totalBooksVal < 2) {
      alert("Total Books in Series is required when a Series Name is provided (minimum 2).");
      overrideSeriesTotalBooks.focus();
      return;
    }
    const existing = getExistingSeriesTotalBooks(next.seriesName, key);
    if (existing && existing !== totalBooksVal) {
      alert(`Another book in "${next.seriesName}" already has Total Books set to ${existing}. Please use the same value.`);
      overrideSeriesTotalBooks.value = existing;
      overrideSeriesTotalBooks.focus();
      return;
    }
    next.seriesTotalBooks = totalBooksVal;
  }
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
const PENDING_OVERRIDES_KEY = "statreads_pending_overrides";

const loadPendingOverrides = () => {
  try { return JSON.parse(localStorage.getItem(PENDING_OVERRIDES_KEY)) || { books: {}, authors: {} }; }
  catch { return { books: {}, authors: {} }; }
};
const savePendingOverrides = (pending) => localStorage.setItem(PENDING_OVERRIDES_KEY, JSON.stringify(pending));

const getPendingCount = () => {
  const p = loadPendingOverrides();
  return Object.keys(p.books).length + Object.keys(p.authors).length;
};

const updateSubmitAllBtnVisibility = () => {
  const btn = document.getElementById("submitAllOverridesBtn");
  if (!btn) return;
  const count = getPendingCount();
  btn.style.display = count > 0 ? "" : "none";
  btn.textContent = `Submit All to Community (${count} pending)`;
};

submitOverrideBtn.addEventListener("click", () => {
  const key = overrideBookKey.value.trim();
  if (!key) return;

  const entry = {};
  const yearValue = Number(overrideYear.value);
  if (Number.isFinite(yearValue) && yearValue >= 1000 && yearValue <= 2100) entry.publishedYear = yearValue;
  const singleCountry = pickSingleCountry([overrideCountries.value.trim()]);
  if (singleCountry.length > 0) entry.countries = singleCountry;
  const genres = parseCsvListInput(overrideGenres.value);
  if (genres.length > 0) entry.genres = normalizeGenreLabels(genres);
  if (overrideSeriesName.value.trim()) {
    entry.seriesName = sanitizeText(overrideSeriesName.value, 120);
    const totalBooksVal2 = Number(overrideSeriesTotalBooks.value);
    if (!Number.isFinite(totalBooksVal2) || totalBooksVal2 < 2) {
      alert("Total Books in Series is required when a Series Name is provided (minimum 2).");
      overrideSeriesTotalBooks.focus();
      return;
    }
    const existing2 = getExistingSeriesTotalBooks(entry.seriesName, overrideBookKey.value.trim());
    if (existing2 && existing2 !== totalBooksVal2) {
      alert(`Another book in "${entry.seriesName}" already has Total Books set to ${existing2}. Please use the same value.`);
      overrideSeriesTotalBooks.value = existing2;
      overrideSeriesTotalBooks.focus();
      return;
    }
    entry.seriesTotalBooks = totalBooksVal2;
  }
  const rawCoverUrl = overrideCoverUrl.value.trim();
  if (rawCoverUrl) {
    if (!isAllowedCoverUrl(toDirectImageUrl(rawCoverUrl))) {
      alert("Cover URL must be HTTPS from a known book cover source:\n" + ALLOWED_COVER_HOSTS.join(", "));
      overrideCoverUrl.focus();
      return;
    }
    entry.coverUrl = toDirectImageUrl(rawCoverUrl);
  }

  if (Object.keys(entry).length === 0) {
    alert("Fill in at least one field before submitting.");
    return;
  }

  const pending = loadPendingOverrides();
  pending.books[key] = entry;
  savePendingOverrides(pending);
  updateSubmitAllBtnVisibility();
  updatePendingBtnState(key);
  alert(`"${key}" added to pending submissions (${getPendingCount()} total).\nClick "Submit All to Community" in the Metadata section to open one GitHub issue.`);
});

if (deleteFromPendingBtn) {
  deleteFromPendingBtn.addEventListener("click", () => {
    const key = overrideBookKey.value.trim();
    if (!key) return;
    const pending = loadPendingOverrides();
    delete pending.books[key];
    savePendingOverrides(pending);
    updateSubmitAllBtnVisibility();
    updatePendingBtnState(key);
  });
}

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

const submitAllOverridesBtn = document.getElementById("submitAllOverridesBtn");
if (submitAllOverridesBtn) {
  submitAllOverridesBtn.addEventListener("click", () => {
    const pending = loadPendingOverrides();
    const bookCount = Object.keys(pending.books).length;
    const authorCount = Object.keys(pending.authors).length;
    const total = bookCount + authorCount;
    if (total === 0) {
      alert("No pending overrides to submit.");
      return;
    }

    const sections = [];
    if (bookCount > 0) {
      sections.push(`### Book Overrides (${bookCount})\n\n\`\`\`json\n${JSON.stringify(pending.books, null, 2)}\n\`\`\``);
    }
    if (authorCount > 0) {
      sections.push(`### Author Overrides (${authorCount})\n\n\`\`\`json\n${JSON.stringify(pending.authors, null, 2)}\n\`\`\``);
    }
    sections.push("### Why\n_Briefly describe what was wrong or missing._");

    const title = encodeURIComponent(`[Batch Override] ${total} item${total > 1 ? "s" : ""}`);
    const body = encodeURIComponent(sections.join("\n\n"));
    window.open(
      `https://github.com/${GITHUB_REPO}/issues/new?title=${title}&body=${body}&labels=override`,
      "_blank"
    );

    savePendingOverrides({ books: {}, authors: {} });
    updateSubmitAllBtnVisibility();
  });

  updateSubmitAllBtnVisibility();
}

// Author photo override popup wiring.
const authorPhotoOverlay = document.getElementById("authorPhotoOverlay");
const authorPopupTitle = document.getElementById("authorPopupTitle");
const authorPopupKey = document.getElementById("authorPopupKey");
const authorPopupUrl = document.getElementById("authorPopupUrl");
const authorPopupSave = document.getElementById("authorPopupSave");
const authorPopupSubmit = document.getElementById("authorPopupSubmit");
const authorPopupClear = document.getElementById("authorPopupClear");
const authorPopupCancel = document.getElementById("authorPopupCancel");
const authorPopupDeletePending = document.getElementById("authorPopupDeletePending");

const updateAuthorPendingBtnState = (authorName) => {
  const pending = loadPendingOverrides();
  const isPending = !!pending.authors[authorName];
  if (authorPopupSubmit) authorPopupSubmit.textContent = isPending ? "Update in Pending" : "Submit to Community";
  if (authorPopupDeletePending) authorPopupDeletePending.style.display = isPending ? "" : "none";
};

const openAuthorPopup = (authorName) => {
  if (!authorPhotoOverlay) return;
  authorPopupKey.value = authorName;
  authorPopupTitle.textContent = authorName;
  const local = authorOverrides[authorName];
  const pendingAuthor = loadPendingOverrides().authors[authorName];
  authorPopupUrl.value = local?.photoUrl || pendingAuthor?.photoUrl || "";
  updateAuthorPendingBtnState(authorName);
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
    const rawUrl = authorPopupUrl.value.trim();
    if (!rawUrl) {
      alert("Enter a photo URL before submitting.");
      authorPopupUrl.focus();
      return;
    }
    if (!isAllowedCoverUrl(rawUrl)) {
      alert("Photo URL must be HTTPS from a known host:\n" + ALLOWED_COVER_HOSTS.join(", "));
      authorPopupUrl.focus();
      return;
    }
    const pending = loadPendingOverrides();
    pending.authors[name] = { photoUrl: rawUrl };
    savePendingOverrides(pending);
    updateSubmitAllBtnVisibility();
    updateAuthorPendingBtnState(name);
    alert(`Author "${name}" added to pending submissions (${getPendingCount()} total).\nClick "Submit All to Community" in the Metadata section to open one GitHub issue.`);
  });
}

if (authorPopupDeletePending) {
  authorPopupDeletePending.addEventListener("click", () => {
    const name = authorPopupKey.value;
    if (!name) return;
    const pending = loadPendingOverrides();
    delete pending.authors[name];
    savePendingOverrides(pending);
    updateSubmitAllBtnVisibility();
    updateAuthorPendingBtnState(name);
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
  renderWorldMap(latestBooksMeta);
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

