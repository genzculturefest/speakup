const rawVideo = document.getElementById('rawVideo');
const canvas916 = document.getElementById('canvas916');
const canvas169 = document.getElementById('canvas169');

// Akselerasi Hardware GPU & Matikan Alpha untuk Performa Maksimal
const ctx916 = canvas916.getContext('2d', { alpha: false, desynchronized: true });
const ctx169 = canvas169.getContext('2d', { alpha: false, desynchronized: true });

let currentQuality = '1080p';
let currentFPS = 30;
let facingMode = 'environment';
let mediaStream = null;
let videoTrack = null;

let isRecording = false;
let isFlashOn = false;
let recorder169 = null;
let recorder916 = null;
let chunks169 = [];
let chunks916 = [];
let zoomLevel = 1;
let animFrameId = null;

// Bitrate yang Seimbang agar Hardware Encoder HP Tidak Overload (Drop FPS)
const targetBitrates = {
  '720p': 5000000,   // 5 Mbps
  '1080p': 10000000, // 10 Mbps (Tajam & Lancar 30 FPS)
  '4k': 18000000    // 18 Mbps
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

// Math Crop Center Anti-Gepeng
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

// Loop Rendering Ringan Mengikuti Refresh Rate Layar
function renderLoop() {
  if (rawVideo.readyState >= 2) {
    drawCover(ctx916, rawVideo, canvas916.width, canvas916.height);
    drawCover(ctx169, rawVideo, canvas169.width, canvas169.height);
  }
  animFrameId = requestAnimationFrame(renderLoop);
}

async function initCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }

  const is4K = currentQuality === '4k';
  const targetW = is4K ? 3840 : 1920;
  const targetH = is4K ? 2160 : 1080;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: targetW },
        height: { ideal: targetH },
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
      if (animFrameId) cancelAnimationFrame(animFrameId);
      renderLoop();
    };

    const labelCam = document.getElementById('labelDefaultCam');
    if (labelCam) {
      labelCam.innerText = facingMode === 'environment' ? 'Back' : 'Front';
    }

  } catch (err) {
    alert("Gagal mengakses kamera: " + err.message);
  }
}

function setupCanvasDimensions() {
  if (currentQuality === '4k') {
    canvas169.width = 3840; canvas169.height = 2160;
    canvas916.width = 2160; canvas916.height = 3840;
  } else if (currentQuality === '1080p') {
    canvas169.width = 1920; canvas169.height = 1080;
    canvas916.width = 1080; canvas916.height = 1920; // Exact 2MP
  } else {
    canvas169.width = 1280; canvas169.height = 720;
    canvas916.width = 720; canvas916.height = 1280;
  }
}

// Tombol Flash
const btnFlash = document.getElementById('btnFlash');
if (btnFlash) {
  btnFlash.onclick = async () => {
    if (!videoTrack) return;
    const caps = videoTrack.getCapabilities();
    if (caps.torch) {
      isFlashOn = !isFlashOn;
      await videoTrack.applyConstraints({ advanced: [{ torch: isFlashOn }] });
    } else {
      alert("Flash tidak didukung hardware ini.");
    }
  };
}

// Tombol Zoom
const btnZoom = document.getElementById('btnZoom');
if (btnZoom) {
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
}

// Modal Settings
const settingsModal = document.getElementById('settingsModal');
const btnSettings = document.getElementById('btnSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');

if (btnSettings && settingsModal) {
  btnSettings.onclick = () => settingsModal.classList.add('active');
}
if (btnCloseSettings && settingsModal) {
  btnCloseSettings.onclick = () => settingsModal.classList.remove('active');
}

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

// Tombol Flip Kamera
const btnFlip = document.getElementById('btnFlip');
if (btnFlip) {
  btnFlip.onclick = () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    initCamera();
  };
}

// Tombol Rekam
const btnRecord = document.getElementById('btnRecord');
if (btnRecord) {
  btnRecord.onclick = () => {
    if (!isRecording) {
      chunks169 = [];
      chunks916 = [];

      const stream169 = canvas169.captureStream(currentFPS);
      const stream916 = canvas916.captureStream(currentFPS);
      
      const audioTrack = mediaStream ? mediaStream.getAudioTracks()[0] : null;
      if (audioTrack) {
        stream169.addTrack(audioTrack);
        stream916.addTrack(audioTrack);
      }

      const mimeType = getBestMimeType();
      const recordOptions = {
        mimeType: mimeType,
        videoBitsPerSecond: targetBitrates[currentQuality]
      };

      try {
        recorder169 = new MediaRecorder(stream169, recordOptions);
        recorder916 = new MediaRecorder(stream916, recordOptions);
      } catch (e) {
        recorder169 = new MediaRecorder(stream169);
        recorder916 = new MediaRecorder(stream916);
      }

      recorder169.ondataavailable = e => { if (e.data && e.data.size > 0) chunks169.push(e.data); };
      recorder916.ondataavailable = e => { if (e.data && e.data.size > 0) chunks916.push(e.data); };

      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

      recorder169.onstop = () => download(chunks169, `REFRAME_LANDSCAPE_${currentQuality}.${ext}`, mimeType);
      recorder916.onstop = () => download(chunks916, `REFRAME_PORTRAIT_${currentQuality}.${ext}`, mimeType);

      recorder169.start(1000);
      recorder916.start(1000);

      isRecording = true;
      btnRecord.classList.add('recording');
    } else {
      if (recorder169 && recorder169.state !== 'inactive') recorder169.stop();
      if (recorder916 && recorder916.state !== 'inactive') recorder916.stop();

      isRecording = false;
      btnRecord.classList.remove('recording');
    }
  };
}

function download(chunks, name, mimeType) {
  if (!chunks.length) return;
  const blob = new Blob(chunks, { type: mimeType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

// Jalankan Kamera Pertama Kali
initCamera();
