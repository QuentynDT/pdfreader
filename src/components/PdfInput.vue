<template>
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
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'

const currentPdfUrl = ref(null)
const emit = defineEmits(['pdf-selected'])

const handleFileChange = (event) => {
  const file = event.target.files[0]
  if (file && file.type === 'application/pdf') {
    if (currentPdfUrl.value) URL.revokeObjectURL(currentPdfUrl.value)
    currentPdfUrl.value = URL.createObjectURL(file)
    emit('pdf-selected', currentPdfUrl.value)
  } else {
    if (currentPdfUrl.value) URL.revokeObjectURL(currentPdfUrl.value)
    currentPdfUrl.value = null
    emit('pdf-selected', null)
  }
}

onBeforeUnmount(() => {
  if (currentPdfUrl.value) URL.revokeObjectURL(currentPdfUrl.value)
})
</script>

<style>
.input-section {
  padding: 1.5rem;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  border-radius: 0.5rem 0.5rem 0 0;
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
  padding: 0.5rem;
  font-size: 0.875rem;
  color: #6b7280;
  background-color: #fff;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  cursor: pointer;
  line-height: 1.5;
}
.file-input:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
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
}
.file-input::-webkit-file-upload-button:hover {
  background-color: #dbeafe;
}
.file-info-text {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #6b7280;
}
</style>
