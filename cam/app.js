const fullApp = document.getElementById('full-screen-app');
const rawVideo = document.getElementById('rawVideo');
const canvas169 = document.getElementById('canvas169');
const canvas916 = document.getElementById('canvas916');
const ctx169 = canvas169.getContext('2d');
const ctx916 = canvas916.getContext('2d');

const btnFlash = document.getElementById('btnFlashActive');
const btnSettings = document.getElementById('btnSettings');
const btnZoomToggle = document.getElementById('btnZoomToggle');
const zoomLabel = document.getElementById('zoomLabel');
const btnRecord = document.getElementById('btnRecord');
const btnSwitchCam = document.getElementById('btnSwitchCam');

let mediaStream = null;
let recorder169 = null;
let recorder916 = null;
let chunks169 = [];
let chunks916 = [];
let isRendering = false;
let isRecording = false;
let isFlashOn = false;
let zoomFactor = 1;

// Resolusi 4K untuk Kanvas internal (memaksa resolusi penuh internal)
const target4K_W = 3840;
const target4K_H = 2160;

// Set resolusi piksel penuh kanvas, CSS object-fit akan menangani tampilan full
canvas169.width = target4K_W;
canvas169.height = target4K_H;
// Kanvas 9:16 portrait adalah crop tengah dari 4K, jadi resolusi internalnya tetap tinggi
canvas916.width = Math.round(target4K_H * (9 / 16));
canvas916.height = target4K_H;

// Fungsi untuk memulai kamera dengan resolusi tinggi yang memaksa 4K
async function startCamera(facingMode) {
  try {
    // Berhenti stream sebelumnya
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }

    // Meminta stream kamera yang dipaksa setinggi mungkin
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { min: 1920, ideal: 3840, max: 3840 },
        height: { min: 1080, ideal: 2160, max: 2160 },
        facingMode: facingMode
      },
      audio: {
        channelCount: { ideal: 2 },
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    rawVideo.srcObject = mediaStream;

    // Tunggu metadata untuk mendapatkan resolusi asli yang dikembalikan oleh kamera
    await new Promise(resolve => rawVideo.onloadedmetadata = resolve);
    rawVideo.play();
    isRendering = true;
    renderLoop();

    // Verifikasi resolusi yang diperoleh
    const vW = rawVideo.videoWidth;
    const vH = rawVideo.videoHeight;
    console.log(`Kamera dimulai: ${vW}x${vH} (${vW >= 3840 ? '4K Asli' : 'Hampir 4K'})`);

    // Reset kontrol dan state
    isFlashOn = false;
    isRecording = false;
    zoomFactor = 1;
    zoomLabel.textContent = '1x';
    btnRecord.classList.remove('recording');

    // Aktifkan fitur spesifik jika didukung oleh kapabilitas track
    const track = mediaStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    
    // Periksa Zoom
    if (capabilities.zoom) {
      btnZoomToggle.disabled = false;
      const { min, max } = capabilities.zoom;
      // Periksa Zoom factor 4x (jika didukung)
      if (max < 4) {
        console.warn(`Zoom maksimal kamera ini adalah ${max}x`);
      }
    } else {
      btnZoomToggle.disabled = true;
      console.warn("Kamera ini tidak mendukung zoom optik native.");
    }
    
    // Periksa Flash/Obor (hanya mobile/beberapa USB cam)
    if (capabilities.torch) {
      btnFlash.parentElement.style.display = 'block';
      btnFlash.disabled = false;
    } else {
      btnFlash.parentElement.style.display = 'none';
      btnFlash.disabled = true;
    }

  } catch (err) {
    alert("Gagal mengakses kamera resolusi tinggi. Pastikan perangkat Anda mendukungnya dan periksa izin browser: " + err.message);
  }
}

// Loop Rendering untuk Kanvas dengan kualitas tinggi
function renderLoop() {
  if (!isRendering) return;

  const vW = rawVideo.videoWidth;
  const vH = rawVideo.videoHeight;

  if (vW && vH) {
    // Render 16:9 Landscape Full Internal piksel penuh
    ctx169.drawImage(rawVideo, 0, 0, canvas169.width, canvas169.height);

    // Crop Tengah untuk 9:16 Portrait piksel penuh
    // Hitung crop internal dari resolusi feed 4K asli
    const cropW = vH * (9 / 16);
    const startX = (vW - cropW) / 2;
    // Gambar dari feed asli, crop tengah, dan gambar ke kanvas portrait
    ctx916.drawImage(rawVideo, startX, 0, cropW, vH, 0, 0, canvas916.width, canvas916.height);
  }

  requestAnimationFrame(renderLoop);
}

// Inisialisasi awal (kamera depan default)
startCamera("user");

// --- Kontrol Fitur ---

// Balik Kamera
btnSwitchCam.addEventListener('click', () => {
  if (isRecording) { alert("Tidak bisa ganti kamera saat merekam."); return; }
  const currentMode = mediaStream.getVideoTracks()[0].getSettings().facingMode;
  startCamera(currentMode === "user" ? "environment" : "user");
});

// Flash/Obor
btnFlash.addEventListener('click', async () => {
  const track = mediaStream.getVideoTracks()[0];
  isFlashOn = !isFlashOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: isFlashOn }] });
    btnFlash.classList.toggle('active', isFlashOn);
    // Ubah ikon flash sesuai state (diimplementasikan dengan CSS/SVG di HTML)
  } catch (e) { console.error("Error flash: ", e); }
});

// Zoom Ganda (1x, 2x, 4x)
btnZoomToggle.addEventListener('click', async () => {
  const track = mediaStream.getVideoTracks()[0];
  const capabilities = track.getCapabilities();
  
  // Urutan Zoom (1x, 2x, 4x, lalu balik ke 1x)
  if (zoomFactor === 1) zoomFactor = 2;
  else if (zoomFactor === 2) zoomFactor = 4;
  else if (zoomFactor === 4) zoomFactor = 1;

  // Pastikan zoomFactor tidak melebihi kemampuan kamera native
  if (zoomFactor > capabilities.zoom.max) {
      console.warn(`Zoom native dipaksa ke maksimal: ${capabilities.zoom.max}x`);
      zoomFactor = capabilities.zoom.max;
  }
  
  try {
      await track.applyConstraints({ advanced: [{ zoom: zoomFactor }] });
      zoomLabel.textContent = `${zoomFactor.toFixed(capabilities.zoom.step === 1 ? 0 : 1)}x`;
  } catch (e) { console.error("Error zoom: ", e); zoomFactor = 1; }
});

// Perekaman Video 4K Ganda
btnRecord.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

function startRecording() {
  chunks169 = [];
  chunks916 = [];

  const stream169 = canvas169.captureStream(60); // 60 FPS jika didukung
  const stream916 = canvas916.captureStream(60);

  // Sertakan audio track native
  const audioTrack = mediaStream.getAudioTracks()[0];
  if (audioTrack) { stream169.addTrack(audioTrack); stream916.addTrack(audioTrack); }

  // Tentukan resolusi yang diperoleh dari feed untuk nama file
  const videoW = rawVideo.videoWidth;
  const videoH = rawVideo.videoHeight;
  const finalFilenamePrefix = videoW >= 3840 ? "4K" : `${videoW}x${videoH}`;

  recorder169 = new MediaRecorder(stream169, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond : 50000000 }); // 50Mbps
  recorder916 = new MediaRecorder(stream916, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond : 50000000 });

  recorder169.ondataavailable = e => chunks169.push(e.data);
  recorder916.ondataavailable = e => chunks916.push(e.data);

  recorder169.start();
  recorder916.start();

  isRecording = true;
  btnRecord.classList.add('recording');
  btnSwitchCam.disabled = true;
  btnZoomToggle.disabled = true;

  console.log(`Merekam video ganda pada kualitas tinggi dari feed ${videoW}x${videoH}.`);
}

function stopRecording() {
  recorder169.stop();
  recorder916.stop();

  // Tentukan resolusi feed asli untuk nama file
  const videoW = rawVideo.videoWidth;
  const videoH = rawVideo.videoHeight;
  const finalFilenamePrefix = videoW >= 3840 ? "4K" : `${videoW}x${videoH}`;

  recorder169.onstop = () => saveFile(chunks169, `video-landscape-${finalFilenamePrefix}.webm`);
  recorder916.onstop = () => saveFile(chunks916, `video-portrait-${finalFilenamePrefix}.webm`);

  isRecording = false;
  btnRecord.classList.remove('recording');
  btnSwitchCam.disabled = false;
  btnZoomToggle.disabled = false;
}

function saveFile(chunks, filename) {
  const blob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

btnSettings.addEventListener('click', () => { alert("Menu Pengaturan (misalnya resolusi, bitrate, codec) bisa diimplementasikan di sini."); });