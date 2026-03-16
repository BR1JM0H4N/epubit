# epubJS — User Manual

A client-side JavaScript library for building valid EPUB 3 files directly in the browser. No server required.

[![GitHub](https://img.shields.io/badge/github-BR1JM0H4N%2FepubJS-blue?logo=github)](https://github.com/BR1JM0H4N/epubJS)
[![License](https://img.shields.io/github/license/BR1JM0H4N/epubJS)](LICENSE)
[![JavaScript](https://img.shields.io/badge/javascript-55.3%25-yellow?logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML](https://img.shields.io/badge/html-44.7%25-orange?logo=html5)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![npm version](https://img.shields.io/npm/v/epubjs)](https://www.npmjs.com/package/epubjs)
[![Build Status](https://img.shields.io/github/actions/workflow/status/BR1JM0H4N/epubJS/.github/workflows/ci.yml?branch=main)](https://github.com/BR1JM0H4N/epubJS/actions)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/BR1JM0H4N/epubJS/graphs/commit-activity)

## 🚀 Live Demo

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Click%20Here-brightgreen?style=for-the-badge)](https://br1jm0h4n.github.io/epubJS/)

## Features

- 📚 Build valid EPUB 3 files directly in the browser
- 🚫 No server required
- ⚡ Fast and lightweight
- 🎨 Full client-side control
- 📖 Support for standard EPUB 3 specification


---

## Table of Contents

1. [Installation](#1-installation)
2. [Quick Start](#2-quick-start)
3. [Constructor](#3-constructor)
4. [Metadata](#4-metadata)
5. [Cover Image](#5-cover-image)
6. [Table of Contents Page](#6-table-of-contents-page)
7. [Chapters](#7-chapters)
8. [Stylesheets](#8-stylesheets)
9. [Images](#9-images)
10. [Fonts](#10-fonts)
11. [Sanitizer](#11-sanitizer)
12. [Generating the EPUB](#12-generating-the-epub)
13. [Method Chaining](#13-method-chaining)
14. [Full Example](#14-full-example)
15. [HTML Elements Reference](#15-html-elements-reference)
16. [EPUB Structure Reference](#16-epub-structure-reference)
17. [Error Reference](#17-error-reference)

---

## 1. Installation

### Via `<script>` tag (browser)

Include JSZip first, then epubJS.js. JSZip will also be auto-injected if missing, but including it yourself is more reliable.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="epubJS.js"></script>
```

`EBook` is now available globally on `window`.

### Via CommonJS / Node-compatible bundler

```js
const EBook = require("./epubJS.js");
```

### Via ESM bundler (Webpack, Vite, Rollup)

The library uses a UMD wrapper, so it works with any bundler. Just import it:

```js
import EBook from "./epubJS.js";
```

> **Note:** The library targets browser environments. It depends on `DOMParser`, `FileReader`, `URL.createObjectURL`, and `document`. It will not work in a pure Node.js environment without a DOM polyfill.

---

## 2. Quick Start

```js
const book = new EBook({ title: "My First Book", author: "Jane Doe" });

book.addCSS("style.css", `
  body { font-family: Georgia, serif; line-height: 1.6; }
  h1   { font-size: 1.8em; }
`);

book.setCover(base64ImageString, "image/jpeg", "cover.jpg");
book.addTOCPage();

book.addChapter("Introduction", `
  <h1>Introduction</h1>
  <p>Welcome to my book.</p>
`, { css: ["style.css"] });

book.addChapter("Chapter One", `
  <h1>Chapter One</h1>
  <p>The story begins here.</p>
`, { css: ["style.css"] });

await book.download();
```

---

## 3. Constructor

```js
const book = new EBook(options);
```

Creates a new EBook instance. All options are optional.

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | string | `"Untitled"` | Book title |
| `author` | string | `"Unknown"` | Author name |
| `language` | string | `"en"` | BCP 47 language tag, e.g. `"en"`, `"fr"`, `"ja"` |
| `publisher` | string | `""` | Publisher name |
| `description` | string | `""` | Short book description |
| `date` | string | today | Publication date in `YYYY-MM-DD` format |
| `uuid` | string | auto | Custom UUID for the book identifier |
| `rights` | string | `""` | Copyright / rights statement |
| `sanitize` | boolean | `true` | Auto-sanitize chapter HTML before writing |

```js
const book = new EBook({
  title:       "Dune",
  author:      "Frank Herbert",
  language:    "en",
  publisher:   "Chilton Books",
  description: "A science fiction epic set on the desert planet Arrakis.",
  date:        "1965-08-01",
  rights:      "© 1965 Frank Herbert",
});
```

---

## 4. Metadata

### `setMeta(meta)` → `this`

Update any metadata field after construction. Accepts the same keys as the constructor.

```js
book.setMeta({ title: "Dune Messiah", author: "Frank Herbert" });
```

Partial updates are fine — only the keys you pass are changed.

### `getMeta()` → `object`

Returns a shallow copy of the current metadata object.

```js
const meta = book.getMeta();
console.log(meta.title);  // "Dune Messiah"
```

---

## 5. Cover Image

### `setCover(data, mimeType, filename, opts)` → `this`

Sets the cover image for the book.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `data` | string \| ArrayBuffer \| Blob | — | Image data. Base64 string, ArrayBuffer, or Blob |
| `mimeType` | string | `"image/jpeg"` | MIME type of the image |
| `filename` | string | `"cover.jpg"` | Filename stored inside the EPUB |
| `opts.asPage` | boolean | `true` | Insert a visible cover page as the first item in the spine |
| `opts.altText` | string | `"Cover"` | Alt text for the cover `<img>` element |

```js
// From a base64 string
book.setCover(base64str, "image/jpeg", "cover.jpg");

// From a file input
const file = document.querySelector("input[type=file]").files[0];
book.setCover(file, file.type, file.name);

// Cover image only — no visible page (for readers that use it as metadata only)
book.setCover(base64str, "image/png", "cover.png", { asPage: false });

// Custom alt text
book.setCover(base64str, "image/jpeg", "cover.jpg", {
  asPage: true,
  altText: "Cover art for Dune"
});
```

When `asPage: true` (the default), the cover is inserted as a full-bleed page — black background, centered image — as the very first page the reader opens.

### `removeCover()` → `this`

Removes the cover image and cover page.

```js
book.removeCover();
```

---

## 6. Table of Contents Page

epubJS.js generates two kinds of TOC automatically: an EPUB 3 `nav.xhtml` (used by modern readers for their built-in TOC sidebar) and an EPUB 2 `toc.ncx` (for legacy readers). These are structural and invisible as readable pages.

`addTOCPage()` adds a **third**, human-readable TOC as a real page inside the book — the kind you'd find printed on page 3 of a physical book. It has numbered entries and clickable links.

### `addTOCPage(opts)` → `this`

| Option | Type | Default | Description |
|---|---|---|---|
| `opts.title` | string | `"Table of Contents"` | Heading displayed at the top of the page |
| `opts.css` | string[] | `[]` | Stylesheet filenames to link (must be added via `addCSS`) |
| `opts.inlineStyle` | string | — | Raw CSS string injected as a `<style>` block, overriding the built-in default style |

```js
// Default — uses built-in styling
book.addTOCPage();

// Custom heading
book.addTOCPage({ title: "Contents" });

// Linked to your own stylesheet
book.addTOCPage({ title: "Contents", css: ["style.css"] });

// Inline style override
book.addTOCPage({
  title: "Contents",
  inlineStyle: `
    body { font-family: sans-serif; background: #fafafa; }
    h1   { color: #333; }
    a    { color: #0066cc; }
  `
});
```

The TOC page is always placed **after** the cover (if any) and **before** chapter one. It lists every chapter in order with a number prefix and a clickable link.

> **Note:** Call `addTOCPage()` before or after adding chapters — the page is built at generation time, so it always reflects the final chapter list.

### `removeTOCPage()` → `this`

Disables the TOC page if you change your mind.

```js
book.removeTOCPage();
```

---

## 7. Chapters

### `addChapter(title, html, opts)` → `this`

Adds a chapter to the book.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `title` | string | — | Chapter title, shown in the TOC |
| `html` | string | — | Body HTML (inner content, not a full document) |
| `opts.id` | string | auto | Explicit item ID. Auto-generated from title if omitted |
| `opts.order` | number | append | Insertion position. Lower numbers appear first |
| `opts.css` | string[] | `[]` | Stylesheet filenames to link |
| `opts.raw` | boolean | `false` | Skip the sanitizer for this chapter only |

```js
// Minimal
book.addChapter("Prologue", "<p>It began on a Tuesday.</p>");

// With stylesheet
book.addChapter("Chapter One", chapterHtml, { css: ["style.css"] });

// Explicit order — insert before other chapters
book.addChapter("Preface", prefaceHtml, { order: 0 });

// Custom ID
book.addChapter("About the Author", authorHtml, { id: "about-author" });

// Skip sanitizer (use with trusted HTML only)
book.addChapter("Technical Appendix", rawXhtml, { raw: true });
```

The HTML you pass is treated as the **body content** — headings, paragraphs, images, tables, lists, and links are all supported. You do not need to include `<html>`, `<head>`, or `<body>` tags.

### `updateChapter(id, title, html)` → `this`

Update a chapter's title and/or HTML content in place.

```js
book.updateChapter("ch-1-chapter-one", "Chapter One (Revised)", newHtml);

// Update title only
book.updateChapter("ch-1-chapter-one", "Chapter One (Revised)");

// Update content only
book.updateChapter("ch-1-chapter-one", undefined, newHtml);
```

Throws an error if the ID is not found.

### `removeChapter(id)` → `this`

Removes a chapter by its ID.

```js
book.removeChapter("ch-2-draft-notes");
```

### `reorderChapters(idArray)` → `this`

Re-sequence chapters by passing an array of IDs in the new desired order.

```js
// Move chapter 3 to the front
book.reorderChapters(["ch-3-epilogue", "ch-1-intro", "ch-2-main"]);
```

IDs not mentioned keep their relative positions after the listed ones.

### `getChapters()` → `object[]`

Returns a shallow list of chapter metadata (does not include HTML content).

```js
const chapters = book.getChapters();
// [{ id: "ch-1-introduction", title: "Introduction", order: 0 }, …]
```

---

## 8. Stylesheets

### `addCSS(filename, content)` → `this`

Adds a CSS file to the EPUB. Reference it in chapters via `opts.css`.

```js
book.addCSS("style.css", `
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1em;
    line-height: 1.7;
    margin: 0 auto;
    max-width: 36em;
    padding: 1em 1.5em;
  }
  h1, h2, h3 { font-weight: bold; margin-top: 2em; }
  p           { margin: 0 0 1em; text-indent: 1.5em; }
  p:first-child { text-indent: 0; }
  blockquote  { border-left: 3px solid #ccc; padding-left: 1em; color: #555; }
  table       { border-collapse: collapse; width: 100%; }
  th, td      { border: 1px solid #ccc; padding: .4em .8em; }
  img         { max-width: 100%; height: auto; }
  code        { font-family: monospace; background: #f4f4f4; padding: .1em .3em; }
`);
```

Then link it when adding chapters:

```js
book.addChapter("Chapter One", html, { css: ["style.css"] });
```

Multiple stylesheets are supported. Pass all relevant filenames in the `css` array:

```js
book.addCSS("base.css", baseStyles);
book.addCSS("chapter.css", chapterStyles);

book.addChapter("Chapter One", html, { css: ["base.css", "chapter.css"] });
```

### `removeCSS(filename)` → `this`

```js
book.removeCSS("draft-style.css");
```

---

## 9. Images

### `addImage(filename, data, mimeType)` → `this`

Adds an image asset. Once added, reference it inside chapter HTML using a relative path: `../images/<filename>`.

| Parameter | Type | Description |
|---|---|---|
| `filename` | string | e.g. `"photo.jpg"` — used as the reference path |
| `data` | string \| ArrayBuffer \| Blob | Base64 string, ArrayBuffer, or Blob |
| `mimeType` | string | Optional. Inferred from extension if omitted |

**Supported formats:** JPEG, PNG, GIF, WebP, AVIF, SVG.

```js
// From a base64 string
book.addImage("sunset.jpg", base64string, "image/jpeg");

// From a Blob (e.g. fetched from the web)
const response = await fetch("https://example.com/photo.png");
const blob = await response.blob();
book.addImage("photo.png", blob);

// From a file input
const file = inputEl.files[0];
book.addImage(file.name, file);
```

Then reference it in chapter HTML:

```html
<figure>
  <img src="../images/sunset.jpg" alt="A sunset over the ocean"/>
  <figcaption>Figure 1: Sunset at Cape Point</figcaption>
</figure>
```

### `removeImage(filename)` → `this`

```js
book.removeImage("draft-diagram.png");
```

### `getImages()` → `string[]`

Returns a list of all added image filenames.

```js
book.getImages(); // ["cover.jpg", "sunset.jpg", "map.png"]
```

---

## 10. Fonts

### `addFont(filename, data, mimeType)` → `this`

Embeds a font file. Reference it from a CSS `@font-face` rule inside a stylesheet you add via `addCSS`.

**Supported formats:** WOFF2 (recommended), WOFF, TTF, OTF.

```js
// Add the font file
const fontResponse = await fetch("OpenSans-Regular.woff2");
const fontData = await fontResponse.arrayBuffer();
book.addFont("OpenSans-Regular.woff2", fontData, "font/woff2");

// Reference it in CSS
book.addCSS("style.css", `
  @font-face {
    font-family: "Open Sans";
    font-style: normal;
    font-weight: 400;
    src: url("../fonts/OpenSans-Regular.woff2") format("woff2");
  }
  body { font-family: "Open Sans", sans-serif; }
`);
```

> **Note:** Font embedding increases EPUB file size. WOFF2 is the most compressed format — prefer it over TTF or OTF.

---

## 11. Sanitizer

The sanitizer runs automatically on every chapter's HTML (unless `sanitize: false` was set in the constructor or `opts.raw: true` was passed to `addChapter`). It converts HTML to EPUB-safe XHTML.

### What it keeps

All common content elements are preserved:

- **Structure:** `<section>`, `<article>`, `<div>`, `<header>`, `<footer>`, `<aside>`, `<main>`
- **Headings:** `<h1>` through `<h6>`
- **Paragraphs & text blocks:** `<p>`, `<blockquote>`, `<pre>`, `<hr>`, `<br>`
- **Inline text:** `<em>`, `<strong>`, `<b>`, `<i>`, `<u>`, `<s>`, `<span>`, `<mark>`, `<small>`, `<sup>`, `<sub>`, `<del>`, `<ins>`, `<abbr>`, `<cite>`, `<q>`, `<code>`, `<kbd>`, `<samp>`, `<var>`, `<time>`
- **Links:** `<a href="...">` — relative, `http://`, `https://`, and internal `#anchor` links all work
- **Images:** `<img src="..." alt="...">`, `<figure>`, `<figcaption>`, `<picture>`, `<source>`
- **Lists:** `<ul>`, `<ol>`, `<li>`, `<dl>`, `<dt>`, `<dd>`
- **Tables:** `<table>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`, `<th>`, `<td>`, `<caption>`, `<colgroup>`, `<col>` — including `colspan` and `rowspan`
- **Semantic / accessibility:** `<details>`, `<summary>`, `<ruby>`, `<rt>`, `<rp>`, `epub:type`, `role`, `aria-label`, `id`, `class`, `lang`

### What it strips

| Removed entirely (tag + content) | Tag stripped, children kept |
|---|---|
| `<script>` | Any tag not in the allowlist |
| `<style>` | |
| `<iframe>`, `<frame>`, `<frameset>` | |
| `<form>`, `<input>`, `<button>` | |
| `<object>`, `<embed>`, `<applet>` | |
| `<canvas>`, `<svg>` | |
| `<link>`, `<meta>`, `<base>` | |
| `<noscript>` | |

### URL validation

All `href`, `src`, `srcset`, and `cite` attributes are checked. The following are blocked:

- `javascript:` — XSS vector
- `vbscript:` — XSS vector
- `data:` URIs that are not `data:image/...`

`target="_blank"` is stripped (not valid in EPUB).

### Manual sanitization

You can sanitize HTML manually before passing it anywhere:

```js
// Instance method
const clean = book.sanitize(rawHtml);

// Static utility — no instance needed
const clean = EBook.sanitize(rawHtml);
```

### Disabling the sanitizer

```js
// Disable globally for the entire book (only do this with fully trusted HTML)
const book = new EBook({ sanitize: false });

// Disable for one specific chapter
book.addChapter("Appendix", trustedXhtml, { raw: true });
```

---

## 12. Generating the EPUB

All generation methods are `async` and must be awaited.

### `download(filename?)` → `Promise<void>`

Generates the EPUB and triggers a browser download. The file dialog opens automatically.

```js
await book.download();             // filename: "my-book.epub" (slugified from title)
await book.download("dune.epub");  // custom filename
```

### `generate()` → `Promise<Blob>`

Returns the EPUB as a `Blob`. Use this when you need to handle the file yourself.

```js
const blob = await book.generate();

// Store it
const url = URL.createObjectURL(blob);

// Send it to a server
const form = new FormData();
form.append("file", blob, "book.epub");
await fetch("/upload", { method: "POST", body: form });
```

### `toBase64()` → `Promise<string>`

Returns the EPUB as a base64-encoded string. Useful for embedding or transmitting as JSON.

```js
const b64 = await book.toBase64();
// "UEsDBBQACAgIAA..."

// Store in localStorage, send over API, etc.
localStorage.setItem("myBook", b64);
```

### `toObjectURL()` → `Promise<string>`

Returns a temporary object URL you can assign to a link or iframe. Remember to revoke it when done.

```js
const url = await book.toObjectURL();

// Preview in an iframe
document.querySelector("iframe").src = url;

// Or as a download link
const link = document.createElement("a");
link.href     = url;
link.download = "book.epub";
link.textContent = "Download EPUB";
document.body.appendChild(link);

// Clean up when no longer needed
URL.revokeObjectURL(url);
```

---

## 13. Method Chaining

Every setter method returns `this`, so calls can be chained:

```js
const book = new EBook({ title: "My Book", author: "Me" })
  .addCSS("style.css", cssContent)
  .setCover(coverData, "image/jpeg")
  .addTOCPage({ title: "Contents" })
  .addChapter("One",   ch1Html, { css: ["style.css"] })
  .addChapter("Two",   ch2Html, { css: ["style.css"] })
  .addChapter("Three", ch3Html, { css: ["style.css"] });

await book.download();
```

---

## 14. Full Example

```js
// ── 1. Create the book ──────────────────────────────────────────────────────
const book = new EBook({
  title:       "The Midnight Garden",
  author:      "Elara Voss",
  language:    "en",
  publisher:   "Nightshade Press",
  description: "A story of secrets and seasons.",
  date:        "2024-06-01",
  rights:      "© 2024 Elara Voss. All rights reserved.",
});

// ── 2. Add a stylesheet ──────────────────────────────────────────────────────
book.addCSS("style.css", `
  body {
    font-family: Georgia, serif;
    font-size: 1em;
    line-height: 1.8;
    max-width: 36em;
    margin: 0 auto;
    padding: 2em 1.5em;
    color: #1a1a1a;
  }
  h1 { font-size: 1.6em; margin-top: 3em; text-align: center; }
  p  { margin: 0; text-indent: 1.5em; }
  p + p { margin-top: .8em; }
  blockquote {
    border-left: 3px solid #999;
    margin: 1.5em 0;
    padding: .5em 1em;
    color: #555;
    font-style: italic;
  }
  figure { text-align: center; margin: 2em 0; }
  figcaption { font-size: .85em; color: #777; margin-top: .5em; }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; margin: 1.5em 0; }
  th, td { border: 1px solid #ddd; padding: .5em 1em; text-align: left; }
  th { background: #f5f5f5; }
`);

// ── 3. Set the cover ─────────────────────────────────────────────────────────
// Assuming you have a base64 string or a File object from a file input:
book.setCover(coverBase64, "image/jpeg", "cover.jpg", {
  asPage:  true,
  altText: "Cover of The Midnight Garden",
});

// ── 4. Add a TOC page ────────────────────────────────────────────────────────
book.addTOCPage({ title: "Contents", css: ["style.css"] });

// ── 5. Add chapters ──────────────────────────────────────────────────────────
book.addChapter("Prologue", `
  <h1>Prologue</h1>
  <p>The garden had no name, only a gate that opened at midnight.</p>
`, { css: ["style.css"] });

book.addChapter("Chapter One: The Gate", `
  <h1>Chapter One: The Gate</h1>
  <p>She found it on the first night of autumn.</p>
  <figure>
    <img src="../images/gate.jpg" alt="An old iron gate in moonlight"/>
    <figcaption>The gate at midnight</figcaption>
  </figure>
  <p>The iron was cold under her fingers, slick with dew.</p>
  <blockquote>
    <p>What you find beyond the gate is what you carried with you all along.</p>
  </blockquote>
`, { css: ["style.css"] });

book.addChapter("Chapter Two: The Seasons", `
  <h1>Chapter Two: The Seasons</h1>
  <p>The garden changed. Every visit brought a different sky.</p>
  <table>
    <thead>
      <tr><th>Season</th><th>What grew</th><th>What faded</th></tr>
    </thead>
    <tbody>
      <tr><td>Spring</td><td>White roses</td><td>Frost</td></tr>
      <tr><td>Summer</td><td>Wildflowers</td><td>Shadows</td></tr>
      <tr><td>Autumn</td><td>Red leaves</td><td>Warmth</td></tr>
      <tr><td>Winter</td><td>Silence</td><td>Everything</td></tr>
    </tbody>
  </table>
`, { css: ["style.css"] });

// ── 6. Add an image asset ─────────────────────────────────────────────────────
book.addImage("gate.jpg", gateImageBlob, "image/jpeg");

// ── 7. Generate and download ──────────────────────────────────────────────────
await book.download("the-midnight-garden.epub");
```

---

## 15. HTML Elements Reference

Quick reference for what you can use inside chapter HTML.

### Text & Headings

```html
<h1>Chapter Title</h1>
<h2>Section</h2>
<h3>Subsection</h3>
<p>A paragraph of text.</p>
<p>Text with <em>italics</em>, <strong>bold</strong>, <mark>highlighted</mark>, <code>code</code>.</p>
<p>Footnote reference<sup>1</sup>. Chemical formula H<sub>2</sub>O.</p>
<p><del>Removed text</del> and <ins>inserted text</ins>.</p>
<p><abbr title="HyperText Markup Language">HTML</abbr> is the language of the web.</p>
<hr/>
<br/>
```

### Blockquote & Preformatted

```html
<blockquote cite="https://example.com/source">
  <p>To be or not to be.</p>
</blockquote>

<pre><code>function hello() {
  console.log("Hello, world!");
}</code></pre>
```

### Links

```html
<!-- External link -->
<a href="https://example.com">Visit example.com</a>

<!-- Internal anchor within the same chapter -->
<a href="#section-2">Jump to Section 2</a>
<h2 id="section-2">Section 2</h2>

<!-- Link to another chapter -->
<a href="../text/ch-2-chapter-two.xhtml">Go to Chapter Two</a>
```

> **Tip:** Chapter filenames follow the pattern `ch-<n>-<slugified-title>.xhtml`. Check auto-generated IDs using `book.getChapters()`.

### Images & Figures

```html
<!-- Simple image -->
<img src="../images/photo.jpg" alt="Description of photo"/>

<!-- Image with caption -->
<figure>
  <img src="../images/diagram.png" alt="A diagram" width="400"/>
  <figcaption>Figure 1.1: System overview</figcaption>
</figure>
```

### Lists

```html
<!-- Unordered -->
<ul>
  <li>Apples</li>
  <li>Oranges</li>
</ul>

<!-- Ordered -->
<ol start="3">
  <li>Third item</li>
  <li>Fourth item</li>
</ol>

<!-- Definition list -->
<dl>
  <dt>Spice</dt>
  <dd>A substance that extends life and expands consciousness.</dd>
</dl>
```

### Tables

```html
<table>
  <caption>Table 1: Comparison of formats</caption>
  <thead>
    <tr>
      <th scope="col">Format</th>
      <th scope="col">Size</th>
      <th scope="col">Quality</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>JPEG</td>
      <td>Small</td>
      <td>Lossy</td>
    </tr>
    <tr>
      <td colspan="2">PNG / WebP</td>
      <td>Lossless</td>
    </tr>
  </tbody>
</table>
```

### Semantic Structure

```html
<section epub:type="chapter">
  <h1>Chapter Title</h1>
  <p>Content...</p>
</section>

<aside>
  <p>A sidebar note or callout box.</p>
</aside>

<details>
  <summary>Expand for more detail</summary>
  <p>Hidden content revealed on interaction (reader support varies).</p>
</details>
```

---

## 16. EPUB Structure Reference

The generated EPUB contains the following file tree:

```
book.epub
├── mimetype                        (uncompressed — required by spec)
├── META-INF/
│   └── container.xml               (points to OEBPS/content.opf)
└── OEBPS/
    ├── content.opf                 (EPUB 3 package document — manifest + spine)
    ├── toc.ncx                     (EPUB 2 navigation — for legacy readers)
    ├── nav.xhtml                   (EPUB 3 navigation document)
    ├── styles/
    │   └── style.css               (your stylesheets)
    ├── fonts/
    │   └── OpenSans.woff2          (your fonts)
    ├── images/
    │   ├── cover.jpg               (cover image)
    │   └── photo.jpg               (chapter images)
    └── text/
        ├── cover.xhtml             (cover page — if asPage: true)
        ├── toc-page.xhtml          (human-readable TOC — if addTOCPage() called)
        ├── ch-1-prologue.xhtml     (chapter files)
        └── ch-2-chapter-one.xhtml
```

The spine order is always: **Cover page → TOC page → Chapters (in order)**.

---

## 17. Error Reference

| Error message | Cause | Fix |
|---|---|---|
| `epubJS.js: cannot generate — no chapters added.` | `generate()` or `download()` called with no chapters | Add at least one chapter with `addChapter()` before generating |
| `epubJS.js: chapter "id" not found` | `updateChapter()` called with an ID that doesn't exist | Check IDs with `getChapters()` |
| `epubJS.js: JSZip could not be loaded.` | CDN unreachable and JSZip not included manually | Add `<script src="jszip.min.js">` before `epubJS.js` |
| `epubJS.js: failed to load <url>` | Script injection failed (network error, CSP, etc.) | Include JSZip manually rather than relying on auto-injection |

---

*epubJS.js produces valid EPUB 3.0 files with EPUB 2 (NCX) backward compatibility. Tested against Calibre, Apple Books, Kobo, and Google Play Books.*
