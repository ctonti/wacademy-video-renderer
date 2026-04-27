/**
 * Content Machine JSON Parser
 * Extracts scene data from CM project exports
 */

export interface Scene {
  index: number;
  script: string;
  slideUrl: string;
  audioUrl: string;
  videoUrl: string;
  introText: string;
  datiSlide: string;
  // Local overrides for UI preview
  slideBlob?: string;
  audioBlob?: string;
  customDuration?: number; // per scene senza audio
}

export interface ProjectData {
  name: string;
  argomento: string;
  nomeDocente: string;
  numeroLezione: string;
  sceneCount: number;
  scenes: Scene[];
  backgroundUrl?: string;
}

export interface RowMeta {
  index: number;
  argomento: string;
  nomeDocente: string;
  numeroLezione: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCMProjectRows(json: any): RowMeta[] {
  const dataset = json.dataset;
  if (!dataset || dataset.length === 0) return [];

  return dataset.map((d: Record<string, unknown>, index: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = d.data as any;
    const row = data?.it || data?.[Object.keys(data)[0]];
    return {
      index,
      argomento: row?.argomento || `Riga ${index + 1}`,
      nomeDocente: row?.nome_docente || '',
      numeroLezione: row?.numero_lezione || ''
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCMProject(json: any, rowIndex: number = 0): ProjectData {
  const dataset = json.dataset;
  if (!dataset || dataset.length === 0) {
    throw new Error('No dataset found in project JSON');
  }

  const d = dataset[rowIndex];
  if (!d) throw new Error(`Row ${rowIndex} not found`);

  const row = d.data?.it || d.data?.[Object.keys(d.data)[0]];
  if (!row) throw new Error(`No data found in dataset row ${rowIndex}`);

  // Detect scene count
  let sceneCount = 0;
  for (let i = 1; i <= 48; i++) {
    if (row[`script_scena_${i}`] || row[`slide_scena_${i}`] || row[`audio_scena_${i}`]) {
      sceneCount = i;
    }
  }

  if (sceneCount === 0) {
    throw new Error('No scenes found in dataset');
  }

  const scenes: Scene[] = [];
  
  if (row['copertina']) {
    scenes.push({
      index: 0,
      script: 'COPERTINA',
      slideUrl: row['copertina'],
      audioUrl: '',
      videoUrl: '',
      introText: '',
      datiSlide: '',
      customDuration: 5
    });
  }

  for (let i = 1; i <= sceneCount; i++) {
    scenes.push({
      index: i,
      script: row[`script_scena_${i}`] || '',
      slideUrl: row[`slide_scena_${i}`] || '',
      audioUrl: row[`audio_scena_${i}`] || '',
      videoUrl: row[`video_avatar_${i}`] || '',
      introText: row[`intro_scena_${i}`] || '',
      datiSlide: row[`dati_slide_${i}`] || '',
    });
  }

  // Detect background URL from assets
  let backgroundUrl = '';
  if (json.assets && Array.isArray(json.assets)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bgAsset = json.assets.find((a: any) => a.tagName === '##background##' || a.tagName === '##backgound##');
    if (bgAsset) {
      backgroundUrl = bgAsset.value || bgAsset.url || '';
    }
  }

  // Fallback to row data if not in assets
  if (!backgroundUrl) {
    backgroundUrl = row.background || row['##background##'] || row['##backgound##'] || '';
  }

  return {
    name: json.project?.name || 'Untitled',
    argomento: row.argomento || '',
    nomeDocente: row.nome_docente || '',
    numeroLezione: row.numero_lezione || '',
    backgroundUrl,
    sceneCount,
    scenes,
  };
}

/**
 * Check which assets are available for each scene
 */
export function getSceneStatus(scene: Scene): 'ready' | 'partial' | 'missing' {
  const hasSlide = !!scene.slideUrl;
  const hasAudio = !!scene.audioUrl;
  const hasVideo = !!scene.videoUrl;

  if (hasSlide && hasAudio && hasVideo) return 'ready';
  if (hasSlide || hasAudio || hasVideo) return 'partial';
  return 'missing';
}

/**
 * Format seconds to MM:SS
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
