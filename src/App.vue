<template>
  <div class="app-container">
    <div class="white-card">
      <header class="app-header">
        <h1 class="main-title">PDF Viewer App</h1>
      </header>
      <main class="app-main">
        <PdfInput @pdf-selected="handlePdfSelected" />
        <div v-if="selectedPdfUrl" class="pdf-viewer-container">
          <PdfViewer :pdfUrl="selectedPdfUrl" />
        </div>
        <div v-else class="no-pdf-message">
          <p>No PDF selected. Please choose a PDF file to view.</p>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import PdfInput from './components/PdfInput.vue';
import PdfViewer from './components/PdfViewer.vue';

const selectedPdfUrl = ref(null);

const handlePdfSelected = (pdfUrl) => {
  selectedPdfUrl.value = pdfUrl;
};
</script>

<style>
body {
  margin: 0;
  font-family: "Inter", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #000033;
}
.app-container {
  padding: 1rem;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.white-card {
  max-width: 56rem;
  margin: auto;
  background-color: #fff;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  border-radius: 0.5rem;
  padding: 1.5rem;
  width: 100%;
}
.app-header {
  text-align: center;
  padding: 1rem;
}
.main-title {
  font-size: 1.875rem;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 1.5rem;
}
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.pdf-viewer-container {
  flex: 1;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  background-color: #fff;
  width: 100%;
  overflow: hidden;
  box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);
}
.no-pdf-message {
  padding: 3rem;
  text-align: center;
  color: #666;
  font-size: 1.1rem;
  background: #f8f9fa;
  border-radius: 0.5rem;
  margin-top: 1rem;
  border: 1px dashed #dee2e6;
}
</style>
