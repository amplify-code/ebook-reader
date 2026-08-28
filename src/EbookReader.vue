<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import PanZ from '@thesoulfresh/pan-z';

/**
 * This component contains the bare minimum reader - the page spread, page-turn
 * animation, pinch/scroll zoom, next/prev chevrons, swipe and link hotspots,
 * plus colour overlay and grayscale filter.
 *
 * Surrounding chrome such as toolbars, branding, and page selection is left to
 * the host, which interacts with this component through `v-model:page`, the
 * `overlay-colour` / `grayscale` props, the events below and the exposed
 * methods: goToPage, next, prev, toggleZoom, resetZoom.
 *
 * The component fills its parent (100% width/height) and reflows to its own
 * container via a ResizeObserver, so the host controls layout, padding and
 * any fullscreen wrapper.
 */
const props = defineProps({
    /**
     * The book to display. Shape:
     * {
     *   name: string,
     *   page_count: number,
     *   page_ratio: number,   // width / height of a single page
     *   pages: [{ page_number, name, links: [{ type, destination, rect }] }],
     * }
     */
    book: {
        type: Object,
        required: true,
    },
    /**
     * Resolver that returns the image URL for a given 1-indexed page number.
     * @type {(page: number) => string}
     */
    pageImageUrl: {
        type: Function,
        required: true,
    },
    /** Current 1-indexed page (use with `v-model:page`). */
    page: {
        type: Number,
        default: 1,
    },
    /** CSS colour drawn over the pages as a reading overlay. */
    overlayColour: {
        type: String,
        default: '#ffffff00',
    },
    /** Render the pages in grayscale. */
    grayscale: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits([
    /** Two-way binding for the current page. */
    'update:page',
    /** The current page finished changing. Payload: the new 1-indexed page. */
    'page-change',
    /** A page became visible. Fired once per visible page (twice in spreads). */
    'page-view',
    /** A hotspot link was clicked. Payload: the link object. */
    'link-click',
    /** Zoom state changed. Payload: boolean (is the reader zoomed in?). */
    'zoom-change',
    /** Number of pages shown at once changed (1 or 2). */
    'spread-change',
]);

const container = ref(null);

const current = ref(props.page > 0 ? props.page : 1);
const newPage = ref(current.value);
const pagesToDisplay = ref(1);

const leftMap = ref([]);
const rightMap = ref([]);

const leftPageURL = ref('');
const rightPageURL = ref('');
const nextLeftPageURL = ref('');
const nextRightPageURL = ref('');

const loadingNewPages = ref(false);
const showNewPages = ref(false);
const pageTurningLeft = ref(false);
const pageTurningRight = ref(false);

const pageHeight = ref(0);
const pageWidth = ref(0);

const isZoomed = ref(false);

const pz = new PanZ({ minZoom: 1, bounds: 0.1, panEnabled: false });

let touchStartX = 0;
let touchStartY = 0;

const onTouchStart = (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
};

const onTouchEnd = (e) => {
    if (pz.scale !== 1) {
        return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) {
            next();
        } else {
            prev();
        }
    }
};

const imageURLForPage = (p) => props.pageImageUrl(p);

const logPageView = (p) => {
    if (pagesToDisplay.value == 2 && p != 1) {
        emit('page-view', p - 1);
    }
    emit('page-view', p);
};

const preloadPage = (p) => {
    return Promise.all([
        new Promise((resolve, reject) => {
            if (p > props.book.page_count) {
                resolve();
            } else {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = imageURLForPage(p);
            }
        }),
        new Promise((resolve, reject) => {
            if (p <= 1) {
                resolve();
            } else {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = imageURLForPage(p - 1);
            }
        }),
    ]).then(
        (result) => result,
        () => {
            location.reload();
        }
    );
};

const prev = () => {
    goToPage(current.value - pagesToDisplay.value);
};

const next = () => {
    goToPage(current.value + pagesToDisplay.value);
};

const goToPage = (p) => {
    pz.reset();

    if (pagesToDisplay.value == 2) {
        if (p % 2 == 0) {
            p++;
        }
    }

    if (p < 1) {
        return;
    }

    if (p > props.book.page_count + (pagesToDisplay.value - 1)) {
        return;
    }

    if (p === current.value) {
        return;
    }

    newPage.value = p;

    loadingNewPages.value = true;

    // Animate
    if (p < current.value) {
        pageTurningLeft.value = false;
        pageTurningRight.value = true;
    } else {
        pageTurningLeft.value = true;
        pageTurningRight.value = false;
    }

    var timedOut = false;
    var imagesLoaded = false;

    const completed = () => {
        current.value = p;
        emit('update:page', p);

        // Update main images
        leftPageURL.value = imageURLForPage(current.value - 1);
        rightPageURL.value = imageURLForPage(current.value);

        // Move back
        pageTurningLeft.value = false;
        pageTurningRight.value = false;

        showNewPages.value = false;

        updateLinks();
        logPageView(current.value);
        emit('page-change', current.value);
    };

    setTimeout(() => {
        timedOut = true;

        if (imagesLoaded) {
            completed();
        }
    }, 600);

    preloadPage(p).then(() => {
        imagesLoaded = true;
        loadingNewPages.value = false;
        showNewPages.value = true;

        // Update background images
        nextLeftPageURL.value = imageURLForPage(p - 1);
        nextRightPageURL.value = imageURLForPage(p);

        if (timedOut) {
            completed();
        }
    });
};

const clickLink = (link) => {
    emit('link-click', link);

    if (link.type === 'GoTo') {
        goToPage(link.destination + 1);
    } else if (link.type === 'URI') {
        if (link.destination.includes('http')) {
            window.open(link.destination, '_blank');
        } else {
            window.open('https://' + link.destination, '_blank');
        }
    }
};

const resize = () => {
    const el = container.value;
    if (!el) {
        return;
    }
    const containerWidth = el.offsetWidth;
    const containerHeight = el.offsetHeight;

    if (containerWidth / 2 / containerHeight > props.book.page_ratio) {
        pagesToDisplay.value = 2;
    } else {
        pagesToDisplay.value = 1;
    }

    if (containerWidth / pagesToDisplay.value / containerHeight > props.book.page_ratio) {
        pageHeight.value = containerHeight;
        pageWidth.value = props.book.page_ratio * containerHeight;
    } else {
        pageWidth.value = containerWidth / pagesToDisplay.value;
        pageHeight.value = pageWidth.value / props.book.page_ratio;
    }

    if (current.value > 1 && pagesToDisplay.value == 2 && current.value % 2 == 0) {
        current.value++;
        emit('update:page', current.value);
    }
};

const updateLinks = () => {
    const leftLinks = props.book.pages[current.value - 2]?.links ?? [];
    const rightLinks = props.book.pages[current.value - 1]?.links ?? [];

    const scale = 2500 / pageHeight.value;

    const mapLink = (link) => ({
        rect: {
            x: Math.min(link.rect[0], link.rect[2]) / scale,
            y: Math.min(link.rect[1], link.rect[3]) / scale,
            w: Math.abs(link.rect[2] - link.rect[0]) / scale,
            h: Math.abs(link.rect[3] - link.rect[1]) / scale,
        },
        destination: link.destination,
        type: link.type,
    });

    leftMap.value = leftLinks.map(mapLink);
    rightMap.value = rightLinks.map(mapLink);
};

const toggleZoom = (scale = 1) => {
    if (pz.scale <= scale) {
        pz.zoomTo(2 * scale);
        pz.enablePan();
        isZoomed.value = true;
    } else {
        pz.reset();
        pz.disablePan();
        isZoomed.value = false;
    }
};

const resetZoom = () => {
    pz.reset();
    pz.disablePan();
    isZoomed.value = false;
};

// Reflect zoom state to the host.
watch(isZoomed, (value) => emit('zoom-change', value));
watch(pagesToDisplay, (value) => emit('spread-change', value));

// Jump when the host changes the page externally (e.g. its own page input).
watch(
    () => props.page,
    (value) => {
        if (value !== current.value) {
            goToPage(value);
        }
    }
);

let resizeObserver = null;

onMounted(() => {
    resize();

    if (current.value > 1) {
        leftPageURL.value = imageURLForPage(current.value - 1);
    }
    rightPageURL.value = imageURLForPage(current.value);

    updateLinks();
    emit('spread-change', pagesToDisplay.value);
    logPageView(current.value);

    pz.init(container.value);
    pz.on('end', () => {
        if (pz.scale == 1) {
            isZoomed.value = false;
            pz.center();
            pz.disablePan();
        } else {
            isZoomed.value = true;
            pz.enablePan();
        }
    });

    resizeObserver = new ResizeObserver(() => {
        resize();
        updateLinks();
    });
    resizeObserver.observe(container.value);
});

onBeforeUnmount(() => {
    if (resizeObserver) {
        resizeObserver.disconnect();
    }
    if (typeof pz.destroy === 'function') {
        pz.destroy();
    }
});

defineExpose({ goToPage, next, prev, toggleZoom, resetZoom });
</script>

<template>
    <div
        ref="container"
        class="relative w-full h-full overflow-hidden"
        @touchstart="onTouchStart"
        @touchend="onTouchEnd"
    >
        <!-- Page turning overlay -->
        <div
            class="absolute"
            :style="{
                'width': pagesToDisplay > 1 ? pageWidth * 2 + 'px' : pageWidth + 'px',
                'height': pageHeight + 'px',
                'left': 'calc(50% - ' + (pageWidth * pagesToDisplay) / 2 + 'px)',
                'top': 'calc(50% - ' + pageHeight / 2 + 'px)',
            }"
            :class="{ 'grayscale': grayscale }"
        >
            <div
                v-if="loadingNewPages"
                class="shadow-md absolute left-0 flex justify-center align-middle bg-gray-100"
                :style="{ 'width': pageWidth + 'px', 'height': pageHeight + 'px' }"
            >
                <svg class="size-10 mx-auto my-auto animate-spin" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z" /></svg>
            </div>
            <div
                v-if="loadingNewPages"
                class="shadow-md absolute right-0 flex justify-center align-middle bg-gray-100"
                :style="{ 'width': pageWidth + 'px', 'height': pageHeight + 'px' }"
            >
                <svg class="size-10 mx-auto my-auto animate-spin" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z" /></svg>
            </div>
            <img
                v-if="showNewPages && newPage !== 1 && pagesToDisplay > 1"
                class="shadow-md absolute left-0"
                :style="{ 'width': pageWidth + 'px', 'height': pageHeight + 'px' }"
                :src="nextLeftPageURL"
            >
            <img
                v-if="showNewPages && newPage <= book.page_count"
                class="shadow-md absolute right-0"
                :style="{ 'width': pageWidth + 'px', 'height': pageHeight + 'px' }"
                :src="nextRightPageURL"
            >
        </div>

        <!-- Main page container -->
        <div
            class="absolute"
            :style="{
                'width': pagesToDisplay > 1 ? pageWidth * 2 + 'px' : pageWidth + 'px',
                'height': pageHeight + 'px',
                'left': 'calc(50% - ' + (pageWidth * pagesToDisplay) / 2 + 'px)',
                'top': 'calc(50% - ' + pageHeight / 2 + 'px)',
            }"
            :class="{
                'page-turn-left': pageTurningLeft,
                'page-turn-right': pageTurningRight,
                'grayscale': grayscale,
            }"
        >
            <img
                v-if="current !== 1 && pagesToDisplay > 1"
                class="shadow-md absolute left-0"
                :style="{ 'width': pageWidth + 'px', 'height': pageHeight + 'px' }"
                :src="leftPageURL"
            >
            <img
                v-if="current <= book.page_count"
                class="shadow-md absolute right-0"
                :style="{ 'width': pageWidth + 'px', 'height': pageHeight + 'px' }"
                :src="rightPageURL"
            >
        </div>

        <!-- Colour filter overlay -->
        <div
            class="absolute pointer-events-none"
            :style="{
                'width': pagesToDisplay > 1 && current !== 1 && (current < book.page_count || book.page_count % 2 === 1) ? pageWidth * 2 + 'px' : pageWidth + 'px',
                'height': pageHeight + 'px',
                'left': current === 1 && pagesToDisplay === 2 ? '50%' : 'calc(50% - ' + (pageWidth * pagesToDisplay) / 2 + 'px)',
                'top': 'calc(50% - ' + pageHeight / 2 + 'px)',
                'background-color': overlayColour,
            }"
        >
        </div>

        <!-- Links -->
        <div
            v-if="current !== 1 && pagesToDisplay > 1"
            class="absolute"
            :style="{
                'width': pageWidth + 'px',
                'height': pageHeight + 'px',
                'right': '50%',
                'top': 'calc(50% - ' + pageHeight / 2 + 'px)',
            }"
        >
            <button
                v-for="(link, index) in leftMap"
                :key="current + '.' + index"
                class="absolute link-flash hover:bg-blue-300/50"
                :style="{
                    'width': link.rect.w + 'px',
                    'height': link.rect.h + 'px',
                    'left': link.rect.x + 'px',
                    'top': link.rect.y + 'px',
                }"
                @click.stop.prevent="clickLink(link)"
            >&nbsp;</button>
        </div>
        <div
            v-if="current < book.page_count"
            class="absolute"
            :style="{
                'width': pageWidth + 'px',
                'height': pageHeight + 'px',
                'left': pagesToDisplay > 1 ? '50%' : 'calc(50% - ' + pageWidth / 2 + 'px)',
                'top': 'calc(50% - ' + pageHeight / 2 + 'px)',
            }"
        >
            <button
                v-for="(link, index) in rightMap"
                :key="current + '.' + index"
                class="absolute link-flash hover:bg-blue-300/50"
                :style="{
                    'width': link.rect.w + 'px',
                    'height': link.rect.h + 'px',
                    'left': link.rect.x + 'px',
                    'top': link.rect.y + 'px',
                }"
                @click.stop.prevent="clickLink(link)"
            >&nbsp;</button>
        </div>
    </div>

    <!-- Buttons -->
    <div class="text-stone-100 w-24 flex justify-start align-middle fixed left-0 my-auto top-1/2 -mt-16 [@media(hover:none)]:hidden">
        <svg v-if="page !== 1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="cursor-pointer w-24 h-24 my-auto" @click.stop.prevent="prev">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
    </div>
    <div class="text-stone-100 w-24 flex justify-end align-middle fixed right-0 top-1/2 -mt-16 [@media(hover:none)]:hidden">
        <svg v-if="page < book.page_count" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="cursor-pointer w-24 h-24 my-auto" @click.stop.prevent="next">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
    </div>
</template>

<style scoped>
.link-flash {
    animation: flash 1.8s ease-in-out;
}

.page-turn-left {
    animation: pageLeft 0.6s ease-in forwards;
}

.page-turn-right {
    animation: pageRight 0.6s ease-in forwards;
}

@keyframes flash {
    0% { background-color: transparent; }
    15% { background-color: rgb(147 197 253 / 0.5); }
    25% { background-color: transparent; }
    30% { background-color: rgb(147 197 253 / 0.5); }
    100% { background-color: transparent; }
}

@keyframes pageLeft {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%) scaleX(0); }
}

@keyframes pageRight {
    0% { transform: translateX(0); }
    100% { transform: translateX(50%) scaleX(0); }
}
</style>
