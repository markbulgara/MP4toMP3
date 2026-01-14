const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const fileName = document.getElementById("file-name");
const convertButton = document.getElementById("convert-btn");
const transcribeButton = document.getElementById("transcribe-btn");
const exportButton = document.getElementById("export-btn");
const transcriptSection = document.getElementById("transcript-section");
const transcriptList = document.getElementById("transcript-list");
const padBeforeInput = document.getElementById("pad-before");
const padAfterInput = document.getElementById("pad-after");
const status = document.getElementById("status");

let selectedFile = null;
let transcriptToken = null;
let transcriptSegments = [];

const setStatus = (message, type = "") => {
  status.textContent = message;
  status.className = `status ${type}`.trim();
};

const setFile = (file) => {
  selectedFile = file;
  transcriptToken = null;
  transcriptSegments = [];
  transcriptList.innerHTML = "";
  transcriptSection.hidden = true;

  if (file) {
    fileName.textContent = file.name;
    convertButton.disabled = false;
    transcribeButton.disabled = false;
    setStatus("Ready to convert or transcribe.");
  } else {
    fileName.textContent = "None";
    convertButton.disabled = true;
    transcribeButton.disabled = true;
    exportButton.disabled = true;
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

const renderTranscript = () => {
  transcriptList.innerHTML = "";
  transcriptSegments.forEach((segment, index) => {
    const row = document.createElement("label");
    row.className = "transcript__row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.index = index;

    const meta = document.createElement("div");
    meta.className = "transcript__meta";
    meta.textContent = `${segment.speaker} • ${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s`;

    const text = document.createElement("div");
    text.className = "transcript__text";
    text.textContent = segment.text;

    row.appendChild(checkbox);
    row.appendChild(meta);
    row.appendChild(text);

    transcriptList.appendChild(row);
  });
};

const updateSelectionStatus = () => {
  const selected = [...transcriptList.querySelectorAll("input[type=checkbox]:checked")].map(
    (checkbox) => Number(checkbox.dataset.index),
  );

  if (selected.length === 0) {
    exportButton.disabled = true;
    setStatus("Select transcript lines to export.");
    return;
  }

  const starts = selected.map((index) => transcriptSegments[index].start);
  const ends = selected.map((index) => transcriptSegments[index].end);
  const start = Math.min(...starts).toFixed(1);
  const end = Math.max(...ends).toFixed(1);

  exportButton.disabled = false;
  setStatus(`Ready to export ${start}s → ${end}s (padding applied on export).`, "success");
};

const uploadAndTranscribe = async () => {
  if (!selectedFile) {
    return;
  }

  transcribeButton.disabled = true;
  setStatus("Transcribing...", "loading");

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const response = await fetch("/transcribe", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Transcription failed.");
    }

    const data = await response.json();
    transcriptToken = data.token;
    transcriptSegments = data.segments;
    transcriptSection.hidden = false;
    renderTranscript();
    updateSelectionStatus();

    if (!data.diarization) {
      setStatus("Transcript ready. Speaker labels are unavailable.", "success");
    } else {
      setStatus("Transcript ready. Select the lines you want to export.", "success");
    }
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    transcribeButton.disabled = false;
  }
};

const exportSelection = async () => {
  if (!transcriptToken) {
    setStatus("Please transcribe a file first.", "error");
    return;
  }

  const selected = [...transcriptList.querySelectorAll("input[type=checkbox]:checked")].map(
    (checkbox) => Number(checkbox.dataset.index),
  );

  if (selected.length === 0) {
    setStatus("Select at least one transcript line.", "error");
    return;
  }

  exportButton.disabled = true;
  setStatus("Exporting selection...", "loading");

  const starts = selected.map((index) => transcriptSegments[index].start);
  const ends = selected.map((index) => transcriptSegments[index].end);

  const payload = {
    token: transcriptToken,
    start: Math.min(...starts),
    end: Math.max(...ends),
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

transcriptList.addEventListener("change", (event) => {
  if (event.target.matches("input[type=checkbox]")) {
    updateSelectionStatus();
  }
});

convertButton.addEventListener("click", uploadAndConvert);
transcribeButton.addEventListener("click", uploadAndTranscribe);
exportButton.addEventListener("click", exportSelection);
