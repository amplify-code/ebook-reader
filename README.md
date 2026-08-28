# @amplify-code/ebook-reader

A headless Vue 3 **ebook reader**. It renders a book as a page-turning spread
with pinch/scroll zoom, swipe and clickable link hotspots, plus optional
colour-overlay and grayscale layers. All surrounding chrome is left to the
host application.

The reader fills its parent (100% width/height) and reflows to its own container
via a `ResizeObserver`, so the host controls all layout, padding and any
fullscreen wrapper.

The only JS runtime dependency is
[`@thesoulfresh/pan-z`](https://www.npmjs.com/package/@thesoulfresh/pan-z)
(pan/zoom), plus Vue 3 as a peer.

## Requirements

Styled with **Tailwind CSS** utility classes, so the host project must run
Tailwind and be configured to see the component. Add the package to your
`tailwind.config.js` `content` globs:

```js
content: [
    // …your app globs…
    './node_modules/@amplify-code/ebook-reader/src/**/*.vue',
],
```

## Install

```bash
npm install @amplify-code/ebook-reader @thesoulfresh/pan-z
```

Or copy the `src/` folder into your project.

## Usage

Give the reader a sized parent and build your own controls around it:

```vue
<script setup>
import { ref } from 'vue';
import { EbookReader } from '@amplify-code/ebook-reader';

const reader = ref(null);
const page = ref(1);
const overlayColour = ref('#ffffff00');
const grayscale = ref(false);

const book = { /* see "Book shape" below */ };
const pageImageUrl = (p) => `/books/my-book/pages/${p}`;
</script>

<template>
    <div class="reader-layout">
        <!-- Your toolbar -->
        <header>
            <button @click="reader.prev()">‹ Prev</button>
            <span>Page {{ page }} / {{ book.page_count }}</span>
            <button @click="reader.next()">Next ›</button>
            <button @click="reader.toggleZoom()">Zoom</button>
        </header>

        <!-- The reading surface (needs a sized container) -->
        <main style="flex: 1; min-height: 0;">
            <EbookReader
                ref="reader"
                v-model:page="page"
                :book="book"
                :page-image-url="pageImageUrl"
                :overlay-colour="overlayColour"
                :grayscale="grayscale"
                @page-view="(p) => {/* analytics */}"
                @link-click="(link) => {/* … */}"
            />
        </main>
    </div>
</template>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `book` | `Object` | — (required) | The book to display. See **Book shape**. |
| `pageImageUrl` | `(page: number) => string` | — (required) | Resolver for a page's full-size image URL (1-indexed). |
| `page` | `Number` | `1` | Current 1-indexed page. Use with `v-model:page`. |
| `overlayColour` | `String` | `'#ffffff00'` | CSS colour drawn over the pages as a reading overlay. |
| `grayscale` | `Boolean` | `false` | Render the pages in grayscale. |

Setting `page` (via `v-model` or directly) animates to that page, so the host's
own page input, contents list or search results just assign to it — or call
`goToPage()`.

## Events

| Event | Payload | When |
| --- | --- | --- |
| `update:page` | `page: number` | The current page changed (drives `v-model:page`). |
| `page-change` | `page: number` | A page turn finished. |
| `page-view` | `page: number` | A page became visible. Fires once per visible page (twice for a spread). Use for analytics. |
| `link-click` | `link` | A hotspot link was clicked (both `GoTo` and `URI` types). |
| `zoom-change` | `zoomed: boolean` | The reader zoomed in or out. |
| `spread-change` | `count: number` | The number of pages shown at once changed (1 or 2). |

`spread-change` is handy for a host page-label like "12 – 13" that needs to know
whether one or two pages are visible.

## Exposed methods (via template ref)

| Method | Description |
| --- | --- |
| `goToPage(page)` | Turn to a 1-indexed page (animated). |
| `next()` / `prev()` | Turn forward / back by one spread. |
| `toggleZoom(scale = 1)` | Toggle zoom relative to the given base scale. |
| `resetZoom()` | Return to fit-to-page. |

## Book shape

```js
{
    page_count: 24,
    page_ratio: 0.7071,   // page width / height used for layout
    pages: [
        {
            page_number: 1,
            name: '1',    // label the host can show; the reader does not use it
            links: [
                // rect is [x1, y1, x2, y2] in a 2500px-tall coordinate space
                { type: 'GoTo', destination: 4, rect: [100, 200, 300, 260] },
                { type: 'URI', destination: 'https://example.com', rect: [/* … */] },
            ],
        },
        // …
    ],
}
```

Link `rect` coordinates are interpreted against a 2500px-tall page; the reader
scales them to the rendered page size. `GoTo.destination` is a 0-indexed page
index; `URI.destination` is a URL (a missing scheme is treated as `https://`).

Fields like `name`, `toc` and `thumbnail_directory` are the host's business —
the reader itself only needs `page_count`, `page_ratio` and `pages[].links`.
