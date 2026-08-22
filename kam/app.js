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

let currentQuality = '4k';
let currentFPS = 60;
let facingMode = 'environment';
let mediaStream = null;
let videoTrack = null;

let isRecording = false;
let isFlashOn = false;
let recorder169 = null, recorder916 = null;
let chunks169 = [], chunks916 = [];
let zoomLevel = 1;

const resolutions = {
  '720p': { w: 1280, h: 720 },
  '1080p': { w: 1920, h: 1080 },
  '4k': { w: 3840, h: 2160 }
};

// Math Crop Anti-Gepeng
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

// Inisialisasi Kamera
async function initCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
  }

  const res = resolutions[currentQuality];

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: res.w },
        height: { ideal: res.h },
        frameRate: { ideal: currentFPS },
        facingMode: facingMode
      },
      audio: true
    });

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

function setupCanvasDimensions() {
  const res = resolutions[currentQuality];
  canvas169.width = res.w;
  canvas169.height = Math.round(res.w * (9 / 16));

  canvas916.height = res.h;
  canvas916.width = Math.round(res.h * (9 / 16));
}

function renderLoop() {
  drawCover(ctx916, rawVideo, canvas916.width, canvas916.height);
  drawCover(ctx169, rawVideo, canvas169.width, canvas169.height);
  requestAnimationFrame(renderLoop);
}

// Handler Flash / Torch
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

// Handler Perekaman Video
btnRecord.onclick = () => {
  if (!isRecording) {
    chunks169 = []; chunks916 = [];
    const s169 = canvas169.captureStream(currentFPS);
    const s916 = canvas916.captureStream(currentFPS);
    const audio = mediaStream.getAudioTracks()[0];
    
    if (audio) { s169.addTrack(audio); s916.addTrack(audio); }

    recorder169 = new MediaRecorder(s169);
    recorder916 = new MediaRecorder(s916);

    recorder169.ondataavailable = e => chunks169.push(e.data);
    recorder916.ondataavailable = e => chunks916.push(e.data);

    recorder169.start(); recorder916.start();
    isRecording = true;
    btnRecord.classList.add('recording');
  } else {
    recorder169.stop(); recorder916.stop();
    recorder169.onstop = () => download(chunks169, `video_landscape_${currentQuality}.webm`);
    recorder916.onstop = () => download(chunks916, `video_portrait_${currentQuality}.webm`);
    isRecording = false;
    btnRecord.classList.remove('recording');
  }
};

function download(chunks, name) {
  const blob = new Blob(chunks, { type: 'video/webm' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

initCamera();