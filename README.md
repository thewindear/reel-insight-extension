# Reel Insight

**A Chrome extension for collecting, managing, and exporting Instagram Reels and creator data.**

Reel Insight is a Chrome extension built with **WXT, TypeScript, React, and shadcn/ui**. It simplifies Instagram data collection by automatically capturing Reels information, creator profiles, engagement metrics, and account details — all directly within your browser.

Browse Instagram, collect data automatically, manage your records, and export everything to Excel with just a few clicks.

## ✨ Features

### 🎬 Instagram Reels Collection

Collect Instagram Reels data while browsing.

- **Automatic Feed Browsing** — Optional (off by default): enable both feed collection and automatic browsing to save the current recommended Reel, wait 1000 milliseconds by default, and scroll to the next. Configure milliseconds, seconds, or minutes independently of creator collection. Saving must succeed before advancing. Disable either switch to stop; leaving the feed or hiding the tab prevents pending advances.
- **Automatic Reels Collection** — Capture Reels as you scroll through the Instagram Reels feed.
- **Configurable Collection Delay** — Automatic creator Reels collection waits before saving each list item and opening its detail, including the first and across list pages. List scans do not save all records in advance. Default: 1000 milliseconds; configurable in milliseconds, seconds, or minutes. Stopping cancels pending collection. This reduces request frequency but does not guarantee avoiding Instagram restrictions.
- **Creator Reels Collection** — Automatically discover and collect Reels from a creator's profile.
- **Feed Enrichment Switches** — Under feed collection, “Automatically fill video plays” and “Automatically fill creator information” independently control creator-list plays lookup and feed publisher/account collection. Both default to on and require feed collection to be enabled. Enabling creator enrichment also enables automatic creator profile collection; turning creator collection off in Settings turns feed creator enrichment off too. Disabling either enrichment switch cancels its pending task.
- **Creator List Plays Backfill** — With automatic video plays enabled, when a collected feed Reel has no play count, a dedicated window opens its publisher’s Reels list and matches the exact shortcode. It searches up to the configured creator page limit, waits up to ten seconds per page, and uses the creator collection delay between page scrolls. An exact count updates only the existing target record; captions and other fields are preserved. The window closes afterward and automatic feed browsing resumes. Closing the worker or disabling feed collection stops the lookup. Missing, inaccessible, or abbreviated counts remain empty; this does not bulk-process all older saved records.
- **Late Count Updates** — Feed collection continues saving newly available counts while waiting to advance. Later page responses can fill counts for already collected Reels without adding unvisited preloaded videos. Plays remain empty when Instagram does not provide a count; the extension does not estimate counts or make extra data requests.
- **Sponsors** — Collect accounts explicitly listed as paid-partnership sponsors in recommended Reels and details opened from creator Reels grids separately from collaborators, tagged users, and caption mentions. Show sponsor details and export them as a separate JSON column; missing sponsors use an empty list.
- **Detailed Reel Information** — Extract available video information, captions, and engagement metrics.
- **Caption Enrichment** — Retrieve additional details for previously discovered Reels.
- **Duplicate Prevention** — Automatically update existing records using `reels_id`, or shortcode when the ID is unavailable.
- **Collection Progress** — Monitor active collection tasks and stop them at any time.

### 👤 Instagram Creator Profiles

Collect detailed creator information directly from Instagram profiles. Avatar images are loaded through the source Instagram tab when the CDN blocks the extension origin. Only validated CDN image URLs are accepted, requests omit credentials and stop at 512 KB, and image data stays temporary rather than being saved to records.

Supported fields include:

| Field | Description |
|-------|-------------|
| Avatar | Creator profile picture |
| Display Name | Creator's Instagram display name |
| Instagram ID | Unique Instagram account identifier |
| Username | Instagram username |
| Posts | Total number of posts |
| Followers | Follower count |
| Following | Following count |
| Category | Creator category, when provided; saved as `""` when unavailable and displayed as `-` |
| Biography | Profile biography |
| Bio Links | External links listed in the profile |
| Verified | Account verification status |
| Date Joined | Account creation date, when available |
| Account Location | Account location, when available |
| Date Verified | Verification date, when available |

**Automatic Profile Collection**

The automatic creator collection setting controls visits to creator profiles. Enabling “Automatically fill creator information” also enables automatic creator collection. On recommended Reels, the extension identifies the visible publisher and opens their profile in a dedicated window. That window reuses profile collection to read Bio, Bio links, available counts, and account information, even if ordinary profile collection is configured for the current tab. Feed-origin profile workers are profile-only: even when automatic creator Reels collection is enabled, they never read or scroll the Reels grid, open video details, or accept batch enrichment commands. Normal creator visits continue following the user’s Reels collection setting. The feed does not read the account menu itself. The worker waits two seconds after profile data stops changing before completing, so later profile responses can fill Bio links. DOM-only links are treated as incomplete and do not overwrite a complete link list from a response. When both creator information and missing plays need enrichment for the same video, one window directly opens the creator’s Reels tab. The page provides both the profile header and target video grid: profile collection and targeted plays lookup run on that same page without a second navigation or reload. Grid scrolling pauses while the account-information dialog is open. The window closes after both results are ready; it never starts full-list collection. Profile loading still has a 30-second timeout; plays lookup follows the configured page limit. Missing fields remain empty. Automatic feed browsing waits for this task to finish.

It can also open the **About This Account** section to retrieve additional information, including the account's join date, location, and verification date.

The section is automatically closed after collection.

Automatic creator collection is enabled by default and can be disabled in Settings.

You can also manually collect the current creator by clicking **Collect Creator** in the Creators tab, without enabling automatic collection.

Creator records are identified by username. Collecting the same creator again updates the existing record, including replacing the previous list of bio links.

Instagram wraps some bio links in its `l.instagram.com` redirect. The extension unwraps the `u` parameter and stores the full destination URL instead of the redirect link.

### ⚡ Automated Collection

Reel Insight supports multiple collection workflows.

#### Reels Feed Collection

**Enabled by default**

Automatically captures the current Reel as you navigate through the Instagram Reels feed.

#### Creator Reels Collection

**Disabled by default**

When enabled, the extension can:

1. Detect Reels available in a creator's profile grid.
2. Collect loaded Reel links, thumbnails, and creator information.
3. Open newly discovered Reels individually.
4. Extract additional video details.
5. Return to the creator's Reels list.
6. Continue collecting until the configured limit is reached.

Collection supports two execution modes:

- **Separate Window** — Perform collection in a dedicated browser window.
- **Current Tab** — Collect data directly in the current browser tab.

Both creator profile collection and creator Reels collection have independent execution-mode settings.

The separate-window mode is selected by default.

When collecting creator profiles, the dedicated window closes automatically after collection.

When collecting Reels, the extension returns focus to the originating page after processing the first Reel. The collection tab closes automatically when the task finishes.

#### Collection Limits

Control how many pages of Reels to collect.

- Default limit: **1 page**
- The initially loaded grid counts as the first page.
- Each newly loaded batch after scrolling counts as an additional page.
- Collection stops when the page limit is reached.
- Collection also stops after three consecutive scroll attempts without discovering new items.

You can monitor collection progress in the extension drawer and stop an active task at any time.

Disabling the corresponding automatic collection setting also stops its active task.

When automatic creator Reels collection is disabled, you can still manually enrich the currently loaded Reels by clicking **Start Enrichment** in the Videos tab.

### 📊 Data Management

Manage collected records through a persistent side drawer integrated into Instagram.

The interface provides two independent tabs:

- **Videos** — Manage collected Instagram Reels.
- **Creators** — Manage collected Instagram creator profiles.

The Videos tab is displayed by default.

Available features include:

- Browse collected records.
- View detailed information.
- Automatically update existing records.
- Navigate through paginated results.
- Change the number of records displayed per page.
- Clear individual datasets.
- Export records to Excel.

**Pagination options:** 5, 10, 50, or 100 records per page.

The default page size is **10 records**.

Unavailable information is displayed as `—` rather than estimated or fabricated.

### 📥 Excel Export

Export your collected Instagram data to `.xlsx` files for further analysis.

- Export all records from the currently selected tab.
- Export Reels and creator records independently.
- Automatically localize column headers based on the selected language.
- Localize Boolean values in exported files.
- Include the latest collection timestamp.
- Preserve structured data in JSON-formatted cells.
- Choose whether to keep or clear records after exporting.

For creator records, bio links are displayed as domains in the interface.

Click the copy icon to copy the complete URL.

When exporting to Excel, the full list of bio links is preserved as a JSON array.

For Reels, collaborator and tagged-user information is also stored in separate JSON-formatted cells.

**Data Safety**

Records are deleted after export only when the user explicitly chooses to clear them and the exported file has been confirmed as saved.

You can also clear records manually without exporting.

### 🌍 Multilingual Interface

On first use, the interface follows the browser’s primary preferred language: Chinese (`zh`, including Simplified and Traditional variants) selects Chinese; every other language selects English. A saved language choice takes priority over the browser default.

Reel Insight supports:

- 🇺🇸 English
- 🇨🇳 Simplified Chinese

Language preferences apply to both the extension interface and Excel export column names.

### 🔒 Local Data Storage

All collected records are stored locally using the browser extension's storage.

- No external database is required.
- Records remain available across browser sessions.
- Video and creator records are managed separately.
- Uninstalling the extension removes its locally stored records.

> **Note:** Export important records before uninstalling the extension.

## 🚀 Getting Started

### Requirements

- Google Chrome or another compatible Chromium-based browser
- Node.js and npm

### Development

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/reel-insight-extension.git
cd reel-insight-extension
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

### Install in Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the following directory:

   ```text
   .output/chrome-mv3-dev
   ```

5. Open Instagram and navigate to a Reel or creator profile.

Keep the development server running to enable automatic rebuilds during development.

## 📖 How to Use

### Open Reel Insight

Navigate to Instagram and open:

- A Reel detail page.
- A creator's profile.
- A creator's Reels tab.

Click the floating Reel Insight button or the extension icon to open the persistent collection drawer on the right side of the page.

Drag the floating button anywhere in the viewport to reposition it. The position is stored locally and restored after a page refresh.

### Collect Reels

Visit the Instagram Reels feed.

With automatic Reels collection enabled, the extension captures Reel information as you navigate between videos.

Collected records appear in the **Videos** tab.

### Collect Creator Profiles

Visit an Instagram creator's profile.

With automatic creator collection enabled, the extension captures available profile information and retrieves additional account details when accessible.

You can also manually collect the current profile from the **Creators** tab.

### Collect a Creator's Reels

1. Open a creator's Reels tab.
2. Enable **Automatic Creator Reels Collection** in Settings.
3. Configure the collection mode and page limit.
4. Allow the extension to discover and process Reels.
5. Monitor progress in the collection drawer.

### Export Data

1. Open the Reel Insight drawer.
2. Select the **Videos** or **Creators** tab.
3. Click **Export Excel**.
4. Choose whether to keep or clear the records after export.
5. Save the generated `.xlsx` file.

## ⚙️ Settings

Access Settings from the upper-right corner of the collection drawer.

| Setting | Description | Default |
|---------|-------------|---------|
| Language | Interface and Excel export language | — |
| Auto Collect Reels | Collect videos while browsing the Reels feed | Enabled |
| Auto Collect Creators | Collect creator profiles automatically | Enabled |
| Auto Collect Creator Reels | Collect Reels from creator profile grids | Disabled |
| Creator Collection Mode | Separate Window / Current Tab | Separate Window |
| Creator Reels Collection Mode | Separate Window / Current Tab | Separate Window |
| Collection Page Limit | Maximum number of Reel grid batches to collect | 1 |

## 🛠️ Tech Stack

Reel Insight is built with modern browser extension technologies.

| Technology | Purpose |
|------------|---------|
| WXT | Browser extension framework |
| TypeScript | Type-safe application development |
| React | User interface |
| shadcn/ui | UI components |
| Tailwind CSS | Styling |
| Chrome Extension Manifest V3 | Browser extension platform |
| Excel (.xlsx) | Structured data export |

## 📦 Build

Run type checking:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Create a production build:

```bash
npm run build
```

The production extension will be generated in:

```text
.output/chrome-mv3
```

To install the production build:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `.output/chrome-mv3`.

After installing or updating the extension, refresh any open Instagram pages before using Reel Insight.

If the extension's content script is not yet available on the current page, clicking its icon opens a standalone records page instead.

## GitHub Release packages

Publishing a GitHub Release runs `.github/workflows/release.yml` for its tag. The workflow installs locked dependencies with Node.js 24, runs type checks and tests, builds the Chrome Manifest V3 extension, and uploads `reel-insight-chrome.zip` to that release. Published pre-releases are supported; drafts do not start a build.

Include the workflow in the commit referenced by the release tag. Before tagging, update the extension version in `package.json` and `package-lock.json`; the workflow preserves that version. The built package is attached to the same GitHub Release using the built-in `GITHUB_TOKEN`, so no additional secrets are needed. Existing assets are not overwritten; remove a previous ZIP before rerunning a successful release job.

Download the ZIP from the release's Assets section, extract it, and select the extracted folder using **Load unpacked** at `chrome://extensions` with Developer mode enabled. The ZIP contains `manifest.json` at its root. This workflow distributes the extension through GitHub Releases; it does not submit it to the Chrome Web Store.

## 📁 Project Structure

```text
.
├── entrypoints/          # WXT entrypoints and background operations
├── src/
│   ├── content/          # Instagram data listeners, DOM extraction,
│   │                     # floating button, and drawer controller
│   ├── reel/             # Data models, Instagram response parsing,
│   │                     # caption extraction, and record merging
│   ├── popup/            # React hooks, record tables, details,
│   │                     # Excel export, and Tailwind styles
│   └── components/
│       └── ui/           # shadcn/ui components
├── tests/                # Parser and cross-world data validation tests
├── components.json       # shadcn/ui configuration
└── AGENTS.md             # Development guidelines
```

## ⚠️ Limitations

Reel Insight depends on information made available by Instagram.

Please note:

- Instagram may change its website structure or API responses without notice.
- Some engagement metrics and account information may not be publicly available.
- Certain fields may be unavailable depending on the account, content, or page.
- Missing values are displayed as `—`.
- The extension does not estimate unavailable metrics.
- Instagram pages may need to be refreshed after installing or updating the extension.

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are welcome.

If you discover an issue or have an idea for improving Reel Insight, feel free to open a GitHub Issue or submit a Pull Request.

Please refer to `AGENTS.md` for development guidelines.

---

**Reel Insight** — Collect Instagram Reels and creator data, all from your browser.
