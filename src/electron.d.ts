export interface ExportProgress {
  phase: 'download' | 'composite' | 'concat' | 'done';
  scene?: number;
  total?: number;
  chunk?: number;
  totalChunks?: number;
  percent: number;
  message: string;
  activeScenes?: Array<{
    index: number;
    percent: number;
  }>;
}

export interface ElectronAPI {
  pickSavePath: () => Promise<string | null>;
  saveProjectJson: (options: { defaultName: string, content: string }) => Promise<{ success: boolean; path?: string }>;
  exportVideo: (params: {
    scenes: Array<{
      index: number;
      slideUrl: string;
      audioUrl: string;
      videoUrl: string;
    }>;
    backgroundPath: string;
    outputPath: string;
  }) => Promise<{ success: boolean; error?: string }>;
  checkFfmpeg: () => Promise<{ available: boolean; version: string | null }>;
  onExportProgress: (callback: (progress: ExportProgress) => void) => void;
  removeExportProgress: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
