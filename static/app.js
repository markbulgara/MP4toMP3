const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const fileName = document.getElementById("file-name");
const convertButton = document.getElementById("convert-btn");
const waveformButton = document.getElementById("waveform-btn");
const exportButton = document.getElementById("export-btn");
const waveformSection = document.getElementById("waveform-section");
const waveformCanvas = document.getElementById("waveform-canvas");
const waveformImage = document.getElementById("waveform-image");
const waveformSelection = document.getElementById("waveform-selection");
const rangeStart = document.getElementById("range-start");
const rangeEnd = document.getElementById("range-end");
const rangeDuration = document.getElementById("range-duration");
const padBeforeInput = document.getElementById("pad-before");
const padAfterInput = document.getElementById("pad-after");
const status = document.getElementById("status");

let selectedFile = null;
let waveformToken = null;
let waveformDuration = 0;
let selectionStart = null;
let selectionEnd = null;
let isSelecting = false;

const setStatus = (message, type = "") => {
  status.textContent = message;
  status.className = `status ${type}`.trim();
};

const resetWaveform = () => {
  waveformToken = null;
  waveformDuration = 0;
  selectionStart = null;
  selectionEnd = null;
  waveformImage.removeAttribute("src");
  waveformSection.hidden = true;
  waveformSelection.style.width = "0";
  waveformSelection.style.left = "0";
  rangeStart.textContent = "0.0s";
  rangeEnd.textContent = "0.0s";
  rangeDuration.textContent = "0.0s";
  exportButton.disabled = true;
};

const setFile = (file) => {
  selectedFile = file;
  resetWaveform();

  if (file) {
    fileName.textContent = file.name;
    convertButton.disabled = false;
    waveformButton.disabled = false;
    setStatus("Ready to convert or generate a waveform.");
  } else {
    fileName.textContent = "None";
    convertButton.disabled = true;
    waveformButton.disabled = true;
    setStatus("");
  }
};

const handleFiles = (files) => {
  if (!files || files.length === 0) {
    return;
  }

  const file = files[0];
  if (!file.name.toLowerCase().endsWith(".mp4")) {
    setStatus("Please select an MP4 file.", "error");
    setFile(null);
    return;
  }

  setFile(file);
};

const uploadAndConvert = async () => {
  if (!selectedFile) {
    return;
  }

  convertButton.disabled = true;
  setStatus("Converting...", "loading");

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const response = await fetch("/convert", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Conversion failed.");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = selectedFile.name.replace(/\.mp4$/i, ".mp3");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);

    setStatus("Conversion complete. Your download should start automatically.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    convertButton.disabled = false;
  }
};

const uploadAndGenerateWaveform = async () => {
  if (!selectedFile) {
    return;
  }

  waveformButton.disabled = true;
  setStatus("Generating waveform...", "loading");

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const response = await fetch("/waveform", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Waveform generation failed.");
    }

    const data = await response.json();
    waveformToken = data.token;
    waveformDuration = data.duration;
    waveformImage.src = data.waveform;
    waveformSection.hidden = false;
    selectionStart = 0;
    selectionEnd = waveformDuration;
    updateSelectionDisplay();
    setStatus("Waveform ready. Drag to select a range.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    waveformButton.disabled = false;
  }
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getTimeFromPosition = (clientX) => {
  const rect = waveformCanvas.getBoundingClientRect();
  const relativeX = clamp(clientX - rect.left, 0, rect.width);
  const ratio = rect.width ? relativeX / rect.width : 0;
  return ratio * waveformDuration;
};

const updateSelectionDisplay = () => {
  if (selectionStart === null || selectionEnd === null) {
    exportButton.disabled = true;
    rangeStart.textContent = "0.0s";
    rangeEnd.textContent = "0.0s";
    rangeDuration.textContent = "0.0s";
    return;
  }

  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const duration = Math.max(0, end - start);

  rangeStart.textContent = `${start.toFixed(2)}s`;
  rangeEnd.textContent = `${end.toFixed(2)}s`;
  rangeDuration.textContent = `${duration.toFixed(2)}s`;

  const rect = waveformCanvas.getBoundingClientRect();
  const left = rect.width ? (start / waveformDuration) * rect.width : 0;
  const right = rect.width ? (end / waveformDuration) * rect.width : 0;

  waveformSelection.style.left = `${Math.min(left, right)}px`;
  waveformSelection.style.width = `${Math.abs(right - left)}px`;

  exportButton.disabled = duration <= 0;
};

const handleSelectionStart = (event) => {
  if (!waveformToken) {
    return;
  }
  isSelecting = true;
  selectionStart = getTimeFromPosition(event.clientX);
  selectionEnd = selectionStart;
  updateSelectionDisplay();
};

const handleSelectionMove = (event) => {
  if (!isSelecting) {
    return;
  }
  selectionEnd = getTimeFromPosition(event.clientX);
  updateSelectionDisplay();
};

const handleSelectionEnd = () => {
  if (!isSelecting) {
    return;
  }
  isSelecting = false;
  updateSelectionDisplay();
};

const exportSelection = async () => {
  if (!waveformToken) {
    setStatus("Please generate a waveform first.", "error");
    return;
  }

  if (selectionStart === null || selectionEnd === null) {
    setStatus("Select a range on the waveform.", "error");
    return;
  }

  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);

  exportButton.disabled = true;
  setStatus("Exporting selection...", "loading");

  const payload = {
    token: waveformToken,
    start,
    end,
    pad_before: Number(padBeforeInput.value || 0),
    pad_after: Number(padAfterInput.value || 0),
  };

  try {
    const response = await fetch("/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Export failed.");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "selection.mp3";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);

    setStatus("Export complete. Your download should start automatically.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    exportButton.disabled = false;
  }
};

dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (event) => handleFiles(event.target.files));

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  handleFiles(event.dataTransfer.files);
});

waveformCanvas.addEventListener("mousedown", handleSelectionStart);
window.addEventListener("mousemove", handleSelectionMove);
window.addEventListener("mouseup", handleSelectionEnd);

convertButton.addEventListener("click", uploadAndConvert);
waveformButton.addEventListener("click", uploadAndGenerateWaveform);
exportButton.addEventListener("click", exportSelection);
