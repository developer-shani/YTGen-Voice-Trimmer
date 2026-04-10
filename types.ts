
export interface AudioSegment {
  start: number; // seconds
  end: number;   // seconds
  isSilence: boolean;
}

export interface ProcessingOptions {
  thresholdDb: number;
  minSilenceDuration: number; // ms
  padding: number;            // ms
  highQualityExport: boolean;
}

export interface AudioStats {
  originalDuration: number;
  trimmedDuration: number;
  silenceCount: number;
  reductionPercentage: number;
}
