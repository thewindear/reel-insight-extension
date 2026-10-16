# Reel Insight

**A Chrome extension for collecting, managing, and exporting Instagram Reels and creator data.**

Reel Insight is a Chrome extension built with **WXT, TypeScript, React, and shadcn/ui**. It simplifies Instagram data collection by automatically capturing Reels information, creator profiles, engagement metrics, and account details — all directly within your browser.

Browse Instagram, collect data automatically, manage your records, and export everything to Excel with just a few clicks.

## ✨ Features

### 🎬 Instagram Reels Collection

Collect Instagram Reels data while browsing.

- **Automatic Reels Collection** — Capture Reels as you scroll through the Instagram Reels feed.
- **Creator Reels Collection** — Automatically discover and collect Reels from a creator's profile.
- **Detailed Reel Information** — Extract available video information, captions, and engagement metrics.
- **Caption Enrichment** — Retrieve additional details for previously discovered Reels.
- **Duplicate Prevention** — Automatically update existing records using `reels_id`, or shortcode when the ID is unavailable.
- **Collection Progress** — Monitor active collection tasks and stop them at any time.

### 👤 Instagram Creator Profiles

Collect detailed creator information directly from Instagram profiles.

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
| Biography | Profile biography |
| Bio Links | External links listed in the profile |
| Verified | Account verification status |
| Date Joined | Account creation date, when available |
| Account Location | Account location, when available |
| Date Verified | Verification date, when available |

**Automatic Profile Collection**

When enabled, Reel Insight automatically collects creator information when you visit an Instagram profile.

It can also open the **About This Account** section to retrieve additional information, including the account's join date, location, and verification date.

The section is automatically closed after collection.

Automatic creator collection is enabled by default and can be disabled in Settings.

You can also manually collect the current creator by clicking **Collect Creator** in the Creators tab, without enabling automatic collection.

Creator records are identified by username. Collecting the same creator again updates the existing record, including replacing the previous list of bio links.

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
