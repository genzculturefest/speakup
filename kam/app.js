const rawVideo = document.getElementById('rawVideo');
const canvas916 = document.getElementById('canvas916');
const canvas169 = document.getElementById('canvas169');
const ctx916 = canvas916.getContext('2d', { alpha: false, willReadFrequently: false });
const ctx169 = canvas169.getContext('2d', { alpha: false, willReadFrequently: false });

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
let isRendering = false;

// Bitrate Optimal agar GPU HP Tidak Lag / Drop Frame ke 6 FPS
const targetBitrates = {
  '720p': 6000000,   // 6 Mbps
  '1080p': 12000000, // 12 Mbps (Jernih & Stabil 30/60 FPS)
  '4k': 24000000    // 24 Mbps
};

function getBestMimeType() {
  const candidateTypes = [
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=hevc',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm'
  ];
  for (const type of candidateTypes) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

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

  ctx.drawImage(video, sx, sy, sW, sH, 0, 0, targetW, targetH);
}

// Loop Render Ter-Sinkronisasi dengan Kamera
function startRendering() {
  if (isRendering) return;
  isRendering = true;

  function renderStep() {
    if (rawVideo.readyState >= 2) {
      drawCover(ctx916, rawVideo, canvas916.width, canvas916.height);
      drawCover(ctx169, rawVideo, canvas169.width, canvas169.height);
    }
    
    // Utamakan API Hardware Kamera jika didukung browser
    if ('requestVideoFrameCallback' in rawVideo) {
      rawVideo.requestVideoFrameCallback(renderStep);
    } else {
      requestAnimationFrame(renderStep);
    }
  }

  renderStep();
}

async function initCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: currentQuality === '4k' ? 3840 : 1920 },
        height: { ideal: currentQuality === '4k' ? 2160 : 1080 },
        frameRate: { exact: currentFPS, ideal: currentFPS },
        facingMode: facingMode
      },
      audio: true
    });

    rawVideo.srcObject = mediaStream;
    videoTrack = mediaStream.getVideoTracks()[0];

    // Verifikasi FPS Kamera Asli dari Hardware
    const settings = videoTrack.getSettings();
    if (settings.frameRate) {
      console.log(`Kamera Aktif: ${settings.width}x${settings.height} @ ${settings.frameRate} FPS`);
    }

    rawVideo.onloadedmetadata = () => {
      rawVideo.play();
      setupCanvasDimensions();
      startRendering();
    };

    labelDefaultCam.innerText = facingMode === 'environment' ? 'Back' : 'Front';

  } catch (err) {
    alert("Gagal mengunci FPS kamera: " + err.message);
  }
}

function setupCanvasDimensions() {
  if (currentQuality === '4k') {
    canvas169.width = 3840; canvas169.height = 2160;
    canvas916.width = 2160; canvas916.height = 3840;
  } else if (currentQuality === '1080p') {
    canvas169.width = 1920; canvas169.height = 1080;
    canvas916.width = 1080; canvas916.height = 1920; // Exact 2MP Portrait
  } else {
    canvas169.width = 1280; canvas169.height = 720;
    canvas916.width = 720; canvas916.height = 1280;
  }
}

// Control Event Handlers
btnFlash.onclick = async () => {
  if (!videoTrack) return;
  const caps = videoTrack.getCapabilities();
  if (caps.torch) {
    isFlashOn = !isFlashOn;
    await videoTrack.applyConstraints({ advanced: [{ torch: isFlashOn }] });
  } else {
    alert("Flash tidak didukung.");
  }
};

btnZoom.onclick = async () => {
  if (!videoTrack) return;
  const caps = videoTrack.getCapabilities();
  if (caps.zoom) {
    zoomLevel = zoomLevel === 1 ? 2 : zoomLevel === 2 ? 4 : 1;
    btnZoom.innerText = `${zoomLevel}x`;
    await videoTrack.applyConstraints({ advanced: [{ zoom: zoomLevel }] });
  } else {
    alert("Zoom tidak didukung hardware ini.");
  }
};

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

btnFlip.onclick = () => {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  initCamera();
};

// Record Handler dengan FPS Capture Terkunci
btnRecord.onclick = () => {
  if (!isRecording) {
    chunks169 = []; chunks916 = [];
    
    // Kunci captureStream pada FPS aktual
    const s169 = canvas169.captureStream(currentFPS);
    const s916 = canvas916.captureStream(currentFPS);
    const audio = mediaStream.getAudioTracks()[0];
    
    if (audio) { 
      s169.addTrack(audio); 
      s916.addTrack(audio); 
    }

    const mimeType = getBestMimeType();
    const recordOptions = {
      mimeType: mimeType,
      videoBitsPerSecond: targetBitrates[currentQuality]
    };

    recorder169 = new MediaRecorder(s169, recordOptions);
    recorder916 = new MediaRecorder(s916, recordOptions);

    recorder169.ondataavailable = e => { if (e.data.size > 0) chunks169.push(e.data); };
    recorder916.ondataavailable = e => { if (e.data.size > 0) chunks916.push(e.data); };

    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

    recorder169.onstop = () => download(chunks169, `REFRAME_LANDSCAPE_${currentQuality}.${ext}`, mimeType);
    recorder916.onstop = () => download(chunks916, `REFRAME_PORTRAIT_${currentQuality}.${ext}`, mimeType);

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
