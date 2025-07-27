/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GenerateVideosParameters, GoogleGenAI} from '@google/genai';

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>(async (resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

function downloadFile(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// DOM Elements
const upload = document.querySelector('#file-input') as HTMLInputElement;
const imagePreviewContainer = document.querySelector('#image-preview-container') as HTMLDivElement;
const imgEl = document.querySelector('#img') as HTMLImageElement;
const clearImageButton = document.querySelector('#clear-image-button') as HTMLButtonElement;
const promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
const generateButton = document.querySelector('#generate-button') as HTMLButtonElement;
const statusEl = document.querySelector('#status') as HTMLParagraphElement;
const loader = document.querySelector('.loader') as HTMLDivElement;
const videoOutput = document.querySelector('#video-output') as HTMLDivElement;
const video = document.querySelector('#video') as HTMLVideoElement;
const downloadButton = document.querySelector('#download-button') as HTMLButtonElement;
const quotaErrorEl = document.querySelector('#quota-error') as HTMLDivElement;

// App State
let base64data = '';
let prompt = '';
let videoObjectURL: string | null = null;

// UI Helpers
function setLoading(isLoading: boolean) {
  loader.style.display = isLoading ? 'block' : 'none';
  generateButton.disabled = isLoading;
  upload.disabled = isLoading;
  promptEl.disabled = isLoading;
}

type StatusType = 'loading' | 'success' | 'error' | 'default';

function setStatus(message: string, type: StatusType = 'default') {
  statusEl.innerText = message;
  statusEl.className = type;
}

async function generateContent(prompt: string, imageBytes: string): Promise<string> {
  // Initialize with API Key from environment variable
  const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

  const config: GenerateVideosParameters = {
    model: 'veo-2.0-generate-001',
    prompt,
    config: {
      numberOfVideos: 1,
    },
  };

  if (imageBytes) {
    config.image = {
      imageBytes,
      mimeType: 'image/png', // Assuming PNG, adjust if other types are used
    };
  }

  let operation = await ai.models.generateVideos(config);

  while (!operation.done) {
    console.log('Waiting for completion');
    setStatus('Generating... please wait.', 'loading');
    await delay(2000); // Polling less frequently
    operation = await ai.operations.getVideosOperation({operation});
  }

  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) {
    throw new Error('No videos were generated. Please try a different prompt.');
  }
  
  const firstVideo = videos[0];
  const url = decodeURIComponent(firstVideo.video.uri);
  const res = await fetch(url);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}


upload.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    base64data = await blobToBase64(file);
    imgEl.src = URL.createObjectURL(file);
    imagePreviewContainer.style.display = 'block';
  } else {
    // This case might not be triggered by file picker, but good practice
    base64data = '';
    imgEl.src = '';
    imagePreviewContainer.style.display = 'none';
  }
});

clearImageButton.addEventListener('click', () => {
    upload.value = ''; // Clear file input
    base64data = '';
    if (imgEl.src) {
      URL.revokeObjectURL(imgEl.src); // Clean up old object URL
    }
    imgEl.src = '';
    imagePreviewContainer.style.display = 'none';
});

promptEl.addEventListener('input', () => {
  prompt = promptEl.value;
});

downloadButton.addEventListener('click', () => {
  if (videoObjectURL) {
    downloadFile(videoObjectURL, 'generated-video.mp4');
  }
});

generateButton.addEventListener('click', async () => {
  // Reset UI
  setStatus('Initializing...', 'loading');
  setLoading(true);
  videoOutput.style.display = 'none';
  quotaErrorEl.style.display = 'none';
  if (videoObjectURL) {
    URL.revokeObjectURL(videoObjectURL);
    videoObjectURL = null;
  }

  try {
    const objectURL = await generateContent(prompt, base64data);
    videoObjectURL = objectURL;
    video.src = videoObjectURL;
    videoOutput.style.display = 'block';
    video.play();
    setStatus('Video generated successfully!', 'success');
  } catch (e) {
    try {
      // The error message from the API might be a JSON string.
      const err = JSON.parse(e.message);
      if (err.error.code === 429) {
        quotaErrorEl.style.display = 'block';
        setStatus('API quota exceeded.', 'error');
      } else {
        setStatus(`Error: ${err.error.message}`, 'error');
      }
    } catch (err) {
      setStatus(`Error: ${e.message}`, 'error');
      console.error('An error occurred:', e);
    }
  } finally {
    setLoading(false);
  }
});
