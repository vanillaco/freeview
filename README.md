# Freeview

A lightweight, client-side image gallery for browsing local folders. Freeview is an homage to macOS Sequoia, the last Aqua iteration before Liquid Glass, rendered in HTML, CSS, and JavaScript. No frameworks, no servers, no uploads.

## Design

Freeview borrows its visual language from macOS Sequoia's Finder: a `#f2f2f7` sidebar with pill-shaped blue selection, a 46px unified toolbar with a bold title, rounded controls, system-aware dark mode, and the familiar `-apple-system` typeface. The thumbnail grid avoids unnecessary chrome (just images, names, and a minimal status bar) to keep the focus on the content.

On iPhone, the sidebar becomes a native-style bottom sheet with a grabber handle and dimmed backdrop, matching iOS `UISplitViewController` behaviour rather than an Android-style drawer.

## Features

- Load folders via file picker or drag & drop
- Recursive subfolder scanning with sidebar navigation
- Favourites: right-click (desktop) or long-press (mobile) any folder to add/remove from the Favourites sidebar section; persisted in localStorage
- Sort by name, date, or size
- Full-screen lightbox with zoom (50% to 300%) and panning
- Live status bar (item count + total size)
- System-aware light / dark mode
- Thumbnail size slider
- Search with 200ms debounce
- Downsampled thumbnails (full-resolution images are decoded at 600px max for gallery display, saving memory)
- Progressive rendering via IntersectionObserver
- Off-screen images unload automatically to free memory

## How to Run

Freeview is a static frontend. Open `index.html` in any modern browser:

```bash
open index.html
```

For best folder handling (especially with large directories), serve locally:

```bash
npx serve
# or
python3 -m http.server 8000
```

## Project Structure

```
freeview/
├── index.html      # Main UI
├── style.css       # Sequoia-inspired design system
├── gallery.js      # Core logic
├── feedback/       # Design reference screenshots
└── README.md
```

## Tech

HTML5, CSS3 (custom properties), JavaScript (ES6+), and native browser APIs (File API, URL API, matchMedia, IntersectionObserver, createImageBitmap, content-visibility). Zero dependencies.
