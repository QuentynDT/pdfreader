<template>
  <div class="app-container">
    <div class="white-card">
      <h1 class="main-title">
        PDF Viewer
      </h1>
      <div class="input-section">
        <label for="pdfUpload" class="file-label">
          Choose a PDF File:
        </label>
        <input
          type="file"
          id="pdfUpload"
          ref="pdfFileInput"
          @change="handleFileChange"
          accept="application/pdf"
          class="file-input"
        />
        <p class="file-info-text">
          Select a PDF file from your computer to view it below.
        </p>
      </div>

      <div v-if="selectedPdfUrl">
        <PdfViewer :pdfPath="selectedPdfUrl" />
      </div>
      <div v-else class="placeholder-message">
        Please select a PDF file to display.
      </div>
    </div>
  </div>
</template>

<script>
import PdfViewer from './components/PdfViewer.vue';

export default {
  components: {
    PdfViewer
  },
  data() {
    return {
      selectedPdfUrl: null
    };
  },
  methods: {
    handleFileChange(event) {
      const file = event.target.files[0];

      if (file && file.type === 'application/pdf') {
        if (this.selectedPdfUrl) {
          URL.revokeObjectURL(this.selectedPdfUrl);
        }
        this.selectedPdfUrl = URL.createObjectURL(file);
      } else {
        if (this.selectedPdfUrl) {
          URL.revokeObjectURL(this.selectedPdfUrl);
        }
        this.selectedPdfUrl = null;
        console.warn("Please select a valid PDF file.");
      }
    }
  },
  beforeUnmount() {
    if (this.selectedPdfUrl) {
      URL.revokeObjectURL(this.selectedPdfUrl);
    }
  }
}
</script>

<style>
body {
  margin: 0;
  font-family: "Inter", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-container {
  padding: 1rem;
  background-color: transparent;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.white-card {
  max-width: 56rem;
  margin-left: auto;
  margin-right: auto;
  background-color: #fff;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  border-radius: 0.5rem;
  overflow: hidden;
  padding: 1.5rem;
  width: 100%;
}

.main-title {
  font-size: 1.875rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 1.5rem;
  color: #1f2937;
}

.input-section {
  margin-bottom: 1.5rem;
}

.file-label {
  display: block;
  font-size: 1.125rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.file-input {
  display: block;
  width: 100%;
  font-size: 0.875rem;
  color: #6b7280;
  cursor: pointer;
  border-radius: 0.5rem;
  border: 1px solid #d1d5db;
  padding: 0.5rem;
}

.file-input::-webkit-file-upload-button {
  margin-right: 1rem;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  border: none;
  font-size: 0.875rem;
  font-weight: 600;
  background-color: #eff6ff;
  color: #1d4ed8;
  transition: background-color 0.15s ease-in-out;
}

.file-input::-webkit-file-upload-button:hover {
  background-color: #dbeafe;
}

.file-info-text {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.5rem;
}

.placeholder-message {
  text-align: center;
  color: #4b5563;
  padding: 2rem;
  border: 1px dashed #d1d5db;
  border-radius: 0.5rem;
}
</style>
