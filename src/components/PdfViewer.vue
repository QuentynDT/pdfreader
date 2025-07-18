<template>
  <div class="card">
    <div class="controls">
      <button @click="prevPage" :disabled="pageNum <= 1">Prev</button>
      <span>Page {{ pageNum }} / {{ numPages }}</span>
      <button @click="nextPage" :disabled="pageNum >= numPages">Next</button>
      <button @click="zoomOut" :disabled="scale <= 0.5">🔍-</button>
      <button @click="zoomIn">🔍+</button>
      <input
        type="text"
        v-model="searchText"
        @keyup.enter="fullSearch"
        placeholder="Search in PDF"
      />
      <button @click="fullSearch" :disabled="!searchText">Search</button>
      <button @click="prevMatch" :disabled="!allMatches.length || currentMatchIndex <= 0">Prev</button>
      <button @click="nextMatch" :disabled="!allMatches.length || currentMatchIndex >= allMatches.length - 1">Next</button>
      <span v-if="allMatches.length">{{ currentMatchIndex + 1 }} / {{ allMatches.length }}</span>
      <button @click="downloadPdf" :disabled="!pdfUrl">Download</button>
    </div>
    <div class="main-container">
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
const loading = ref(false);
const error = ref('');
const pdfCanvas = ref(null);
const textLayer = ref(null);
const pdfContainer = ref(null);
const allMatches = ref([]);
const currentMatchIndex = ref(0);

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

    const renderContext = { canvasContext: context, viewport: viewport, enableWebGL: false, renderInteractiveForms: false };

    if (currentRenderTask) {
      try { currentRenderTask.cancel(); } catch (e) { }
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
  textLayerDiv.style.width = `${viewport.width}px`;
  textLayerDiv.style.height = `${viewport.height}px`;

  try {
    const textContent = await page.getTextContent();
    const searchTerm = searchText.value?.toLowerCase();

    for (let i = 0; i < textContent.items.length; i++) {
      const item = textContent.items[i];

      const transform = PDFJS.Util.transform(viewport.transform, item.transform);

      const x = transform[4];
      const y_baseline_from_top = transform[5]; 
      const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);

      const textBlockTop = y_baseline_from_top - fontSize; 

      const textDiv = document.createElement('div');
      textDiv.textContent = item.str;
      textDiv.style.position = 'absolute';
      textDiv.style.left = `${x}px`;
      textDiv.style.top = `${textBlockTop}px`;
      textDiv.style.fontSize = `${fontSize}px`;
      textDiv.style.fontFamily = item.fontName || 'sans-serif';
      textDiv.style.whiteSpace = 'pre';
      textDiv.style.color = 'transparent';
      textDiv.style.pointerEvents = 'none';
      textLayerDiv.appendChild(textDiv);

      if (searchTerm && searchTerm.length > 0) {
        const itemText = item.str.toLowerCase();
        let matchIndex = itemText.indexOf(searchTerm);
        
        const dummyCanvas = document.createElement('canvas');
        const ctx = dummyCanvas.getContext('2d');
        ctx.font = `${fontSize}px ${item.fontName || 'sans-serif'}`;

        while (matchIndex !== -1) {
          const textBefore = item.str.slice(0, matchIndex);
          const matchText = item.str.slice(matchIndex, matchIndex + searchTerm.length);

          const leftOffset = ctx.measureText(textBefore).width;
          const matchWidth = ctx.measureText(matchText).width;

          const highlight = document.createElement('div');
          highlight.style.position = 'absolute';
          highlight.style.left = `${x + leftOffset}px`;
          highlight.style.top = `${textBlockTop + 2}px`;
          highlight.style.width = `${matchWidth}px`;
          highlight.style.height = `${fontSize}px`;
          highlight.style.pointerEvents = 'none';
          highlight.style.zIndex = '2';

          const matchGlobalIndex = allMatches.value.findIndex(m =>
            m.page === pageNum.value &&
            m.itemIndex === i &&
            m.charOffset === matchIndex
          );

          if (matchGlobalIndex === currentMatchIndex.value && pageNum.value === allMatches.value[currentMatchIndex.value]?.page) {
            highlight.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
            highlight.classList.add('current-highlight');
          } else if (matchGlobalIndex !== -1) {
            highlight.style.backgroundColor = 'rgba(255, 255, 0, 0.5)';
          } else {
            highlight.style.backgroundColor = 'rgba(255, 255, 0, 0.5)';
          }
          
          textLayerDiv.appendChild(highlight);
          matchIndex = itemText.indexOf(searchTerm, matchIndex + searchTerm.length);
        }
      }
    }
  } catch (err) {
    console.error('Error rendering text layer:', err);
  }
};

const loadPdf = async () => {
  if (!props.pdfUrl) {
    pdfDoc.value = null;
    numPages.value = 0;
    pageNum.value = 1;
    error.value = '';
    allMatches.value = [];
    currentMatchIndex.value = 0;
    return;
  }

  loading.value = true;
  error.value = '';
  allMatches.value = [];
  currentMatchIndex.value = 0;

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

const fullSearch = async () => {
  allMatches.value = [];
  currentMatchIndex.value = 0;

  if (!searchText.value || !pdfDoc.value) return;

  loading.value = true;
  const term = searchText.value.toLowerCase();
  const matches = [];

  try {
    for (let i = 1; i <= numPages.value; i++) {
      const page = await pdfDoc.value.getPage(i);
      const textContent = await page.getTextContent();
      
      for (let j = 0; j < textContent.items.length; j++) {
        const item = textContent.items[j];
        const itemText = item.str.toLowerCase();
        let matchIndex = itemText.indexOf(term);
        while (matchIndex !== -1) {
          matches.push({
            page: i,
            itemIndex: j,
            charOffset: matchIndex,
            str: item.str.substring(matchIndex, matchIndex + term.length)
          });
          matchIndex = itemText.indexOf(term, matchIndex + term.length);
        }
      }
    }

    if (matches.length) {
      allMatches.value = matches;
      currentMatchIndex.value = 0;
      pageNum.value = matches[0].page;
      await renderPage(pageNum.value);
      scrollToMatch();
    } else {
      error.value = 'Text not found in document';
    }
  } catch (err) {
    error.value = 'Search error: ' + err.message;
  } finally {
    loading.value = false;
  }
};

const nextMatch = async () => {
  if (!allMatches.value.length) return;

  let nextIndex = currentMatchIndex.value + 1;
  if (nextIndex >= allMatches.value.length) {
    nextIndex = 0;
  }

  currentMatchIndex.value = nextIndex;
  const match = allMatches.value[nextIndex];

  if (pageNum.value !== match.page) {
    pageNum.value = match.page;
    await renderPage(match.page);
  } else {
    await renderPage(pageNum.value);
  }
  scrollToMatch();
};

const prevMatch = async () => {
  if (!allMatches.value.length) return;

  let prevIndex = currentMatchIndex.value - 1;
  if (prevIndex < 0) {
    prevIndex = allMatches.value.length - 1;
  }

  currentMatchIndex.value = prevIndex;
  const match = allMatches.value[prevIndex];

  if (pageNum.value !== match.page) {
    pageNum.value = match.page;
    await renderPage(match.page);
  } else {
    await renderPage(pageNum.value);
  }
  scrollToMatch();
};

const scrollToMatch = () => {
  if (!allMatches.value.length || !pdfContainer.value || !textLayer.value) return;

  nextTick(() => {
    const textLayerDiv = textLayer.value;
    const greenHighlight = textLayerDiv.querySelector('.current-highlight'); 
    
    if (greenHighlight) {
      const pdfContainerRect = pdfContainer.value.getBoundingClientRect();
      const highlightRect = greenHighlight.getBoundingClientRect();

      const scrollX = highlightRect.left - pdfContainerRect.left + pdfContainer.value.scrollLeft - (pdfContainerRect.width / 2) + (highlightRect.width / 2);
      const scrollY = highlightRect.top - pdfContainerRect.top + pdfContainer.value.scrollTop - (pdfContainerRect.height / 2) + (highlightRect.height / 2);

      pdfContainer.value.scrollTo({
        left: scrollX,
        top: scrollY,
        behavior: 'smooth'
      });
    }
  });
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
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.controls {
  display: flex;
  gap: 10px;
  padding: 15px;
  background: #555;
  border-bottom: 1px solid #fff;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}

.controls button {
  height: 34px;
  padding: 5px 10px;
  color: #222;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
  border-radius: 3px;
  transition: background 0.2s ease;
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
  min-width: 50px;
}

.main-container {
  display: flex;
  flex: 1;
  overflow: auto;
  border-top: 1px solid #fff;
  background-color: #333;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
  box-sizing: border-box;
}

.pdf-container {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  box-sizing: border-box;
  background: #555;
  overflow: hidden;
  max-width: 100%;
  max-height: 100%;
  overflow: auto;
}

.pdf-container canvas {
  background: white;
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  display: block;
  border-radius: 5px;
}

.text-layer {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  opacity: 1.0;
  line-height: 1.0;
  pointer-events: none;
  z-index: 1;
}

.text-layer > div {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  box-sizing: border-box;
}

.loading, .error {
  padding: 20px;
  text-align: center;
  font-size: 16px;
  border-radius: 4px;
  margin: 10px;
}

.error {
  color: #c00;
  background: #ffebeb;
  border: 1px solid #fbb;
}

.loading {
  color: #007bff;
  background: #e6f7ff;
  border: 1px solid #b3e0ff;
}

.current-highlight {
  background-color: rgba(0, 255, 0, 0.5) !important;
}
</style>