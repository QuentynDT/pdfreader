<template>
  <div class="card">
    <div class="controls">
      <button @click="prevPage" :disabled="pageNum <= 1">⬅ Prev</button>
      <span>Page {{ pageNum }} / {{ numPages }}</span>
      <button @click="nextPage" :disabled="pageNum >= numPages">Next ➡</button>
      <button @click="zoomOut" :disabled="scale <= 0.5">🔍 -</button>
      <button @click="zoomIn">🔍 +</button>
      <input
        type="text"
        v-model="searchText"
        @keyup.enter="fullSearch"
        placeholder="Search in PDF"
      />
      <button @click="fullSearch" :disabled="!searchText">Search</button>
      <button @click="downloadPdf" :disabled="!pdfUrl">⬇ Download</button>
    </div>
    <div class="main-container">
      <div class="sidebar" v-if="outline.length">
        <h4>Bookmarks</h4>
        <ul>
          <li v-for="(item, index) in outline" :key="index">
            <button @click="goToOutline(item)">{{ item.title }}</button>
          </li>
        </ul>
      </div>
      <div class="pdf-container" ref="pdfContainer">
        <canvas ref="pdfCanvas"></canvas>
        <div ref="textLayer" class="text-layer"></div>
      </div>
    </div>
    <div v-if="loading" class="loading">Loading PDF...</div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue';

let PDFJS = null;
let pdfjsInitialized = false;
let currentRenderTask = null;
const pageRendering = ref(false);
const pageNumPending = ref(null);

const initPDFJS = async () => {
  if (pdfjsInitialized && PDFJS) return PDFJS;
  try {
    if (window.pdfjsLib) {
      window.pdfjsLib = null;
      delete window.pdfjsLib;
    }
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
      if (script.src && script.src.includes('pdf')) script.remove();
    });
    const script = document.createElement('script');
    const timestamp = Date.now();
    script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.min.js?t=${timestamp}`;
    script.type = 'text/javascript';
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
    await new Promise((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = (error) => reject(new Error('Failed to load PDF.js script'));
      setTimeout(() => reject(new Error('PDF.js script load timeout')), 10000);
    });
    let attempts = 0;
    while (!window.pdfjsLib && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (!window.pdfjsLib) throw new Error('PDF.js library not available after loading');
    PDFJS = window.pdfjsLib;
    PDFJS.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js?t=${timestamp}`;
    if (PDFJS.GlobalWorkerOptions) PDFJS.GlobalWorkerOptions.isEvalSupported = false;
    pdfjsInitialized = true;
    return PDFJS;
  } catch (error) {
    console.error('Failed to initialize PDF.js:', error);
    pdfjsInitialized = false;
    throw error;
  }
};

const props = defineProps({ pdfUrl: { type: String, default: null } });
const pdfDoc = ref(null);
const pageNum = ref(1);
const numPages = ref(0);
const scale = ref(1.0);
const searchText = ref('');
const outline = ref([]);
const loading = ref(false);
const error = ref('');
const pdfCanvas = ref(null);
const textLayer = ref(null);
const pdfContainer = ref(null);

const renderPage = async (num) => {
  if (pageRendering.value) {
    pageNumPending.value = num;
    return;
  }
  pageRendering.value = true;
  try {
    if (!pdfDoc.value) throw new Error('PDF document not loaded');
    if (num < 1 || num > numPages.value) throw new Error(`Invalid page number: ${num}`);
    error.value = '';
    const canvas = pdfCanvas.value;
    if (!canvas) throw new Error('Canvas element not found');
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    let page;
    try {
      const pagePromise = pdfDoc.value.getPage(num);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Page load timeout')), 5000));
      page = await Promise.race([pagePromise, timeoutPromise]);
      if (!page) throw new Error('Page is null');
    } catch (pageError) {
      console.error('Error getting page:', pageError);
      if (pageError.message && pageError.message.includes('private member')) {
        error.value = 'PDF rendering error detected. Attempting to reload...';
        setTimeout(() => loadPdf(), 1000);
        return;
      }
      throw pageError;
    }
    const viewport = page.getViewport({ scale: scale.value });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Set the pdf-container size to match the canvas
    const pdfContainerEl = pdfContainer.value;
    if (pdfContainerEl) {
      pdfContainerEl.style.width = viewport.width + 'px';
      pdfContainerEl.style.height = viewport.height + 'px';
    }

    const renderContext = { canvasContext: context, viewport: viewport, enableWebGL: false, renderInteractiveForms: false };
    if (currentRenderTask) {
      try { currentRenderTask.cancel(); } catch (e) {}
      currentRenderTask = null;
    }
    currentRenderTask = page.render(renderContext);
    await currentRenderTask.promise;
    currentRenderTask = null;
    await renderTextLayer(page, viewport);
  } catch (renderError) {
    console.error('Error rendering page:', renderError);
    if (renderError.name === 'RenderingCancelledException') return;
    error.value = `Error rendering page ${num}: ${renderError.message}`;
  } finally {
    pageRendering.value = false;
    if (pageNumPending.value !== null) {
      const nextPage = pageNumPending.value;
      pageNumPending.value = null;
      renderPage(nextPage);
    }
  }
};


const renderTextLayer = async (page, viewport) => {
  const textLayerDiv = textLayer.value;
  if (!textLayerDiv) return;
  textLayerDiv.innerHTML = '';
  textLayerDiv.style.left = '0px';
  textLayerDiv.style.top = '0px';
  textLayerDiv.style.width = viewport.width + 'px';
  textLayerDiv.style.height = viewport.height + 'px';

  try {
    const textContent = await page.getTextContent();
    const searchTerm = searchText.value?.toLowerCase();
    const highlightAll = !!searchTerm && searchResult.value?.page === page;

    textContent.items.forEach((item) => {
      if (item.str && item.str.trim()) {
        const div = document.createElement('div');
        div.textContent = item.str;
        div.style.position = 'absolute';
        div.style.left = item.transform[4] + 'px';
        div.style.top = (viewport.height - item.transform[5]) + 'px';
        div.style.fontSize = Math.abs(item.transform[0]) + 'px';
        div.style.fontFamily = item.fontName || 'sans-serif';
        div.style.opacity = '0.2';
        div.style.color = 'transparent';
        div.style.cursor = 'text';
        if (highlightAll && item.str.toLowerCase().includes(searchTerm)) {
          const highlight = document.createElement('div');
          highlight.style.position = 'absolute';
          highlight.style.left = item.transform[4] + 'px';
          highlight.style.top = (viewport.height - item.transform[5]) + 'px';
          highlight.style.width = (Math.abs(item.transform[0]) * item.str.length * 0.6) + 'px';
          highlight.style.height = Math.abs(item.transform[3]) + 'px';
          highlight.style.backgroundColor = 'rgba(255, 255, 0, 0.6)';
          highlight.style.borderRadius = '2px';
          highlight.style.pointerEvents = 'none';
          textLayerDiv.appendChild(highlight);
        }

        textLayerDiv.appendChild(div);
      }
    });
  } catch (error) {
    console.warn('Error rendering text layer:', error);
  }
};


const loadPdf = async () => {
  if (!props.pdfUrl) {
    pdfDoc.value = null;
    numPages.value = 0;
    pageNum.value = 1;
    outline.value = [];
    error.value = '';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const pdfjsLib = await initPDFJS();
    if (!pdfjsLib) throw new Error('PDF.js library failed to initialize');
    let documentSource;
    if (props.pdfUrl.startsWith('blob:')) {
      const response = await fetch(props.pdfUrl);
      if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      documentSource = { data: new Uint8Array(arrayBuffer) };
    } else {
      documentSource = { url: props.pdfUrl };
    }
    const loadingOptions = {
      ...documentSource,
      verbosity: 0,
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
      stopAtErrors: false
    };
    const loadingTask = pdfjsLib.getDocument(loadingOptions);
    loadingTask.onProgress = (progressData) => {
      if (progressData.total) {
        const percent = Math.round((progressData.loaded / progressData.total) * 100);
        console.log(`Loading progress: ${percent}%`);
      }
    };
    const pdf = await loadingTask.promise;
    if (!pdf || !pdf.numPages) throw new Error('Invalid PDF document');
    pdfDoc.value = pdf;
    numPages.value = pdf.numPages;
    try {
      const outlineData = await pdf.getOutline();
      outline.value = outlineData || [];
    } catch (outlineError) {
      console.warn('Could not load outline:', outlineError);
      outline.value = [];
    }
    pageNum.value = 1;
    await nextTick();
    setTimeout(async () => {
      try { await renderPage(1); } catch (renderError) {
        console.error('Error rendering first page:', renderError);
        error.value = `Error rendering first page: ${renderError.message}`;
      }
    }, 500);
  } catch (err) {
    console.error('Error loading PDF:', err);
    let errorMessage = 'Failed to load PDF';
    if (err.name === 'InvalidPDFException') errorMessage = 'Invalid PDF file';
    else if (err.name === 'MissingPDFException') errorMessage = 'PDF file not found';
    else if (err.name === 'PasswordException') errorMessage = 'Password protected PDF';
    else if (err.message) errorMessage = err.message;
    error.value = errorMessage;
  } finally {
    loading.value = false;
  }
};

const nextPage = async () => {
  if (pageNum.value < numPages.value) {
    pageNum.value++;
    await renderPage(pageNum.value);
  }
};

const prevPage = async () => {
  if (pageNum.value > 1) {
    pageNum.value--;
    await renderPage(pageNum.value);
  }
};

const zoomIn = async () => {
  scale.value += 0.25;
  await renderPage(pageNum.value);
};

const zoomOut = async () => {
  if (scale.value > 0.5) {
    scale.value -= 0.25;
    await renderPage(pageNum.value);
  }
};

const searchResult = ref(null); 

const fullSearch = async () => {
  searchResult.value = null;
  if (!searchText.value || !pdfDoc.value) return;
  loading.value = true;
  try {
    for (let i = 1; i <= numPages.value; i++) {
      try {
        const page = await pdfDoc.value.getPage(i);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: scale.value });
        const text = textContent.items.map(item => item.str).join(' ');
        if (text.toLowerCase().includes(searchText.value.toLowerCase())) {
          pageNum.value = i;
          searchResult.value = { page, textContent, viewport };
          await renderPage(i);
          return;
        }
      } catch (pageError) {
        console.warn(`Error searching page ${i}:`, pageError);
        continue;
      }
    }
    searchResult.value = null;
    if (error.value) error.value = 'Text not found in document';
  } catch (error) {
    console.error('Error during search:', error);
    error.value = 'Error occurred during search';
  } finally {
    loading.value = false;
  }
};


const downloadPdf = () => {
  if (!props.pdfUrl) return;
  const link = document.createElement('a');
  link.href = props.pdfUrl;
  link.download = `downloaded_pdf_${Date.now()}.pdf`;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const goToOutline = async (item) => {
  if (!pdfDoc.value || !item.dest) return;
  try {
    let dest = item.dest;
    if (typeof dest === 'string') dest = await pdfDoc.value.getDestination(dest);
    if (dest && dest.length > 0) {
      const pageIndex = await pdfDoc.value.getPageIndex(dest[0]);
      pageNum.value = pageIndex + 1;
      await renderPage(pageNum.value);
    }
  } catch (error) {
    console.error('Error navigating to outline:', error);
  }
};

watch(() => props.pdfUrl, (newUrl, oldUrl) => {
  if (newUrl !== oldUrl) loadPdf();
}, { immediate: true });

watch(scale, async () => {
  if (pdfDoc.value && pageNum.value) await renderPage(pageNum.value);
});

onMounted(async () => {
  try {
    await initPDFJS();
    if (props.pdfUrl) await loadPdf();
  } catch (error) {
    error.value = 'Failed to initialize PDF.js library';
    console.error('PDF.js initialization error:', error);
  }
});

onBeforeUnmount(() => {
  if (currentRenderTask) {
    try { currentRenderTask.cancel(); } catch (e) {}
    currentRenderTask = null;
  }
});
</script>

<style>
.card {
  background: #fff;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.controls {
  display: flex;
  gap: 10px;
  padding: 15px;
  background: #555;
  border-bottom: 1px solid #fff;
  align-items: center;
  flex-wrap: wrap;
}
.controls button {
  padding: 5px 10px;
  color: #222;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
  border-radius: 3px;
}
.controls button:hover:not(:disabled) {
  background: #e9e9e9;
}
.controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.controls input {
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 3px;
}
.main-container {
  display: flex;
  flex: 1;
  overflow: auto;
  border-top: 1px solid #fff;
}
.sidebar {
  width: 200px;
  background: #ddd;
  border-right: 1px solid #dee2e6;
  padding: 15px;
  overflow-y: auto;
}
.sidebar h4 {
  margin: 0 0 10px 0;
  color: #444;
}
.sidebar ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.sidebar li {
  margin-bottom: 5px;
}
.sidebar button {
  width: 100%;
  text-align: left;
  padding: 4px 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 3px;
  color: #0077cc;
}
.sidebar button:hover {
  background: #e9e9e9;
}
.pdf-container {
  position: relative;
  background: #555;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0; /* Remove padding to fit canvas exactly */
  margin: auto; /* Center the container */
  box-sizing: border-box;
}
.pdf-container canvas {
  background: white;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
  display: block;
  margin: 0 auto;
}
.text-layer {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  opacity: 0.2;
  line-height: 1.0;
  pointer-events: none;
}
.text-layer > div {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
}
.loading, .error {
  padding: 20px;
  text-align: center;
  font-size: 16px;
}
.error {
  color: red;
  background: #ffe6e6;
  border: 1px solid #ffcccc;
  border-radius: 4px;
  margin: 10px;
}
.loading {
  color: #666;
}
</style>
