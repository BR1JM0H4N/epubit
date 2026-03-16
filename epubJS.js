/**
 * epubJS — Client-side EPUB 3 builder library
 * Features: full HTML sanitizer, cover page, hard-coded TOC page, images, tables, links, CSS
 *
 * Usage:
 *   const book = new EBook({ title: "My Book", author: "Jane Doe" });
 *   book.addCSS("style.css", "body { font-family: serif; }");
 *   book.setCover(base64Img, "image/jpeg", "cover.jpg", { asPage: true });
 *   book.addTOCPage();
 *   book.addChapter("Chapter One", "<p>Hello world</p>", { css: ["style.css"] });
 *   await book.download();
 */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.EBook = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  "use strict";

  /* ═══════════════════════════════════════════════════════════════
     CONSTANTS & CDN
  ═══════════════════════════════════════════════════════════════ */

  const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

  /* ═══════════════════════════════════════════════════════════════
     SANITIZER  — allowlist-based, EPUB-safe
     Preserves: headings, paragraphs, tables, images, links,
                lists, blockquotes, code, figures, semantic tags
     Strips:    script, style, form, iframe, object, embed
     Fixes:     self-closing tags, relative hrefs, epub:type attr
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Tags that are allowed in EPUB XHTML bodies.
   * Maps tagName → set of allowed attributes (null = any of the global ones).
   */
  const ALLOWED_TAGS = {
    /* structural */
    section: null, article: null, aside: null, main: null,
    header: null, footer: null, nav: null, div: null,
    /* block text */
    p: null, h1: null, h2: null, h3: null, h4: null, h5: null, h6: null,
    blockquote: ["cite"], pre: null, hr: null, br: null,
    details: null, summary: null,
    /* inline text */
    span: null, em: null, strong: null, b: null, i: null, u: null,
    s: null, del: ["cite", "datetime"], ins: ["cite", "datetime"],
    sup: null, sub: null, mark: null, small: null, abbr: ["title"],
    cite: null, q: ["cite"], dfn: ["title"], kbd: null, samp: null,
    code: null, var: null, time: ["datetime"],
    /* ruby */
    ruby: null, rt: null, rp: null,
    /* links */
    a: ["href", "rel", "epub:type", "title", "id"],
    /* images / media */
    img: ["src", "alt", "width", "height", "title"],
    figure: null, figcaption: null, picture: null,
    source: ["srcset", "media", "type", "src"],
    /* lists */
    ul: null, ol: ["start", "reversed", "type"], li: ["value"], dl: null, dt: null, dd: null,
    /* tables */
    table: ["summary", "border", "cellpadding", "cellspacing"],
    caption: null, colgroup: ["span"], col: ["span", "width"],
    thead: null, tbody: null, tfoot: null,
    tr: null,
    th: ["colspan", "rowspan", "headers", "scope", "abbr"],
    td: ["colspan", "rowspan", "headers"],
  };

  /** Global attributes allowed on every element */
  const GLOBAL_ATTRS = new Set([
    "id", "class", "lang", "dir", "title", "epub:type",
    "xml:lang", "data-type", "role", "aria-label", "aria-describedby",
  ]);

  /** Attributes that carry URLs — will be validated */
  const URL_ATTRS = new Set(["href", "src", "srcset", "cite"]);

  /** Tags that are void in XHTML (must be self-closed) */
  const VOID_TAGS = new Set(["img", "br", "hr", "input", "meta", "link", "col", "source"]);

  /**
   * Sanitize and convert an HTML string to EPUB-safe XHTML.
   *
   * @param {string} html     Raw HTML body content.
   * @returns {string}        Sanitized inner body HTML string (not a full document).
   */
  function sanitize(html) {
    if (!html || typeof html !== "string") return "";

    // Parse with DOMParser to get a real DOM tree
    const doc = new DOMParser().parseFromString(
      `<html><body>${html}</body></html>`, "text/html"
    );

    function processNode(node) {
      // Text node — XML-escape and return
      if (node.nodeType === Node.TEXT_NODE) {
        return escXml(node.textContent);
      }

      // Comment — strip
      if (node.nodeType === Node.COMMENT_NODE) {
        return "";
      }

      // Only element nodes from here
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const tag = node.tagName.toLowerCase();

      // Hard-blocked tags — drop tag AND all content
      const BLOCK_ALL = new Set(["script", "style", "link", "meta", "form",
        "iframe", "frame", "frameset", "object", "embed",
        "applet", "base", "noscript", "canvas", "svg"]);
      if (BLOCK_ALL.has(tag)) return "";

      // Unknown / not in allowlist — drop tag but keep children
      if (!(tag in ALLOWED_TAGS)) {
        return Array.from(node.childNodes).map(processNode).join("");
      }

      // Build attribute string
      const allowedExtra = ALLOWED_TAGS[tag]; // null = only globals, or string array
      const attrParts = [];

      for (const attr of node.attributes) {
        const name  = attr.name.toLowerCase();
        const value = attr.value;

        // Check if attribute is allowed
        const isGlobal  = GLOBAL_ATTRS.has(name);
        const isTagSpec = allowedExtra !== null &&
                          Array.isArray(allowedExtra) &&
                          allowedExtra.includes(name);

        if (!isGlobal && !isTagSpec) continue;

        // Validate URL attributes
        if (URL_ATTRS.has(name)) {
          if (!isSafeUrl(value)) continue;
        }

        // Remove target="_blank" etc. — not valid in EPUB
        if (name === "target") continue;

        attrParts.push(`${name}="${escAttr(value)}"`);
      }

      const attrStr = attrParts.length ? " " + attrParts.join(" ") : "";

      // Recurse into children
      const children = Array.from(node.childNodes).map(processNode).join("");

      // Void elements
      if (VOID_TAGS.has(tag)) {
        return `<${tag}${attrStr}/>`;
      }

      return `<${tag}${attrStr}>${children}</${tag}>`;
    }

    const body = doc.body;
    return Array.from(body.childNodes).map(processNode).join("");
  }

  /** Check if a URL is safe for EPUB (allows relative, data:image, http/https, epub:) */
  function isSafeUrl(url) {
    if (!url) return false;
    const trimmed = url.trim().toLowerCase();
    // Block javascript:, vbscript:, data: (except data:image)
    if (trimmed.startsWith("javascript:")) return false;
    if (trimmed.startsWith("vbscript:"))   return false;
    if (trimmed.startsWith("data:") && !trimmed.startsWith("data:image")) return false;
    return true;
  }


  /* ═══════════════════════════════════════════════════════════════
     XML / STRING UTILITIES
  ═══════════════════════════════════════════════════════════════ */

  function escXml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slugify(str) {
    return String(str)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }


  /* ═══════════════════════════════════════════════════════════════
     XHTML PAGE BUILDER
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Wrap sanitized body HTML in a full EPUB3-valid XHTML document.
   *
   * @param {string}   title
   * @param {string}   bodyHtml     Sanitized inner body content.
   * @param {string[]} [cssPaths]   Relative filenames of stylesheets.
   * @returns {string}
   */
  function buildXhtml(title, bodyHtml, cssPaths = []) {
    const styleLinks = cssPaths
      .map(p => `    <link rel="stylesheet" type="text/css" href="../styles/${escAttr(p)}"/>`)
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="en" lang="en">
  <head>
    <meta charset="UTF-8"/>
    <title>${escXml(title)}</title>
${styleLinks ? styleLinks + "\n" : ""}  </head>
  <body>
${bodyHtml}
  </body>
</html>`;
  }


  /* ═══════════════════════════════════════════════════════════════
     MISC HELPERS
  ═══════════════════════════════════════════════════════════════ */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`) && typeof JSZip !== "undefined") {
        return resolve();
      }
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`epubJS: failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  function inferMime(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    const map = {
      jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg",
      png: "image/png",  gif: "image/gif",
      svg: "image/svg+xml", webp: "image/webp", avif: "image/avif",
      mp3: "audio/mpeg", mp4: "video/mp4", m4a: "audio/mp4",
      css: "text/css",   js: "application/javascript",
      woff: "font/woff", woff2: "font/woff2",
      ttf: "font/ttf",   otf: "font/otf",
    };
    return map[ext] || "application/octet-stream";
  }

  async function normaliseData(data) {
    if (data instanceof Blob)        return data.arrayBuffer();
    if (data instanceof ArrayBuffer) return data;
    return data; // assume base64 string
  }


  /* ═══════════════════════════════════════════════════════════════
     EBook CLASS
  ═══════════════════════════════════════════════════════════════ */

  class EBook {

    /* ──────────────────────────────────────────────────────────────
       CONSTRUCTOR
    ────────────────────────────────────────────────────────────── */

    /**
     * @param {object} [options]
     * @param {string} [options.title="Untitled"]
     * @param {string} [options.author="Unknown"]
     * @param {string} [options.language="en"]
     * @param {string} [options.publisher]
     * @param {string} [options.description]
     * @param {string} [options.date]          ISO date  "YYYY-MM-DD"
     * @param {string} [options.uuid]          Custom book UUID
     * @param {string} [options.rights]        Copyright string
     * @param {boolean} [options.sanitize=true] Auto-sanitize chapter HTML
     */
    constructor(options = {}) {
      this._meta = {
        title:       options.title       || "Untitled",
        author:      options.author      || "Unknown",
        language:    options.language    || "en",
        publisher:   options.publisher   || "",
        description: options.description || "",
        date:        options.date        || new Date().toISOString().split("T")[0],
        uuid:        options.uuid        || uuid(),
        rights:      options.rights      || "",
      };

      this._autoSanitize = options.sanitize !== false;

      this._chapters     = [];  // { id, title, filename, rawHtml, css[], order, _type }
      this._images       = [];  // { filename, data, mimeType }
      this._stylesheets  = [];  // { filename, content }
      this._fonts        = [];  // { filename, data, mimeType }
      this._cover        = null;
      this._includeToc   = false;
      this._tocOpts      = {};
      this._chapterIdx   = 0;
      this._coverAsPage  = false;
    }


    /* ──────────────────────────────────────────────────────────────
       METADATA
    ────────────────────────────────────────────────────────────── */

    /**
     * Update any metadata field after construction.
     * @param {object} meta  Same keys as constructor options.
     * @returns {EBook} this
     */
    setMeta(meta = {}) {
      Object.assign(this._meta, meta);
      return this;
    }

    /** @returns {object} Copy of current metadata */
    getMeta() { return { ...this._meta }; }


    /* ──────────────────────────────────────────────────────────────
       COVER
    ────────────────────────────────────────────────────────────── */

    /**
     * Set the book cover image.
     *
     * @param {string|ArrayBuffer|Blob} data      Image data (base64, ArrayBuffer, or Blob).
     * @param {string}  [mimeType="image/jpeg"]
     * @param {string}  [filename="cover.jpg"]
     * @param {object}  [opts]
     * @param {boolean} [opts.asPage=true]         Insert a cover page as the first spine item.
     * @param {string}  [opts.altText="Cover"]     Alt text for the cover <img>.
     * @returns {EBook} this
     *
     * @example
     *   book.setCover(base64str, "image/jpeg", "cover.jpg", { asPage: true });
     */
    setCover(data, mimeType = "image/jpeg", filename = "cover.jpg", opts = {}) {
      this._cover = {
        filename,
        data,
        mimeType,
        altText: opts.altText || "Cover",
      };
      // Default asPage = true (most readers expect a visible cover page)
      this._coverAsPage = opts.asPage !== false;
      return this;
    }

    /** Remove cover. @returns {EBook} this */
    removeCover() {
      this._cover      = null;
      this._coverAsPage = false;
      return this;
    }


    /* ──────────────────────────────────────────────────────────────
       TABLE OF CONTENTS PAGE
    ────────────────────────────────────────────────────────────── */

    /**
     * Enable a hard-coded, human-readable TOC page inside the book spine.
     * It is automatically placed after the cover (if any) and before the first chapter.
     *
     * @param {object} [opts]
     * @param {string} [opts.title="Table of Contents"]    Heading text.
     * @param {string[]} [opts.css]                        Stylesheet filenames to link.
     * @param {string}  [opts.inlineStyle]                 Extra inline <style> block.
     * @returns {EBook} this
     *
     * @example
     *   book.addTOCPage({ title: "Contents", css: ["style.css"] });
     */
    addTOCPage(opts = {}) {
      this._includeToc = true;
      this._tocOpts    = opts;
      return this;
    }

    /** Remove the TOC page. @returns {EBook} this */
    removeTOCPage() {
      this._includeToc = false;
      this._tocOpts    = {};
      return this;
    }


    /* ──────────────────────────────────────────────────────────────
       CHAPTERS
    ────────────────────────────────────────────────────────────── */

    /**
     * Add a chapter.
     * The HTML is sanitized automatically (unless opts.raw = true or sanitize:false in constructor).
     *
     * @param {string} title           Chapter title (shown in TOC).
     * @param {string} html            Body HTML. May contain tables, images, links, lists, etc.
     * @param {object} [opts]
     * @param {string}   [opts.id]     Explicit item id (auto-generated if omitted).
     * @param {number}   [opts.order]  Insert position index (default: append).
     * @param {string[]} [opts.css]    Stylesheet filenames to link.
     * @param {boolean}  [opts.raw]    Skip sanitizer for this chapter only.
     * @returns {EBook} this
     *
     * @example
     *   book.addChapter("Chapter 1", "<h1>Begin</h1><p>Text…</p>", { css: ["style.css"] });
     */
    addChapter(title, html, opts = {}) {
      const id  = opts.id || `ch-${++this._chapterIdx}-${slugify(title) || this._chapterIdx}`;

      this._chapters.push({
        id,
        title,
        rawHtml: html,
        order:   opts.order ?? this._chapters.length,
        css:     opts.css   || [],
        raw:     opts.raw   || false,
        _type:   "chapter",
      });

      this._chapters.sort((a, b) => a.order - b.order);
      return this;
    }

    /**
     * Update a chapter's title and/or HTML.
     * @param {string} id
     * @param {string} [title]
     * @param {string} [html]
     * @returns {EBook} this
     */
    updateChapter(id, title, html) {
      const ch = this._chapters.find(c => c.id === id);
      if (!ch) throw new Error(`epubJS: chapter "${id}" not found`);
      if (title !== undefined) ch.title   = title;
      if (html  !== undefined) ch.rawHtml = html;
      return this;
    }

    /**
     * Remove a chapter by id.
     * @param {string} id
     * @returns {EBook} this
     */
    removeChapter(id) {
      this._chapters = this._chapters.filter(c => c.id !== id);
      return this;
    }

    /**
     * Reorder chapters by providing an array of ids in the new desired order.
     * @param {string[]} idArray
     * @returns {EBook} this
     *
     * @example
     *   book.reorderChapters(["ch-3", "ch-1", "ch-2"]);
     */
    reorderChapters(idArray) {
      idArray.forEach((id, i) => {
        const ch = this._chapters.find(c => c.id === id);
        if (ch) ch.order = i;
      });
      this._chapters.sort((a, b) => a.order - b.order);
      return this;
    }

    /** @returns {object[]} Chapters list (id, title, order) */
    getChapters() {
      return this._chapters.map(({ id, title, order }) => ({ id, title, order }));
    }


    /* ──────────────────────────────────────────────────────────────
       IMAGES
    ────────────────────────────────────────────────────────────── */

    /**
     * Add an image asset.
     * Reference in chapter HTML as:  <img src="../images/photo.jpg" alt="…"/>
     *
     * @param {string} filename              e.g. "photo.jpg"
     * @param {string|ArrayBuffer|Blob} data
     * @param {string} [mimeType]            Inferred from extension if omitted.
     * @returns {EBook} this
     */
    addImage(filename, data, mimeType) {
      mimeType = mimeType || inferMime(filename);
      // Replace if already exists
      this._images = this._images.filter(i => i.filename !== filename);
      this._images.push({ filename, data, mimeType });
      return this;
    }

    /** Remove image by filename. @returns {EBook} this */
    removeImage(filename) {
      this._images = this._images.filter(i => i.filename !== filename);
      return this;
    }

    /** @returns {string[]} List of added image filenames */
    getImages() {
      return this._images.map(i => i.filename);
    }


    /* ──────────────────────────────────────────────────────────────
       STYLESHEETS
    ────────────────────────────────────────────────────────────── */

    /**
     * Add a CSS stylesheet. Refer to it in addChapter via opts.css: ["style.css"].
     * @param {string} filename   e.g. "style.css"
     * @param {string} content    Raw CSS text.
     * @returns {EBook} this
     */
    addCSS(filename, content) {
      this._stylesheets = this._stylesheets.filter(s => s.filename !== filename);
      this._stylesheets.push({ filename, content });
      return this;
    }

    /** Remove a stylesheet. @returns {EBook} this */
    removeCSS(filename) {
      this._stylesheets = this._stylesheets.filter(s => s.filename !== filename);
      return this;
    }


    /* ──────────────────────────────────────────────────────────────
       FONTS
    ────────────────────────────────────────────────────────────── */

    /**
     * Embed a font file.
     * @param {string} filename              e.g. "OpenSans.woff2"
     * @param {string|ArrayBuffer|Blob} data
     * @param {string} [mimeType]            Inferred from extension if omitted.
     * @returns {EBook} this
     */
    addFont(filename, data, mimeType) {
      mimeType = mimeType || inferMime(filename);
      this._fonts = this._fonts.filter(f => f.filename !== filename);
      this._fonts.push({ filename, data, mimeType });
      return this;
    }


    /* ──────────────────────────────────────────────────────────────
       SANITIZER (public)
    ────────────────────────────────────────────────────────────── */

    /**
     * Sanitize an HTML string manually (useful before passing to addChapter with raw:true).
     * @param {string} html
     * @returns {string}
     */
    sanitize(html) {
      return sanitize(html);
    }


    /* ──────────────────────────────────────────────────────────────
       GENERATION
    ────────────────────────────────────────────────────────────── */

    /**
     * Build the EPUB as a Blob.
     * @returns {Promise<Blob>}
     */
    async generate() {
      await this._ensureJSZip();

      if (!this._chapters.length) {
        throw new Error("epubJS: cannot generate — no chapters added.");
      }

      const zip   = new JSZip();
      const oebps = zip.folder("OEBPS");

      /* 1 ── mimetype (STORE, uncompressed — EPUB spec requires this) */
      zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

      /* 2 ── META-INF */
      zip.folder("META-INF").file("container.xml", this._buildContainer());

      /* 3 ── Stylesheets */
      const stylesFolder = oebps.folder("styles");
      for (const s of this._stylesheets) {
        stylesFolder.file(s.filename, s.content);
      }

      /* 4 ── Fonts */
      const fontsFolder = oebps.folder("fonts");
      for (const f of this._fonts) {
        fontsFolder.file(f.filename, await normaliseData(f.data),
          { base64: typeof f.data === "string" });
      }

      /* 5 ── Images */
      const imagesFolder = oebps.folder("images");
      for (const img of this._images) {
        imagesFolder.file(img.filename, await normaliseData(img.data),
          { base64: typeof img.data === "string" });
      }

      /* 6 ── Cover image */
      if (this._cover) {
        imagesFolder.file(
          this._cover.filename,
          await normaliseData(this._cover.data),
          { base64: typeof this._cover.data === "string" }
        );
      }

      /* 7 ── Cover XHTML page */
      if (this._cover && this._coverAsPage) {
        oebps.folder("text").file("cover.xhtml", this._buildCoverXhtml());
      }

      /* 8 ── TOC XHTML page (hard-coded, navigable) */
      if (this._includeToc) {
        oebps.folder("text").file("toc-page.xhtml", this._buildTocPageXhtml());
      }

      /* 9 ── Chapter XHTML files */
      const textFolder = oebps.folder("text");
      for (const ch of this._chapters) {
        const body  = (this._autoSanitize && !ch.raw) ? sanitize(ch.rawHtml) : ch.rawHtml;
        const xhtml = buildXhtml(ch.title, body, ch.css);
        textFolder.file(`${ch.id}.xhtml`, xhtml);
      }

      /* 10 ── OPF package document */
      oebps.file("content.opf", this._buildOpf());

      /* 11 ── NCX (EPUB 2 compat) */
      oebps.file("toc.ncx", this._buildNcx());

      /* 12 ── Navigation document (EPUB 3) */
      oebps.file("nav.xhtml", this._buildNav());

      return zip.generateAsync({
        type: "blob",
        mimeType: "application/epub+zip",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
    }

    /**
     * Generate the EPUB and trigger a browser download.
     * @param {string} [filename]  Defaults to "<slugified-title>.epub"
     * @returns {Promise<void>}
     */
    async download(filename) {
      const blob = await this.generate();
      const name = filename || `${slugify(this._meta.title) || "book"}.epub`;
      triggerDownload(blob, name);
    }

    /**
     * Generate and return as a base64-encoded string.
     * Useful when you need to transmit or store the EPUB as text.
     * @returns {Promise<string>}
     */
    async toBase64() {
      const blob = await this.generate();
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = () => resolve(r.result.split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }

    /**
     * Generate and return as an object URL (useful to set as <a href> or <iframe src>).
     * Remember to call URL.revokeObjectURL() when done.
     * @returns {Promise<string>}
     */
    async toObjectURL() {
      const blob = await this.generate();
      return URL.createObjectURL(blob);
    }


    /* ──────────────────────────────────────────────────────────────
       PRIVATE BUILDERS
    ────────────────────────────────────────────────────────────── */

    _buildContainer() {
      return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf"
              media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    }

    _buildOpf() {
      const m = this._meta;
      const manifest = [];
      const spine    = [];

      /* Nav & NCX */
      manifest.push(`<item id="nav" href="nav.xhtml"
            media-type="application/xhtml+xml" properties="nav"/>`);
      manifest.push(`<item id="ncx" href="toc.ncx"
            media-type="application/x-dtbncx+xml"/>`);

      /* Cover image */
      if (this._cover) {
        manifest.push(`<item id="cover-image" href="images/${escAttr(this._cover.filename)}"
            media-type="${escAttr(this._cover.mimeType)}" properties="cover-image"/>`);
      }

      /* Cover page */
      if (this._cover && this._coverAsPage) {
        manifest.push(`<item id="cover-page" href="text/cover.xhtml"
            media-type="application/xhtml+xml"/>`);
        spine.push(`<itemref idref="cover-page" linear="yes"/>`);
      }

      /* TOC page */
      if (this._includeToc) {
        manifest.push(`<item id="toc-page" href="text/toc-page.xhtml"
            media-type="application/xhtml+xml"/>`);
        spine.push(`<itemref idref="toc-page" linear="yes"/>`);
      }

      /* Stylesheets */
      this._stylesheets.forEach((s, i) => {
        manifest.push(`<item id="css-${i}" href="styles/${escAttr(s.filename)}"
            media-type="text/css"/>`);
      });

      /* Fonts */
      this._fonts.forEach((f, i) => {
        manifest.push(`<item id="font-${i}" href="fonts/${escAttr(f.filename)}"
            media-type="${escAttr(f.mimeType)}"/>`);
      });

      /* Images */
      this._images.forEach((img, i) => {
        manifest.push(`<item id="img-${i}" href="images/${escAttr(img.filename)}"
            media-type="${escAttr(img.mimeType)}"/>`);
      });

      /* Chapters */
      this._chapters.forEach(ch => {
        manifest.push(`<item id="${escAttr(ch.id)}" href="text/${escAttr(ch.id)}.xhtml"
            media-type="application/xhtml+xml"/>`);
        spine.push(`<itemref idref="${escAttr(ch.id)}"/>`);
      });

      return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf"
         xmlns:dc="http://purl.org/dc/elements/1.1/"
         version="3.0"
         unique-identifier="uid">
  <metadata>
    <dc:identifier id="uid">urn:uuid:${m.uuid}</dc:identifier>
    <dc:title>${escXml(m.title)}</dc:title>
    <dc:creator id="creator">${escXml(m.author)}</dc:creator>
    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
    <dc:language>${escXml(m.language)}</dc:language>
    ${m.publisher   ? `<dc:publisher>${escXml(m.publisher)}</dc:publisher>` : ""}
    ${m.description ? `<dc:description>${escXml(m.description)}</dc:description>` : ""}
    ${m.rights      ? `<dc:rights>${escXml(m.rights)}</dc:rights>` : ""}
    <dc:date>${escXml(m.date)}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
    <meta name="generator" content="epubJS"/>
  </metadata>
  <manifest>
    ${manifest.join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${spine.join("\n    ")}
  </spine>
</package>`;
    }

    _buildNcx() {
      const m      = this._meta;
      let   order  = 1;
      const points = [];

      if (this._cover && this._coverAsPage) {
        points.push(`
  <navPoint id="cover-page" playOrder="${order++}">
    <navLabel><text>Cover</text></navLabel>
    <content src="text/cover.xhtml"/>
  </navPoint>`);
      }

      if (this._includeToc) {
        const tocTitle = this._tocOpts.title || "Table of Contents";
        points.push(`
  <navPoint id="toc-page" playOrder="${order++}">
    <navLabel><text>${escXml(tocTitle)}</text></navLabel>
    <content src="text/toc-page.xhtml"/>
  </navPoint>`);
      }

      this._chapters.forEach(ch => {
        points.push(`
  <navPoint id="${ch.id}" playOrder="${order++}">
    <navLabel><text>${escXml(ch.title)}</text></navLabel>
    <content src="text/${ch.id}.xhtml"/>
  </navPoint>`);
      });

      return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN"
  "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${m.uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escXml(m.title)}</text></docTitle>
  <navMap>${points.join("")}
  </navMap>
</ncx>`;
    }

    _buildNav() {
      const items = [];

      if (this._cover && this._coverAsPage) {
        items.push(`      <li><a href="text/cover.xhtml">Cover</a></li>`);
      }
      if (this._includeToc) {
        const t = this._tocOpts.title || "Table of Contents";
        items.push(`      <li><a href="text/toc-page.xhtml">${escXml(t)}</a></li>`);
      }
      this._chapters.forEach(ch => {
        items.push(`      <li><a href="text/${ch.id}.xhtml">${escXml(ch.title)}</a></li>`);
      });

      return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="en" lang="en">
  <head><meta charset="UTF-8"/><title>Table of Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Table of Contents</h1>
      <ol>
${items.join("\n")}
      </ol>
    </nav>
  </body>
</html>`;
    }

    /** Full XHTML page for the cover image */
    _buildCoverXhtml() {
      const alt = escAttr(this._cover.altText || "Cover");
      const src = `../images/${escAttr(this._cover.filename)}`;

      return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="en" lang="en">
  <head>
    <meta charset="UTF-8"/>
    <title>Cover</title>
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
      .cover-wrap { display: flex; align-items: center; justify-content: center;
                    width: 100%; height: 100%; background: #000; }
      .cover-wrap img { max-width: 100%; max-height: 100%;
                        object-fit: contain; display: block; }
    </style>
  </head>
  <body epub:type="cover">
    <div class="cover-wrap">
      <img src="${src}" alt="${alt}"/>
    </div>
  </body>
</html>`;
    }

    /** Hard-coded TOC XHTML page inserted into the spine */
    _buildTocPageXhtml() {
      const opts  = this._tocOpts;
      const title = opts.title || "Table of Contents";
      const css   = opts.css   || [];

      const styleLinks = css
        .map(p => `    <link rel="stylesheet" type="text/css" href="../styles/${escAttr(p)}"/>`)
        .join("\n");

      const inlineStyle = opts.inlineStyle ? `<style>${opts.inlineStyle}</style>` : "";

      const defaultStyle = `
    <style>
      body  { font-family: serif; max-width: 40em; margin: 3em auto; padding: 0 1em; }
      h1    { font-size: 1.6em; border-bottom: 1px solid #ccc; padding-bottom: .4em; }
      ol    { padding-left: 1.5em; }
      li    { margin: .5em 0; font-size: 1.05em; }
      a     { color: #1a1a1a; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .ch-num { color: #888; font-size: .85em; margin-right: .5em; }
    </style>`;

      const entries = this._chapters.map((ch, i) =>
        `      <li>
        <a href="${escAttr(ch.id)}.xhtml">
          <span class="ch-num">${i + 1}.</span>${escXml(ch.title)}
        </a>
      </li>`
      ).join("\n");

      return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="en" lang="en">
  <head>
    <meta charset="UTF-8"/>
    <title>${escXml(title)}</title>
${styleLinks ? styleLinks + "\n" : ""}${inlineStyle || defaultStyle}
  </head>
  <body epub:type="bodymatter">
    <section epub:type="toc">
      <h1>${escXml(title)}</h1>
      <ol>
${entries}
      </ol>
    </section>
  </body>
</html>`;
    }

    async _ensureJSZip() {
      if (typeof JSZip !== "undefined") return;
      await loadScript(JSZIP_CDN);
      if (typeof JSZip === "undefined") {
        throw new Error("epubJS: JSZip could not be loaded. Please include it manually.");
      }
    }
  }

  /* expose sanitize as a static utility */
  EBook.sanitize = sanitize;

  return EBook;
});
