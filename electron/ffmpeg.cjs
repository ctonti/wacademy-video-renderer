const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static').path;

// Fix paths for packaged Electron app (extract from asar archive)
const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
const ffprobePath = ffprobeStatic.replace('app.asar', 'app.asar.unpacked');

const CACHE_DIR = path.join(os.homedir(), 'VideoRenderer', 'cache');

/**
 * Download a file from URL to local cache
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (!url || url.startsWith('blob:')) {
      reject(new Error('Invalid URL: ' + url));
      return;
    }

    // se è un path fisico locale iniettato dall'utente (override file)
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      try {
        if (fs.existsSync(url)) {
          const dir = path.dirname(destPath);
          fs.mkdirSync(dir, { recursive: true });
          fs.copyFileSync(url, destPath);
          resolve(destPath);
        } else {
          reject(new Error('File locale non trovato: ' + url));
        }
      } catch (err) {
        reject(err);
      }
      return;
    }

    // If already cached, skip
    if (fs.existsSync(destPath)) {
      resolve(destPath);
      return;
    }

    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;

    client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Get a cache path for a URL
 */
function getCachePath(url, prefix, ext) {
  const hash = Buffer.from(url).toString('base64url').slice(0, 32);
  return path.join(CACHE_DIR, `${prefix}_${hash}${ext}`);
}

/**
 * Get the duration of a media file using ffprobe
 */
function getMediaDuration(filePath) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec(`"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, (err, stdout) => {
      if (err) resolve(0);
      else resolve(parseFloat(stdout));
    });
  });
}

/**
 * Run an ffmpeg command and track progress
 */
function runFfmpeg(args, onProgress, expectedDuration) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      // Parse progress from ffmpeg output
      const timeMatch = data.toString().match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && expectedDuration > 0) {
        const currentSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
        const pct = Math.min(100, (currentSec / expectedDuration) * 100);
        if (onProgress) onProgress(pct);
      }
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });

    proc.on('error', (err) => reject(err));
  });
}

/**
 * Composite a single scene: background + avatar (left) + slide (right) + audio
 * Output: scene_N.mp4
 */
async function compositeScene(scene, backgroundPath, outputPath, onProgress) {
  // Download assets
  const slideLocal = getCachePath(scene.slideUrl, `slide_${scene.index}`, '.png');
  const audioLocal = scene.audioUrl ? getCachePath(scene.audioUrl, `audio_${scene.index}`, '.mp3') : null;
  const videoLocal = scene.videoUrl ? getCachePath(scene.videoUrl, `avatar_${scene.index}`, '.mp4') : null;

  const downloads = [downloadFile(scene.slideUrl, slideLocal)];
  if (scene.audioUrl) downloads.push(downloadFile(scene.audioUrl, audioLocal));
  if (scene.videoUrl) downloads.push(downloadFile(scene.videoUrl, videoLocal));

  await Promise.all(downloads);

  // Match App.tsx CSS layout exactly:
  // Container: 1920x1080
  // Brand bar: 5.5% = 60px at bottom. Content height = 1020px. Center Y = 510.
  // Avatar: W = 28% = 537. H = 1020.
  // Slide Full: W = 100%, H = 1020. Padding = 4% (1920*0.04 = 77px).
  //     Content Box: W = 1920 - 154 = 1766. H = 1020 - 154 = 866. Center: X = 960, Y = 510.
  // Slide w/ Avatar: W = 72% = 1382. H = 1020. Padding = 2% (1920*0.02 = 38px).
  //     Content Box: W = 1382 - 76 = 1306. H = 1020 - 76 = 944. Center: X = 537 + 1382/2 = 1228, Y = 510.
  
  const avatarW = 537;
  const avatarH = 1020;
  let inputs = [
    '-loop', '1', '-i', backgroundPath,
    '-loop', '1', '-i', slideLocal
  ];
  
  if (audioLocal) {
    inputs.push('-i', audioLocal);
  } else {
    // Generate silent audio for scenes without audioUrl (e.g. Copertina)
    const dur = scene.customDuration || 5;
    inputs.push('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  }
  let filterParts = [];

  if (videoLocal) {
    // Loop avatar video infinitely
    inputs.push('-stream_loop', '-1', '-i', videoLocal);

    // Scale avatar to fit 28% left area, cover crop
    // Scale slide to fit 1306x944 proportionally
    filterParts.push(
      `[3:v]scale=${avatarW}:${avatarH}:force_original_aspect_ratio=increase,crop=${avatarW}:${avatarH},setsar=1[avatar]`,
      `[1:v]scale=1306:944:force_original_aspect_ratio=decrease[slide]`,
      `[0:v][avatar]overlay=0:0:shortest=0[bg_avatar]`,
      `[bg_avatar][slide]overlay=1228-w/2:510-h/2:shortest=0[out]`
    );
  } else {
    // No avatar - slide scaled to fit 1766x866 proportionally
    filterParts.push(
      `[1:v]scale=1766:866:force_original_aspect_ratio=decrease[slide]`,
      `[0:v][slide]overlay=960-w/2:510-h/2:shortest=0[out]`
    );
  }

  const filter = filterParts.join(';');

  const isMac = os.platform() === 'darwin';

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filter,
    '-map', '[out]',
    '-map', '2:a',
    '-c:v', isMac ? 'h264_videotoolbox' : 'libx264',
    ...(isMac ? ['-b:v', '2500k'] : ['-preset', 'ultrafast', '-crf', '23', '-threads', '0']),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    '-pix_fmt', 'yuv420p',
    '-sws_flags', 'fast_bilinear',
    '-shortest',
    outputPath,
  ];

  // Pass progress callback correctly
  const audioDuration = audioLocal ? await getMediaDuration(audioLocal) : (scene.customDuration || 5);
  await runFfmpeg(args, onProgress, audioDuration);
}

/**
 * Export full lesson: composite all scenes, then concatenate
 */
async function exportVideo({ scenes, backgroundPath, outputPath, onProgress }) {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn('Failed to clean cache directory', e);
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const tmpDir = path.join(CACHE_DIR, 'tmp_export');
  fs.mkdirSync(tmpDir, { recursive: true });

  // Download custom dynamic background if passed from CM project
  let actualBgPath = backgroundPath;
  if (backgroundPath && backgroundPath.startsWith('http')) {
    actualBgPath = getCachePath(backgroundPath, 'project_bg', '.png');
    await downloadFile(backgroundPath, actualBgPath);
  }

  const totalScenes = scenes.length;
  const sceneFiles = [];
  let completed = 0;
  const CHUNK_SIZE = 3;

  // 1. Composite each scene in concurrent chunks
  for (let i = 0; i < totalScenes; i += CHUNK_SIZE) {
    const chunk = scenes.slice(i, i + CHUNK_SIZE);
    
    // Track active scene progresses
    const activeProgresses = chunk.map(s => ({ index: s.index, percent: 0 }));

    const updateChunkProgress = () => {
      // Calculate overall chunk progress
      const chunkPct = activeProgresses.reduce((acc, curr) => acc + curr.percent, 0) / chunk.length;
      
      onProgress({
        phase: 'composite',
        chunk: Math.floor(i / CHUNK_SIZE) + 1,
        totalChunks: Math.ceil(totalScenes / CHUNK_SIZE),
        percent: (completed / totalScenes * 50) + ((chunkPct / 100) * (chunk.length / totalScenes) * 50),
        message: `Elaborazione blocco ${Math.floor(i / CHUNK_SIZE) + 1} di ${Math.ceil(totalScenes / CHUNK_SIZE)}...`,
        activeScenes: activeProgresses
      });
    };

    updateChunkProgress();

    await Promise.all(chunk.map(async (scene) => {
      if (!scene.slideUrl) return;

      const sceneFile = path.join(tmpDir, `scene_${scene.index}.mp4`);
      sceneFiles.push(sceneFile);

      await compositeScene(scene, actualBgPath, sceneFile, (scenePct) => {
        // Find and update active scene percent
        const prog = activeProgresses.find(p => p.index === scene.index);
        if (prog) prog.percent = scenePct;
        updateChunkProgress();
      });
      
      completed++;
      // Set to 100% when done
      const prog = activeProgresses.find(p => p.index === scene.index);
      if (prog) prog.percent = 100;
      updateChunkProgress();
    }));
  }

  // Sort scene files so concat concatenates in the correct order (e.g. 2 before 10)
  sceneFiles.sort((a, b) => {
    const numA = parseInt(a.match(/scene_(\d+)\.mp4/)[1], 10);
    const numB = parseInt(b.match(/scene_(\d+)\.mp4/)[1], 10);
    return numA - numB;
  });

  // 2. Create concat file
  const concatFile = path.join(tmpDir, 'concat.txt');
  const concatContent = sceneFiles.map(f => `file '${f}'`).join('\n');
  fs.writeFileSync(concatFile, concatContent);

  onProgress({
    phase: 'concat',
    percent: 75,
    message: 'Concatenamento scene...',
  });

  // 3. Concatenate all scenes
  const concatArgs = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c', 'copy',
    outputPath,
  ];

  await runFfmpeg(concatArgs, (pct) => {
    onProgress({
      phase: 'concat',
      percent: 75 + (pct / 100) * 25,
      message: 'Concatenamento scene...',
    });
  }, 0);

  // 4. Cleanup temp files
  sceneFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });
  try { fs.unlinkSync(concatFile); } catch {}
  try { fs.rmdirSync(tmpDir); } catch {}

  onProgress({
    phase: 'done',
    percent: 100,
    message: 'Export completato!',
  });
}

module.exports = { exportVideo, downloadFile, getCachePath };
