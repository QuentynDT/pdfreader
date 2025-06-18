<template>
  <div class="pdf-viewer-container" @wheel="handleWheelZoom">
    <div v-if="loading" class="message-text">
      Loading PDF...
    </div>
    <div v-if="error" class="message-text error-message">
      Error loading PDF: {{ error.message }}
    </div>
    <pdf-embed
      :source="pdfPath"
      :scale="scale"
      @rendered="handlePdfRendered"
      @error="handlePdfError"
      class="pdf-embed-element"
    />
  </div>
</template>
<script>
import PdfEmbed from 'vue-pdf-embed';
export default {
  components: { PdfEmbed },
  props: {
    pdfPath: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      loading: true,
      error: null,
      scale: 1.0
    };
  },
  methods: {
    handlePdfRendered() {
      this.loading = false;
      this.error = null;
      console.log('PDF successfully rendered!');
    },
    handlePdfError(event) {
      this.loading = false;
      this.error = event;
      console.error('Failed to load PDF:', event);
    },
    zoomIn() {
      console.log('Before zoomIn, scale:', this.scale);
      this.scale = Math.min(this.scale + 0.25, 4.0);
      console.log('After zoomIn, scale:', this.scale);
    },
    zoomOut() {
      console.log('Before zoomOut, scale:', this.scale);
      this.scale = Math.max(this.scale - 0.25, 0.25);
      console.log('After zoomOut, scale:', this.scale);
    },
    handleWheelZoom(event) {
      if (event.ctrlKey) {
        event.preventDefault();
        const zoomFactor = 0.1;

        if (event.deltaY < 0) {
          // Zoom in
          this.scale = Math.min(this.scale + zoomFactor, 4.0);
        } else {
          // Zoom out
          this.scale = Math.max(this.scale - zoomFactor, 0.25);
        }
        console.log('Touchpad zoom, new scale:', this.scale);
      }
    }
  },
  mounted() {
    console.log('PdfViewer mounted with path:', this.pdfPath);
    console.log('Initial scale on mount:', this.scale);
  }
}
</script>

<style scoped>
.pdf-viewer-container {
  min-height: 400px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);
  background-color: #f9fafb;
  padding: 0.5rem;
}

.zoom-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.zoom-button {
  background-color: #3b82f6;
  color: #fff;
  font-weight: 700;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  transition: all 300ms ease-in-out;
  border: none;
  cursor: pointer;
}

.zoom-button:hover {
  background-color: #2563eb;
}

.zoom-percentage {
  font-size: 1.125rem;
  font-weight: 600;
  color: #000;
}

.message-text {
  text-align: center;
  color: #4b5563;
  padding: 2rem;
}

.error-message {
  color: #ef4444;
}

.pdf-embed-element {
  border-radius: 0.375rem;
  width: 100%;
  height: auto;
  max-width: 100%;
}
</style>
