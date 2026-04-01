# StatReads

**Dynamic Book Statistics Dashboard**  
A client-side web app that transforms your StoryGraph or Goodreads CSV export into a rich, visual dashboard — surfacing reading patterns, genre breakdowns, decade trends, thematic insights, and series progress, all powered by live metadata from public book APIs.

[![HTML5](https://img.shields.io/badge/HTML5-E34F26.svg?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6.svg?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E.svg?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Open Library](https://img.shields.io/badge/Open%20Library-API-blue.svg)](https://openlibrary.org/developers/api)
[![Google Books](https://img.shields.io/badge/Google%20Books-API-4285F4.svg?logo=google&logoColor=white)](https://developers.google.com/books)

## 🛠 Tech Stack

**Frontend** — Pure client-side, no build step required
- HTML5 + CSS3 (Flexbox, Grid, custom properties)
- Vanilla JavaScript (ES6+, async/await)
- No frameworks or bundlers — opens directly in a browser

**External APIs**
- [Open Library API](https://openlibrary.org/developers/api) — Original publication years, covers, subjects/themes
- [Google Books API](https://developers.google.com/books) — Authors, covers, page counts, genres, series detection
- [Wikidata API](https://www.wikidata.org/wiki/Wikidata:Data_access) — Author nationality (country of citizenship)

**Storage**
- `localStorage` for persisting manual metadata overrides across sessions

## ✨ Key Features

- **CSV Upload** — Import your StoryGraph or Goodreads export; auto-detects format
- **Stats at a Glance** — Books read, unique authors, countries, pages logged, and average user rating
- **By Year Chart** — Interactive bar chart of books by count or average rating per publication year
- **Highest Rated Decades** — Top decades ranked by average rating, with book covers sorted by release year
- **Genres & Countries** — Bar charts with "Most Read" / "Highest Rated" toggle; country derived from author nationality via Wikidata
- **Themes** — Compact thematic breakdown extracted from Open Library subjects (top 2 per book)
- **Collections** — Detects book series (via API title/subtitle patterns and common-prefix matching), shows "Complete" and "Almost Complete" tabs with cover grids and read progress
- **Metadata Sources** — Transparency table showing where each field (cover, year, genres, country) was sourced from (Open Library, Google, Wikidata, or Manual)
- **Override Manager** — In-app editor to manually correct or add metadata for any book, with JSON export/import; overrides persist in localStorage

## 📸 Screenshots

![Landing Page](screenshots/landing.png)
![Dashboard Stats](screenshots/dashboard.png)
![Genres & Countries](screenshots/genres-countries.png)
![Collections](screenshots/collections.png)

## 🏗 Architecture

- **Multi-view SPA** — Three views (Upload → Confirm → Dashboard) managed via CSS class toggling, no routing library needed
- **Layered API Fetching** — Open Library search → Open Library work/editions → Google Books → broad Google fallback, with each layer filling gaps left by the previous
- **Author-level Enrichment** — Wikidata provides canonical nationality; country signals are shared across all books by the same author
- **Series Detection** — Two strategies: subtitle/title pattern matching (e.g., "Shiva Trilogy Book 1") and common-prefix grouping (e.g., "Harry Potter and the…"); enrichment uses book-number extraction for accurate totals
- **Manual Override Precedence** — User overrides always take priority over API data; stored in localStorage and applied after all API enrichment

## ⚙️ How to Run Locally

No server, build step, or dependencies required.

```bash
# Clone the repository
git clone https://github.com/atandritC/StatReads.git
cd StatReads

# Open directly in your browser
# On Windows:
start index.html

# On macOS:
open index.html

# On Linux:
xdg-open index.html
```

Then upload a CSV export from [StoryGraph](https://www.thestorygraph.com/) or [Goodreads](https://www.goodreads.com/).

## 🧠 Challenges Faced & Solutions

| Challenge | Solution |
|---|---|
| Google Books stores series info in `subtitle`, not `title` | Built `detectSeriesFromTitle` to check both fields with 6 regex patterns covering formats like "Book N of the Series", "Series #N", subtitles, etc. |
| Harry Potter books have no series indicator in API metadata | Added common-prefix detection — books by the same author sharing a title prefix are automatically grouped as a series |
| Open Library returns reprint years instead of original publication dates | Implemented a scoring system across multiple OL endpoints (search, works, editions) prioritizing `first_publish_year` |
| Google Books series enrichment returns noisy results (translations, boxsets, graphic novels) | Used book-number extraction from titles/subtitles instead of title-dedup; skip patterns filter out boxsets, omnibus editions, and companions |
| Author nationality unreliable from book metadata alone | Integrated Wikidata as primary source for author citizenship (P27), with Open Library birth-place as fallback |
| CORS and mixed-content issues with cover image URLs | `toDirectImageUrl` normalizer rewrites HTTP → HTTPS and handles provider-specific URL patterns |

## 📈 What I Learned

- Designing resilient multi-source API pipelines with layered fallbacks
- Normalizing and deduplicating messy real-world data from multiple providers
- Building a responsive, interactive dashboard with zero dependencies
- Client-side state management using localStorage for user overrides
- Regex-based pattern matching for structured metadata extraction from unstructured text
