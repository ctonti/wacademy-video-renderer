import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { parseCMProject, getCMProjectRows, formatTime, type ProjectData, type RowMeta, type Scene } from './parser';
import type { ExportProgress } from './electron.d';
import { StudioTab } from './StudioTab';
import { Play, Pause, SkipBack, SkipForward, ArrowLineUp, Trash, Image, FileAudio, FileVideo, Plus, DownloadSimple, FolderOpen, X } from '@phosphor-icons/react';
import './index.css';

// Default background template (can be replaced by user)
const DEFAULT_BG = './background_1080p.png';

function App() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'scene' | 'studio'>('studio');
  const [activeScene, setActiveScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [globalTime, setGlobalTime] = useState(0);
  const [sceneDurations, setSceneDurations] = useState<number[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [includeVideo, setIncludeVideo] = useState(false);

  // Row selection state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingJson, setPendingJson] = useState<any>(null);
  const [availableRows, setAvailableRows] = useState<RowMeta[]>([]);

  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoPlayNext = useRef<boolean>(false);

  // ═══ IMPORT ═══
  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      
      const rows = getCMProjectRows(json);
      if (rows.length === 0) {
        throw new Error('Nessuna riga trovata nel JSON');
      }

      if (rows.length === 1) {
        // Automatically load if only one row
        const data = parseCMProject(json, 0);
        setProject(data);
        setActiveScene(0);
        setIsPlaying(false);
        setGlobalTime(0);
        setSceneDurations([]);
      } else {
        // Show selection UI
        setPendingJson(json);
        setAvailableRows(rows);
        setProject(null); // Clear active project while selecting
      }
    } catch (err) {
      alert(`Import error: ${(err as Error).message}`);
    }
  }, []);

  const handleSelectRow = useCallback((rowIndex: number) => {
    if (!pendingJson) return;
    try {
      const data = parseCMProject(pendingJson, rowIndex);
      setProject(data);
      setActiveScene(0);
      setIsPlaying(false);
      setGlobalTime(0);
      setSceneDurations([]);
      setPendingJson(null);
      setAvailableRows([]);
    } catch (err) {
      alert(`Errore caricamento riga: ${(err as Error).message}`);
    }
  }, [pendingJson]);

  // ═══ EXPORT ═══
  const handleExport = useCallback(async () => {
    if (!project || !window.electronAPI) return;
    
    // Pick save path
    const outputPath = await window.electronAPI.pickSavePath();
    if (!outputPath) return; // user cancelled

    setExporting(true);
    setExportProgress({ phase: 'download', percent: 0, message: 'Inizializzazione...' });

    // Listen to progress
    window.electronAPI.onExportProgress((progress) => {
      setExportProgress(progress);
    });

    try {
      // Map scenes for export
      const exportScenes = project.scenes.map(s => ({
        index: s.index,
        slideUrl: s.slideUrl,
        audioUrl: s.audioUrl,
        videoUrl: includeVideo ? s.videoUrl : ""
      }));

      const res = await window.electronAPI.exportVideo({
        scenes: exportScenes,
        backgroundPath: project.backgroundUrl || DEFAULT_BG, 
        outputPath
      });
      
      if (!res.success) throw new Error(res.error || 'Errore sconosciuto');
      
      alert('✅ Esportazione completata con successo!');
    } catch (err) {
      alert(`❌ Errore durante l'export: ${(err as Error).message}`);
    } finally {
      setExporting(false);
      setExportProgress(null);
      window.electronAPI?.removeExportProgress();
    }
  }, [project, includeVideo]);

  // ═══ PLAYBACK & TIMELINE ═══
  const scene = project?.scenes[activeScene];

  const getSceneDuration = useCallback((idx: number) => {
    if (!project) return 0;
    const s = project.scenes[idx];
    if (s.audioBlob || s.audioUrl) {
      return sceneDurations[idx] || 0;
    }
    return s.customDuration ?? 4;
  }, [project, sceneDurations]);

  const totalDuration = useMemo(() => {
    if (!project) return 0;
    let total = 0;
    for (let i = 0; i < project.scenes.length; i++) {
        total += getSceneDuration(i);
    }
    return total;
  }, [project, getSceneDuration]);

  // Sync playback with activeScene state
  useEffect(() => {
    if (!project) return;
    
    // Assicuriamoci che l'array di ahref sia coerente
    if (audioRefs.current.length !== project.scenes.length) {
      audioRefs.current = audioRefs.current.slice(0, project.scenes.length);
    }

    // Ferma tutti gli altri
    audioRefs.current.forEach((audio, i) => {
      if (audio && i !== activeScene && !audio.paused) {
        audio.pause();
      }
    });

    const currentAudio = audioRefs.current[activeScene];
    if (currentAudio) {
      if (isPlaying) {
        currentAudio.play().catch(e => console.warn("Auto-play blocked:", e));
        videoRef.current?.play().catch(e => console.warn(e));
      } else {
        currentAudio.pause();
        videoRef.current?.pause();
      }
    }
  }, [activeScene, isPlaying, project]);

  // Virtual Playback for Silent Scenes
  useEffect(() => {
    if (!project || !isPlaying) return;
    
    const currentScene = project.scenes[activeScene];
    const hasAudio = !!(currentScene.audioBlob || currentScene.audioUrl);
    if (hasAudio) return; // Audio tag will emit onTimeUpdate and onEnded natively

    let lastTick = performance.now();
    let rAnim: number;

    let accumulated = 0;
    for (let i = 0; i < activeScene; i++) {
      accumulated += getSceneDuration(i);
    }
    const sceneDur = getSceneDuration(activeScene);
    const targetEnd = accumulated + sceneDur;

    const tick = (now: DOMHighResTimeStamp) => {
      const deltaSec = (now - lastTick) / 1000;
      lastTick = now;

      setGlobalTime(prev => {
        const nextTime = Math.min(prev + deltaSec, totalDuration);
        if (nextTime >= targetEnd) {
          if (activeScene < project.scenes.length - 1) {
             autoPlayNext.current = true;
             setActiveScene(activeScene + 1);
          } else {
             setIsPlaying(false);
          }
          return targetEnd;
        }
        return nextTime;
      });

      rAnim = requestAnimationFrame(tick);
    };

    rAnim = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rAnim);
  }, [project, isPlaying, activeScene, getSceneDuration, totalDuration]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  // ═══ SCENE MODIFICATIONS (EDIT, ADD, DELETE) ═══
  const updateScene = useCallback((sceneIndex: number, updates: Partial<Scene>) => {
    setProject(prev => {
      if (!prev) return prev;
      const newScenes = [...prev.scenes];
      const idx = newScenes.findIndex(s => s.index === sceneIndex);
      if (idx !== -1) newScenes[idx] = { ...newScenes[idx], ...updates };
      return { ...prev, scenes: newScenes };
    });
  }, []);

  const handleSlideUpload = useCallback((sceneIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filePath = (file as any).path || file.name; // Use HTML5 path for Electron
    const slideBlob = URL.createObjectURL(file);
    updateScene(sceneIndex, { slideUrl: filePath, slideBlob });
  }, [updateScene]);

  const handleAudioUpload = useCallback((sceneIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filePath = (file as any).path || file.name;
    const audioBlob = URL.createObjectURL(file);
    updateScene(sceneIndex, { audioUrl: filePath, audioBlob });
  }, [updateScene]);

  const handleAddScene = useCallback((insertIndex: number) => {
    setProject(prev => {
      if (!prev) return prev;
      const newScenes = [...prev.scenes];
      newScenes.splice(insertIndex, 0, {
        index: 0,
        script: '[Nuova Scena Vuota]',
        slideUrl: '',
        audioUrl: '',
        videoUrl: '',
        introText: '',
        datiSlide: ''
      });
      // Re-index
      newScenes.forEach((s, idx) => s.index = idx + 1);
      return { ...prev, scenes: newScenes, sceneCount: newScenes.length };
    });
  }, []);

  const handleDeleteScene = useCallback((sceneIndex: number) => {
    if (!window.confirm(`Eliminare definitivamente la Scena ${sceneIndex}?`)) return;
    setProject(prev => {
      if (!prev) return prev;
      const newScenes = prev.scenes.filter(s => s.index !== sceneIndex);
      newScenes.forEach((s, idx) => s.index = idx + 1);
      
      let newActive = activeScene;
      if (newActive >= newScenes.length) newActive = Math.max(0, newScenes.length - 1);
      setActiveScene(newActive);
      
      return { ...prev, scenes: newScenes, sceneCount: newScenes.length };
    });
  }, [activeScene]);

  const handleRemoveAudio = useCallback((sceneIndex: number) => {
    updateScene(sceneIndex, { audioUrl: '', audioBlob: '', customDuration: 4 });
  }, [updateScene]);

  const handleCustomDurationChange = useCallback((sceneIndex: number, val: number) => {
    updateScene(sceneIndex, { customDuration: Math.max(1, val) });
  }, [updateScene]);

  // ═══ TIMELINE & AUDIO EVENTS ═══
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!project || totalDuration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const targetGlobalTime = percentage * totalDuration;
    
    let accumulated = 0;
    let targetSceneIdx = 0;
    let localTimeInScene = 0;
    
    for (let i = 0; i < project.scenes.length; i++) {
        const sceneDur = getSceneDuration(i);
        if (targetGlobalTime <= accumulated + sceneDur || i === project.scenes.length - 1) {
            targetSceneIdx = i;
            localTimeInScene = targetGlobalTime - accumulated;
            break;
        }
        accumulated += sceneDur;
    }
    
    setGlobalTime(targetGlobalTime);
    if (targetSceneIdx !== activeScene) {
      setActiveScene(targetSceneIdx);
    }

    const targetAudio = audioRefs.current[targetSceneIdx];
    const s = project.scenes[targetSceneIdx];
    const hasAudio = !!(s.audioBlob || s.audioUrl);
    
    if (targetAudio && hasAudio) {
        targetAudio.currentTime = Math.max(0, Math.min(localTimeInScene, targetAudio.duration || 0));
    }
    if (videoRef.current) {
        videoRef.current.currentTime = localTimeInScene;
    }
  }, [project, totalDuration, getSceneDuration, activeScene]);

  const handleAudioLoaded = useCallback((idx: number, e: React.SyntheticEvent<HTMLAudioElement>) => {
    const dur = e.currentTarget.duration;
    setSceneDurations(prev => {
      const newDurs = [...prev];
      newDurs[idx] = dur;
      return newDurs;
    });
    
    if (idx === activeScene && autoPlayNext.current) {
      autoPlayNext.current = false;
      e.currentTarget.play().catch(err => console.error(err));
      videoRef.current?.play().catch(err => console.error(err));
      setIsPlaying(true);
    }
  }, [activeScene]);

  const handleAudioTimeUpdate = useCallback((idx: number, e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (idx !== activeScene) return;
    const localTime = e.currentTarget.currentTime;
    
    let accumulated = 0;
    for (let i = 0; i < idx; i++) {
      accumulated += getSceneDuration(i);
    }
    setGlobalTime(accumulated + localTime);
  }, [activeScene, getSceneDuration]);

  const handleAudioEnded = useCallback((idx: number) => {
    if (idx !== activeScene || !project) return;
    if (activeScene < project.scenes.length - 1) {
      autoPlayNext.current = true;
      setActiveScene(prev => prev + 1);
    } else {
      setIsPlaying(false);
      setGlobalTime(totalDuration);
    }
  }, [activeScene, project, totalDuration]);

  // ═══ KEYBOARD SHORTCUTS ═══
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
      if (e.code === 'ArrowRight' && project && activeScene < project.scenes.length - 1) {
        setActiveScene(prev => prev + 1);
      }
      if (e.code === 'ArrowLeft' && activeScene > 0) {
        setActiveScene(prev => prev - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, activeScene, project]);

  // ═══ RENDER ═══
  return (
    <div className="app">
      {/* HEADER */}
      <header className="app-header">
        <div className="app-logo">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z" />
          </svg>
          w.avr
          <span className="app-title">w.academy video renderer</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <div className="app-tabs">
              <button 
                className={`tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
                onClick={() => setActiveTab('studio')}
              >
                STUDIO
              </button>
              <button 
                className={`tab-btn ${activeTab === 'video' ? 'active' : ''}`}
                onClick={() => setActiveTab('video')}
              >
                VIDEO
              </button>
              <button 
                className={`tab-btn ${activeTab === 'scene' ? 'active' : ''}`}
                onClick={() => setActiveTab('scene')}
              >
                SCENE
              </button>
            </div>
            
{project && (
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                if(window.confirm('Chiudere il progetto corrente? Le modifiche non salvate andranno perse.')) {
                  setProject(null);
                  setActiveScene(0);
                  setIsPlaying(false);
                  setGlobalTime(0);
                  setSceneDurations([]);
                  setPendingJson(null);
                  setAvailableRows([]);
                }
              }}
              style={{ padding: '6px 12px', fontSize: 11, background: 'transparent', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <X size={14} weight="bold" /> Chiudi Progetto
            </button>
            )}
          </div>
      </header>

      <div className="main-content">
        {activeTab === 'studio' ? (
          <StudioTab />
        ) : !project ? (
          <div className="import-wrapper">
            {!pendingJson ? (
              <div className="import-zone" onClick={() => fileInputRef.current?.click()}>
                <div className="icon"><FolderOpen size={48} weight="light" /></div>
                <div className="label">
                  Importa JSON<br />Content Machine
                </div>
                <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} />
              </div>
            ) : (
              <div className="row-selection">
                <h2>Seleziona la riga da importare</h2>
                <div className="row-grid">
                  {availableRows.map(r => (
                    <div key={r.index} className="row-card" onClick={() => handleSelectRow(r.index)}>
                      <div className="row-index">Riga {r.index + 1}</div>
                      <div className="row-title">{r.argomento}</div>
                      {r.nomeDocente && <div className="row-meta">{r.nomeDocente} - Lezione {r.numeroLezione}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          activeTab === 'video' ? (
            <div className="tab-video">
              <div className="player-area">
                {scene ? (
                  <div className="compositor">
                    {/* Background with brand bar */}
                    <img
                      className="background-layer"
                      src={project.backgroundUrl || DEFAULT_BG}
                      alt=""
                    />

                    {/* Avatar video (left, muted, looped) */}
                    {includeVideo && scene.videoUrl && (
                      <div className="avatar-layer">
                        <video
                          ref={videoRef}
                          src={scene.videoUrl}
                          muted
                          loop
                          playsInline
                        />
                      </div>
                    )}

                    {/* Slide (right or full) */}
                    {(scene.slideBlob || scene.slideUrl) && (
                      <div className={`slide-layer ${(!includeVideo || !scene.videoUrl) ? 'full' : ''}`}>
                        <img src={scene.slideBlob || scene.slideUrl} alt={`Slide ${scene.index}`} />
                      </div>
                    )}

                    {/* Hidden audio elements (all of them mapped) */}
                    <div style={{ display: 'none' }}>
                      {project.scenes.map((s, idx) => (
                        (s.audioBlob || s.audioUrl) && (
                          <audio
                            key={s.index}
                            ref={el => { audioRefs.current[idx] = el; }}
                            src={s.audioBlob || s.audioUrl}
                            preload="metadata"
                            onLoadedMetadata={(e) => handleAudioLoaded(idx, e)}
                            onTimeUpdate={(e) => handleAudioTimeUpdate(idx, e)}
                            onEnded={() => handleAudioEnded(idx)}
                          />
                        )
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="icon"><FileVideo size={48} weight="light" /></div>
                    <div className="label">Seleziona un progetto JSON</div>
                  </div>
                )}
              </div>

              <button
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <FolderOpen size={18} weight="bold" style={{ marginRight: 6 }}/> Importa altro JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />

              <div className="controls-bar">
                
                <div className="player-btns" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button 
                    className="play-btn-small" 
                    onClick={() => {
                        const target = Math.max(0, activeScene - 1);
                        setActiveScene(target);
                        if(audioRefs.current[target]) audioRefs.current[target]!.currentTime = 0;
                    }}
                    disabled={activeScene === 0}
                  >
                    <SkipBack size={20} weight="fill" />
                  </button>
                  <button className="play-btn" onClick={togglePlay}>
                    {isPlaying ? <Pause size={24} weight="fill" /> : <Play size={24} weight="fill" />}
                  </button>
                  <button 
                    className="play-btn-small" 
                    onClick={() => {
                        if(!project) return;
                        const target = Math.min(project.scenes.length - 1, activeScene + 1);
                        setActiveScene(target);
                        if(audioRefs.current[target]) audioRefs.current[target]!.currentTime = 0;
                    }}
                    disabled={project && activeScene === project.scenes.length - 1}
                  >
                    <SkipForward size={20} weight="fill" />
                  </button>
                </div>

                <div className="progress-container">
                  <span className="time-display">
                    {formatTime(globalTime)} / {formatTime(totalDuration)}
                  </span>
                  
                  <div className="global-timeline" onClick={handleTimelineClick}>
                    <div className="fill" style={{ width: totalDuration ? `${(globalTime / totalDuration) * 100}%` : '0%' }} />
                    
                    {/* Scene markers */}
                    {(() => {
                      let acc = 0;
                      return project.scenes.map((_s, idx) => {
                        const dur = getSceneDuration(idx);
                        acc += dur;
                        const markerLeft = totalDuration > 0 ? (acc / totalDuration) * 100 : 0;
                        if (idx === project.scenes.length - 1) return null;
                        return (
                          <div key={idx} className="marker" style={{ left: `${markerLeft}%` }} />
                        );
                      });
                    })()}
                  </div>
                  
                  <span className="scene-indicator">
                    Scena {scene?.index}/{project?.sceneCount}
                  </span>
                </div>

                <div className="video-options">
                  <label className="toggle-switch-small">
                    <span className="toggle-label">Avatar</span>
                    <div className="toggle-switch">
                      <input type="checkbox" checked={includeVideo} onChange={(e) => setIncludeVideo(e.target.checked)} />
                      <span className="toggle-slider"></span>
                    </div>
                  </label>
                  
                  <button className="btn btn-primary btn-export" onClick={handleExport} disabled={exporting}>
                    {exporting ? '⏳' : <><DownloadSimple size={18} weight="bold" style={{ marginRight: 6 }}/> Esporta MP4</>}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="tab-scene">
              <div className="scene-editor-list">
                
                <button className="btn btn-secondary scene-add-top" onClick={() => handleAddScene(0)}>
                  <ArrowLineUp size={18} weight="bold" style={{ marginRight: 6 }}/> Inserisci Scena all'inizio
                </button>

                {project.scenes.map((s, i) => (
                  <div key={s.index} className="scene-edit-card">
                    <div className="scene-edit-left">
                      <div className="num-badge">{s.index}</div>
                      <div className="scene-edit-thumb">
                        {s.slideBlob || s.slideUrl ? (
                          <img src={s.slideBlob || s.slideUrl} alt="slide" />
                        ) : (
                          <div className="placeholder-thumb">Nessuna Slide</div>
                        )}
                      </div>
                    </div>

                    <div className="scene-edit-center">
                      <div className="script-text">
                        {s.script || <em>[Nessun testo]</em>}
                      </div>
                      
                      <div className="scene-audio-preview">
                        {s.audioBlob || s.audioUrl ? (
                          <audio controls src={s.audioBlob || s.audioUrl} style={{ width: '100%', height: 36 }} />
                        ) : (
                          <div className="placeholder-audio" style={{ flexDirection: 'column', gap: 4, height: 'auto', padding: 8 }}>
                            Nessun Audio
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                              Durata scena (s):
                              <input 
                                type="number" 
                                min="1" 
                                style={{ width: 60, padding: 4, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: '#fff' }}
                                value={s.customDuration ?? 4} 
                                onChange={(e) => handleCustomDurationChange(s.index, Number(e.target.value))}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="scene-edit-actions">
                      <label className="btn-action icon-only" title="Rimpiazza Slide">
                        <Image size={20} weight="bold" />
                        <input type="file" accept="image/png, image/jpeg" onChange={(e) => handleSlideUpload(s.index, e)} />
                      </label>
                      
                      {s.audioBlob || s.audioUrl ? (
                        <>
                          <label className="btn-action icon-only" title="Rimpiazza Audio">
                            <FileAudio size={20} weight="bold" />
                            <input type="file" accept="audio/mp3, audio/wav, audio/mpeg" onChange={(e) => handleAudioUpload(s.index, e)} />
                          </label>
                          <button className="btn-action icon-only" onClick={() => handleRemoveAudio(s.index)} style={{ color: 'var(--text-dim)' }} title="Rimuovi Audio">
                            <Trash size={20} weight="fill" />
                          </button>
                        </>
                      ) : (
                        <label className="btn-action btn-action-primary icon-only" title="Inserisci Audio">
                          <FileAudio size={20} weight="bold" />
                          <input type="file" accept="audio/mp3, audio/wav, audio/mpeg" onChange={(e) => handleAudioUpload(s.index, e)} />
                        </label>
                      )}
                      
                      <div style={{ flex: 1 }} />

                      <button className="btn-action-danger icon-only" onClick={() => handleDeleteScene(s.index)} title="Elimina Scena">
                        <Trash size={20} weight="bold" />
                      </button>
                      <button className="btn-action-primary icon-only" onClick={() => handleAddScene(i + 1)} title="Inserisci dopo">
                        <Plus size={20} weight="bold" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>

      {/* Export progress overlay */}
      {exporting && exportProgress && (
        <div className="download-overlay">
          <div className="download-card">
            <h3>🎬 Esportazione Video</h3>
            
            <div className="status" style={{ paddingBottom: 12 }}>
              {exportProgress.message}
            </div>

            <div className="progress">
              <div className="bar" style={{ width: `${Math.max(0, Math.min(100, exportProgress.percent))}%` }} />
            </div>
            
            <div className="status" style={{ marginTop: 8, fontSize: 11, fontWeight: 'bold' }}>
              Totale: {Math.round(exportProgress.percent)}%
            </div>

            {/* Render active scene progress if available */}
            {exportProgress.activeScenes && exportProgress.activeScenes.length > 0 && (
              <div className="active-scenes">
                {exportProgress.activeScenes.map(asc => (
                  <div key={asc.index} className="scene-progress">
                    <span className="scene-label">Scena {asc.index}</span>
                    <div className="scene-bar-bg">
                      <div className="scene-bar-fill" style={{ width: `${Math.max(0, Math.min(100, asc.percent))}%` }} />
                    </div>
                    <span className="scene-pct">{Math.round(asc.percent)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
