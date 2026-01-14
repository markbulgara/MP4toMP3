const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const fileName = document.getElementById("file-name");
const convertButton = document.getElementById("convert-btn");
const status = document.getElementById("status");

let selectedFile = null;

const setStatus = (message, type = "") => {
  status.textContent = message;
  status.className = `status ${type}`.trim();
};

const setFile = (file) => {
  selectedFile = file;
  if (file) {
    fileName.textContent = file.name;
    convertButton.disabled = false;
    setStatus("Ready to convert.");
  } else {
    fileName.textContent = "None";
    convertButton.disabled = true;
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

convertButton.addEventListener("click", uploadAndConvert);
