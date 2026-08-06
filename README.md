# StatReads

**A Life in Books**  
A client-side web app that transforms your StoryGraph or Goodreads CSV export into a rich, visual dashboard — surfacing reading patterns, genre breakdowns, decade trends, thematic insights, series progress, and geographic footprint, all powered by live metadata from public book APIs.

[![HTML5](https://img.shields.io/badge/HTML5-E34F26.svg?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6.svg?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E.svg?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Open Library](https://img.shields.io/badge/Open%20Library-API-blue.svg)](https://openlibrary.org/developers/api)
[![Google Books](https://img.shields.io/badge/Google%20Books-API-4285F4.svg?logo=google&logoColor=white)](https://developers.google.com/books)

## Tech Stack

**Frontend** — Pure client-side, no build step required
- HTML5 + CSS3 (Flexbox, Grid, custom properties, dark/light theming)
- Vanilla JavaScript (ES6+, async/await)
- HTML Canvas API for custom charts and animations
- No frameworks or bundlers — opens directly in a browser

**External APIs**
- [Open Library API](https://openlibrary.org/developers/api) — Publication years, covers, subjects/themes
- [Google Books API](https://developers.google.com/books) — Authors, covers, page counts, genres, series detection
- [Wikidata API](https://www.wikidata.org/wiki/Wikidata:Data_access) — Author photos and nationality (country of citizenship)
- [Google Charts](https://developers.google.com/chart) — Interactive world map (GeoChart)

**Storage**
- `localStorage` for persisting manual metadata overrides, theme preference, and pending community submissions

## Key Features

### Dashboard Overview
- **Stats at a Glance** — Books read, unique authors, countries represented, total pages, and average rating
- **Dark / Light Theme** — Toggle between modes; defaults to OS preference, persists across sessions

### Charts & Visualisations
- **By Year** — Interactive bar chart toggling between book count and average rating per publication year, with hover tooltips
- **Highest Rated Decades** — Top decades ranked by average user rating, with cover art sorted by release year
- **Highest Read Decades** — Top decades ranked by number of books read, with cover art and book count
- **Genres & Countries** — Bar charts with "Most Read" / "Highest Rated" tabs; countries derived from author nationality via Wikidata
- **Themes** — Side-by-side 3D pie charts (Most Read / Highest Rated) extracted from subject tags, drawn with a tilted top face and an extruded rim, with hover-lift animation
- **Reading Pace** — Pages-per-day line chart computed monthly, with progressive-draw animation on hover
- **Genre vs Rating** — Violin plot showing rating distributions per genre with kernel density estimation, median lines, and mean dots
- **Genre Profile** — Radar/spider chart for top genres across count, average rating, and average page count, with expand-from-centre hover animation
- **World Map** — Choropleth map of book origins by country; click a country to see a scrollable popup of books read from that region

### Collections & Series
- **Collections** — Detects book series via API metadata, subtitle patterns, and common-prefix matching; displays "Complete" and "Almost Complete" tabs with stacked cover art that fans out on hover; click a stack to see the full book list in a popup
- **Manual Series Support** — Declare series name and total book count in the override form; drives Complete/Almost Complete logic for series not detected by APIs

### Authors
- **Authors Grid** — Author photos sourced from Wikidata, sorted by most-read (primary) and alphabetical (secondary), with "Most Read" / "Highest Rated" tabs and progressive "Show More" loading

### Most Read
- **Most Read** — Grid of all books sorted by re-read count and publication year, displayed as cover art with a read-count badge

### Metadata & Overrides
- **Metadata Sources** — Transparency table showing where each field was sourced from (Open Library, Google Books, Wikidata, or manual override), sorted alphabetically with A–Z jump navigation
- **Override Manager** — In-app editor to manually correct or add metadata for any book or author; overrides persist in localStorage and always take priority over API data
- **Community Contributions** — Batch-submit overrides so corrections benefit all users; edit or delete pending submissions before finalising. The submit button sits at the end of the section beside "Export Overrides JSON" and shows a live count of queued items
- **No-GitHub Submission Path** — On submitting, a popup offers either a pre-filled GitHub issue or an email sent by the app itself, so contributors without a GitHub account can still report bad API data; the maintainer's address is never exposed and the contributor's own mail client is never opened. Crediting yourself and leaving a reply address are both optional, so submissions can be fully anonymous

## Architecture

- **Multi-view SPA** — Three views (Upload → Confirm → Dashboard) managed via CSS class toggling, no routing library needed
- **Layered API Fetching** — Open Library search → Open Library work/editions → Google Books → broad Google fallback, with each layer filling gaps left by the previous
- **Batch Processing** — API requests are batched with concurrency limits to avoid rate-limiting while maximising throughput
- **Author-level Enrichment** — Wikidata provides canonical nationality and photo; country and photo data are shared across all books by the same author
- **Series Detection** — Three strategies: subtitle/title pattern matching, common-prefix grouping, and manual override declarations; within each series, books are sorted by published year → series number → override insertion order
- **Manual Override Precedence** — User overrides always take priority over API data and shared community overrides; stored in localStorage and applied after all API enrichment
- **Theme System** — CSS custom properties drive all colour values; theme toggle updates `data-theme` attribute on `<html>`, and all canvas charts re-render on theme change via `refreshChartsForTheme()`
- **Safe Rendering** — Markup built from book data goes through shared render helpers that escape every interpolated value, and image fallbacks run through a single delegated `error` listener driven by `data-` attributes instead of inline handlers
- **Caching** — Metadata, author photos, and map data are cached in localStorage and in-memory maps to minimise repeat API calls

## How to Run Locally

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

## Email Submission Setup

Community overrides can be submitted either as a GitHub issue or by email. Both routes are live in this repository — no setup is needed to use them.

The email route exists because a static site cannot send mail on its own, and a `mailto:` link would both expose the maintainer's address and leave a copy in the contributor's Sent folder. Instead, submissions are relayed through [Web3Forms](https://web3forms.com/): the browser POSTs the override JSON to the Web3Forms API, and their server delivers it to the maintainer's inbox from its own address.

**If you fork StatReads**, point the relay at your own inbox:

1. Go to [web3forms.com](https://web3forms.com/#start) and enter the address that should receive submissions.
2. Confirm the verification email to get an **access key** (a UUID).
3. Replace the key in `script.js`:

```js
const EMAIL_RELAY_ACCESS_KEY = "your-access-key-uuid-here";
```

The access key is a public alias for the inbox, not a secret — it is designed to be committed in client-side code, can only send mail *to* the configured address, and never reveals what that address is. Because it is public, submissions include a hidden honeypot field for spam filtering; Web3Forms can also add hCaptcha from its dashboard without any code change.

If the key is missing or malformed, choosing the email option shows a copy/download JSON fallback rather than failing silently. If a send fails, the pending queue is left untouched so nothing is lost, and the contributor is offered a retry, the GitHub route, or the raw JSON.

To swap in a different provider (Formspree, FormSubmit, a serverless function), change `EMAIL_RELAY_ENDPOINT` and the payload keys in the submit handler in `script.js`.

## Challenges Faced & Solutions

| Challenge | Solution |
|---|---|
| Series info often stored in API subtitle fields rather than title | Built pattern matcher that checks both title and subtitle with multiple regex patterns covering formats like "Book N of Series", "Series #N", numbered subtitles, etc. |
| Some popular series have no series indicator in API metadata at all | Added common-prefix detection — books by the same author sharing a long title prefix are automatically grouped |
| APIs sometimes return reprint years instead of original publication dates | Implemented a scoring system across multiple endpoints prioritising earliest publication year |
| Series enrichment returns noisy results (translations, boxsets, graphic novels) | Used book-number extraction from titles/subtitles; skip-patterns filter out boxsets, omnibus editions, and companions |
| Author nationality unreliable from book metadata alone | Integrated Wikidata as primary source for author citizenship, with birth-place as fallback |
| Cover images inconsistent across sections | Three-tier fallback (primary URL → Google Books ISBN lookup → text placeholder) applied uniformly across all rendering paths |
| Duplicated render code let escaping drift, so book titles and cover URLs could inject HTML | Consolidated the duplicated popup and cover-card renderers into shared helpers that escape every interpolated value, and replaced inline `onerror` attributes with one delegated `error` listener driven by `data-` attributes, so user data is never written into executable JavaScript |
| CORS and mixed-content issues with cover image URLs | URL normaliser rewrites HTTP → HTTPS and handles provider-specific URL patterns |
| Graph colours not visible across both themes | Separate colour palettes for dark and light modes in all canvas charts; charts fully re-render on theme toggle |
| Override submissions locked out anyone without a GitHub account | Added an email route alongside the issue route; a third-party relay sends it server-side, keeping the maintainer's address out of the source and out of the contributor's Sent folder |

## What I Learned

- Designing resilient multi-source API pipelines with layered fallbacks
- Normalising and deduplicating messy real-world data from multiple providers
- Building a responsive, interactive dashboard with zero dependencies
- Client-side state management using localStorage for user overrides and caching
- Custom canvas-based chart rendering with animations (KDE violin plots, radar charts, area charts)
- Implementing dark/light theming with CSS custom properties and canvas re-rendering
- Regex-based pattern matching for structured metadata extraction from unstructured text
- Preventing HTML injection when rendering untrusted data into templated markup, and why duplicated render paths are where escaping quietly breaks
- Working around the limits of a static site by relaying email through a third-party service instead of exposing an address or requiring a backend
