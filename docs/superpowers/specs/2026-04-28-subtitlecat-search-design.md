# Subtitle Cat Search Design

## Summary

Add a built-in Subtitle Cat search flow to the existing overlay panel so users can search for subtitle entries by keyword, choose a search result, then choose a language-specific subtitle download and load it directly into the player.

The existing manual subtitle URL flow remains available as a secondary path instead of the primary entry point.

## Goals

- Make Subtitle Cat search the default online subtitle workflow inside the panel
- Let users type their own search keywords instead of inferring them from the page
- Show a searchable list of subtitle entries returned from Subtitle Cat
- Let users expand a result, choose a language, and download the matching `.srt`
- Reuse the existing subtitle download, parsing, and preview pipeline once a final `.srt` URL is chosen

## Non-Goals

- Auto-detect search keywords from the current webpage title
- Replace the existing local subtitle file upload flow
- Remove manual subtitle URL entry entirely
- Prefetch language lists for every search result
- Build a new tab or standalone page for subtitle search

## User Experience

The current online subtitle section in the overlay panel becomes a two-level source picker:

1. A primary "search subtitles" area with a text input and search button
2. A secondary manual URL entry area that stays available but visually de-emphasized

The search flow is:

1. User enters a subtitle keyword such as a title code or film name
2. The panel fetches Subtitle Cat search results
3. The panel displays a result list with title, file size, download count, and language count
4. User clicks one result to expand its available language downloads
5. The panel fetches that result's detail page and parses downloadable language links
6. User clicks a language entry
7. The extension downloads the `.srt`, parses it, and loads it as the active subtitle track

The manual URL path remains available through a collapsed or secondary subsection labeled as a direct subtitle link option.

## UI Changes

Update the current markup in `src/content.js` for the source section to include:

- A keyword input for subtitle search
- A search action button
- A loading or status area for search progress and errors
- A result list container
- Per-result expand and collapse behavior
- A nested language list for the currently expanded result
- A lower-priority manual subtitle URL subsection

The UI should continue using the existing panel style language and avoid introducing a new tab.

## Data Model

The content script needs additional UI state for:

- Current search keyword
- Search request status: idle, loading, success, error
- Search results array
- Expanded result identifier or detail page URL
- Cached language lists by result URL
- Per-language loading state while downloading a chosen subtitle

Suggested result shape:

```js
{
  title: "SDMU-802 jp",
  detailUrl: "https://www.subtitlecat.com/subs/1462/SDMU-802%20jp.html",
  sizeLabel: "164 KB",
  downloadLabel: "2 downloads",
  languageCountLabel: "2 languages"
}
```

Suggested language option shape:

```js
{
  languageCode: "zh-CN",
  languageLabel: "Chinese (Simplified)",
  downloadUrl: "https://www.subtitlecat.com/subs/1462/SDMU-802%20jp-zh-CN.srt"
}
```

## Background Responsibilities

Keep all Subtitle Cat HTML fetching and parsing in `src/background.js`.

Add two new background request types:

- A search request that fetches the Subtitle Cat search page and parses subtitle rows
- A detail request that fetches a Subtitle Cat subtitle detail page and parses downloadable language links

This keeps website scraping logic out of the content script and centralizes network and parsing error handling.

The existing direct subtitle download message path should remain reusable for the final `.srt` fetch.

## Parsing Strategy

Observed site behavior:

- `https://www.subtitlecat.com/index.php?search=<query>` returns server-rendered HTML
- Search results are present directly in the HTML table
- Each result links to a subtitle detail page
- The detail page includes direct `.srt` links for languages already available for download

Search parsing should extract:

- Result title text
- Detail page URL
- File size text
- Download count text
- Language count text

Detail parsing should extract:

- Human-readable language name
- Language code when available
- Direct `.srt` download URL

Only visible direct download links should be surfaced. "Translate" buttons for languages without ready subtitle downloads should not be treated as downloadable results.

## Error Handling

Search errors should surface clear panel messages for:

- Empty keyword input
- Search fetch failures
- Subtitle Cat returning an unexpected page structure
- No search results found

Detail errors should surface clear messages for:

- Failed detail page fetch
- No downloadable languages found on the selected result
- Failed subtitle file download
- Downloaded subtitle text that cannot be parsed into usable cues

When a request fails, the panel should preserve the user's entered keyword and prior results when possible so they can retry without retyping.

## Performance and Request Strategy

Language lists should be loaded on demand only after the user expands a specific result.

Do not prefetch all detail pages after search because:

- It increases latency before the first results are shown
- It creates unnecessary network traffic
- It increases the chance of site throttling or brittle failures

Cache a result's parsed language list for the current page session after the first successful fetch so repeated expand and collapse actions do not refetch immediately.

## Testing

Add focused tests for parsing and background behavior:

- Search result parsing from representative Subtitle Cat HTML
- Detail page language link parsing from representative Subtitle Cat HTML
- Background handler responses for success and failure cases
- Existing direct subtitle download behavior should remain covered

Content script behavior can be tested at the state and rendering helper level where practical, but the main confidence should come from parser coverage plus background message handling coverage.

Fixture-based tests are preferred over live network requests.

## Rollout Notes

- This feature depends on the current Subtitle Cat HTML structure staying reasonably stable
- If the site changes markup, the parser should fail with a user-visible error rather than silently succeeding with bad data
- Manual subtitle URL entry provides a fallback if Subtitle Cat parsing breaks temporarily
