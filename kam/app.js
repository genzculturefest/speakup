const rawVideo = document.getElementById('rawVideo');
const canvas916 = document.getElementById('canvas916');
const canvas169 = document.getElementById('canvas169');
const ctx916 = canvas916.getContext('2d');
const ctx169 = canvas169.getContext('2d');

const btnSettings = document.getElementById('btnSettings');
const settingsModal = document.getElementById('settingsModal');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnFlash = document.getElementById('btnFlash');
const btnZoom = document.getElementById('btnZoom');
const btnRecord = document.getElementById('btnRecord');
const btnFlip = document.getElementById('btnFlip');
const labelDefaultCam = document.getElementById('labelDefaultCam');

let currentQuality = '1080p';
let currentFPS = 30;
let facingMode = 'environment';
let mediaStream = null;
let videoTrack = null;

let isRecording = false;
let isFlashOn = false;
let recorder169 = null, recorder916 = null;
let chunks169 = [], chunks916 = [];
let zoomLevel = 1;

// Deteksi Codec Terbaik (Prioritas HEVC / MP4)
function getBestMimeType() {
  const candidateTypes = [
    'video/mp4;codecs=hevc',
    'video/mp4;codecs=h265',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm'
  ];
  for (const type of candidateTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

// Math Crop Anti-Gepeng & Anti-Pecah
function drawCover(ctx, video, targetW, targetH) {
  const vW = video.videoWidth;
  const vH = video.videoHeight;
  if (!vW || !vH) return;

  const targetRatio = targetW / targetH;
  const videoRatio = vW / vH;

  let sx, sy, sW, sH;

  if (videoRatio > targetRatio) {
    sH = vH;
    sW = vH * targetRatio;
    sx = (vW - sW) / 2;
    sy = 0;
  } else {
    sW = vW;
    sH = vW / targetRatio;
    sx = 0;
    sy = (vH - sH) / 2;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, sx, sy, sW, sH, 0, 0, targetW, targetH);
}

// Inisialisasi Kamera
async function initCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
  }

  // Paksa kamera mengambil input resolusi tinggi agar hasil crop portrait tetap tajam
  const constraints = {
    video: {
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      frameRate: { ideal: currentFPS },
      facingMode: facingMode
    },
    audio: true
  };

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    rawVideo.srcObject = mediaStream;
    videoTrack = mediaStream.getVideoTracks()[0];

    rawVideo.onloadedmetadata = () => {
      rawVideo.play();
      setupCanvasDimensions();
      renderLoop();
    };

    labelDefaultCam.innerText = facingMode === 'environment' ? 'Back' : 'Front';

  } catch (err) {
    alert("Gagal mengakses kamera: " + err.message);
  }
}

// Kunci Resolusi Eksak (Bukan Pembagian Bulat Saja)
function setupCanvasDimensions() {
  if (currentQuality === '4k') {
    canvas169.width = 3840; canvas169.height = 2160;
    canvas916.width = 2160; canvas916.height = 3840;
  } else if (currentQuality === '1080p') {
    canvas169.width = 1920; canvas169.height = 1080; // 16:9 Landscape
    canvas916.width = 1080; canvas916.height = 1920; // 9:16 Portrait Eksak 2MP
  } else {
    canvas169.width = 1280; canvas169.height = 720;
    canvas916.width = 720; canvas916.height = 1280;
  }
}

function renderLoop() {
  drawCover(ctx916, rawVideo, canvas916.width, canvas916.height);
  drawCover(ctx169, rawVideo, canvas169.width, canvas169.height);
  requestAnimationFrame(renderLoop);
}

// Handler Flash / Senter
btnFlash.onclick = async () => {
  if (!videoTrack) return;
  const caps = videoTrack.getCapabilities();
  if (caps.torch) {
    isFlashOn = !isFlashOn;
    await videoTrack.applyConstraints({ advanced: [{ torch: isFlashOn }] });
  } else {
    alert("Flash/Senter tidak didukung pada kamera ini.");
  }
};

// Handler Zoom
btnZoom.onclick = async () => {
  if (!videoTrack) return;
  const caps = videoTrack.getCapabilities();
  if (caps.zoom) {
    zoomLevel = zoomLevel === 1 ? 2 : zoomLevel === 2 ? 4 : 1;
    btnZoom.innerText = `${zoomLevel}x`;
    await videoTrack.applyConstraints({ advanced: [{ zoom: zoomLevel }] });
  } else {
    alert("Zoom digital tidak didukung hardware/browser ini.");
  }
};

// Handler Settings Modal
btnSettings.onclick = () => settingsModal.classList.add('active');
btnCloseSettings.onclick = () => settingsModal.classList.remove('active');

document.querySelectorAll('#qualityControl button').forEach(btn => {
  btn.onclick = (e) => {
    document.querySelectorAll('#qualityControl button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentQuality = e.target.getAttribute('data-value');
    initCamera();
  };
});

document.querySelectorAll('#fpsControl button').forEach(btn => {
  btn.onclick = (e) => {
    document.querySelectorAll('#fpsControl button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFPS = parseInt(e.target.getAttribute('data-value'));
    initCamera();
  };
});

// Handler Flip Kamera
btnFlip.onclick = () => {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  initCamera();
};

// Handler Perekaman Video High-Bitrate
btnRecord.onclick = () => {
  if (!isRecording) {
    chunks169 = []; chunks916 = [];
    
    const s169 = canvas169.captureStream(currentFPS);
    const s916 = canvas916.captureStream(currentFPS);
    const audio = mediaStream.getAudioTracks()[0];
    
    if (audio) { 
      s169.addTrack(audio); 
      s916.addTrack(audio); 
    }

    const mimeType = getBestMimeType();
    
    // Opsi perekaman bitrate tinggi (25 Mbps)
    const recordOptions = {
      mimeType: mimeType,
      videoBitsPerSecond: 25000000 
    };

    recorder169 = new MediaRecorder(s169, recordOptions);
    recorder916 = new MediaRecorder(s916, recordOptions);

    recorder169.ondataavailable = e => chunks169.push(e.data);
    recorder916.ondataavailable = e => chunks916.push(e.data);

    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

    recorder169.onstop = () => download(chunks169, `REFRAME_V_LANDSCAPE_${currentQuality}.${ext}`, mimeType);
    recorder916.onstop = () => download(chunks916, `REFRAME_V_PORTRAIT_${currentQuality}.${ext}`, mimeType);

    recorder169.start(1000); 
    recorder916.start(1000);
    
    isRecording = true;
    btnRecord.classList.add('recording');
  } else {
    recorder169.stop(); 
    recorder916.stop();
    isRecording = false;
    btnRecord.classList.remove('recording');
  }
};

function download(chunks, name, mimeType) {
  const blob = new Blob(chunks, { type: mimeType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

initCamera();
