
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  AudioSegment, 
  ProcessingOptions, 
  AudioStats 
} from './types';
import { 
  audioBufferToWav, 
  formatTime, 
  dbToLinear 
} from './services/audioUtils';
import { analyzeAudioProfile } from './services/geminiService';
import WaveformVisualizer from './components/WaveformVisualizer';
import { 
  Play, 
  Pause, 
  Trash2, 
  Download, 
  Scissors, 
  Settings2, 
  Info,
  Waves,
  Zap,
  CheckCircle2,
  Loader2,
  FileAudio,
  UploadCloud
} from 'lucide-react';

const App: React.FC = () => {
  // State
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [options, setOptions] = useState<ProcessingOptions>({
    thresholdDb: -45,
    minSilenceDuration: 300,
    padding: 100,
    highQualityExport: true,
  });
  const [stats, setStats] = useState<AudioStats | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize AudioContext
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Shared file processing logic
  const processFile = async (file: File) => {
    if (!file || !audioContextRef.current) return;
    if (!file.type.startsWith('audio/')) {
      alert("Please upload a valid audio file.");
      return;
    }

    setFileName(file.name);
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);
      setProcessedBuffer(null);
      setStats(null);
    } catch (err) {
      console.error("Decoding error", err);
      alert("Failed to decode audio file.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Input File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // Drag and Drop Handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // AI Smart Analysis
  const runSmartAnalysis = async () => {
    if (!audioBuffer) return;
    setIsAiAnalyzing(true);
    const result = await analyzeAudioProfile(fileName, audioBuffer.duration, audioBuffer.sampleRate);
    if (result) {
      setOptions({
        ...options,
        thresholdDb: result.suggestedThreshold,
        minSilenceDuration: result.suggestedMinDuration,
        padding: result.suggestedPadding
      });
    }
    setIsAiAnalyzing(false);
  };

  // Detect Silence Logic
  const detectSilence = useCallback(() => {
    if (!audioBuffer) return;

    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const threshold = dbToLinear(options.thresholdDb);

    const newSegments: AudioSegment[] = [];
    let isCurrentSilence = false;
    let segmentStart = 0;

    const windowSize = Math.floor(sampleRate * 0.01);

    for (let i = 0; i < data.length; i += windowSize) {
      let sum = 0;
      for (let j = 0; j < windowSize && (i + j) < data.length; j++) {
        sum += data[i + j] * data[i + j];
      }
      const rms = Math.sqrt(sum / windowSize);
      const isWindowSilent = rms < threshold;

      if (isWindowSilent !== isCurrentSilence) {
        const timestamp = i / sampleRate;
        newSegments.push({
          start: segmentStart,
          end: timestamp,
          isSilence: isCurrentSilence
        });
        segmentStart = timestamp;
        isCurrentSilence = isWindowSilent;
      }
    }

    newSegments.push({
      start: segmentStart,
      end: audioBuffer.duration,
      isSilence: isCurrentSilence
    });

    const filteredSegments = newSegments.map((seg) => {
      if (seg.isSilence && (seg.end - seg.start) * 1000 < options.minSilenceDuration) {
        return { ...seg, isSilence: false };
      }
      return seg;
    });

    const merged: AudioSegment[] = [];
    filteredSegments.forEach(seg => {
      if (merged.length > 0 && merged[merged.length - 1].isSilence === seg.isSilence) {
        merged[merged.length - 1].end = seg.end;
      } else {
        merged.push({ ...seg });
      }
    });

    setSegments(merged);
  }, [audioBuffer, options]);

  useEffect(() => {
    detectSilence();
  }, [detectSilence]);

  // Process & Strip Silence
  const processAudio = async () => {
    if (!audioBuffer || !audioContextRef.current) return;
    setIsProcessing(true);

    const soundSegments = segments.filter(s => !s.isSilence);
    if (soundSegments.length === 0) {
      setIsProcessing(false);
      alert("No sound detected with these settings!");
      return;
    }

    const sampleRate = audioBuffer.sampleRate;
    const paddingSamples = Math.floor((options.padding / 1000) * sampleRate);
    
    let totalSamples = 0;
    soundSegments.forEach(seg => {
      const start = Math.max(0, Math.floor(seg.start * sampleRate) - paddingSamples);
      const end = Math.min(audioBuffer.length, Math.floor(seg.end * sampleRate) + paddingSamples);
      totalSamples += (end - start);
    });

    const newBuffer = audioContextRef.current.createBuffer(
      audioBuffer.numberOfChannels,
      totalSamples,
      sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);
      let offset = 0;

      soundSegments.forEach(seg => {
        const start = Math.max(0, Math.floor(seg.start * sampleRate) - paddingSamples);
        const end = Math.min(audioBuffer.length, Math.floor(seg.end * sampleRate) + paddingSamples);
        const segmentData = oldData.subarray(start, end);
        newData.set(segmentData, offset);
        offset += segmentData.length;
      });
    }

    setProcessedBuffer(newBuffer);
    setStats({
      originalDuration: audioBuffer.duration,
      trimmedDuration: newBuffer.duration,
      silenceCount: segments.filter(s => s.isSilence).length,
      reductionPercentage: ((audioBuffer.duration - newBuffer.duration) / audioBuffer.duration) * 100
    });
    setIsProcessing(false);
  };

  // Playback Control
  const togglePlay = () => {
    if (isPlaying) {
      sourceNodeRef.current?.stop();
      pausedAtRef.current = audioContextRef.current!.currentTime - startTimeRef.current + pausedAtRef.current;
      setIsPlaying(false);
    } else {
      if (!audioBuffer || !audioContextRef.current) return;
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      const offset = pausedAtRef.current % audioBuffer.duration;
      source.start(0, offset);
      sourceNodeRef.current = source;
      startTimeRef.current = audioContextRef.current.currentTime;
      setIsPlaying(true);

      source.onended = () => {
        setIsPlaying(false);
        pausedAtRef.current = 0;
      };
    }
  };

  useEffect(() => {
    let animationFrame: number;
    const update = () => {
      if (isPlaying && audioContextRef.current) {
        const time = (audioContextRef.current.currentTime - startTimeRef.current + pausedAtRef.current) % (audioBuffer?.duration || 1);
        setCurrentTime(time);
      }
      animationFrame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, audioBuffer]);

  const downloadResult = () => {
    if (!processedBuffer) return;
    const blob = audioBufferToWav(processedBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trimmed_${fileName}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setAudioBuffer(null);
    setProcessedBuffer(null);
    setSegments([]);
    setStats(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div 
      className="relative min-h-screen"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-600/20 backdrop-blur-md border-4 border-dashed border-indigo-500 m-4 rounded-3xl pointer-events-none animate-in fade-in duration-200">
          <div className="flex flex-col items-center gap-6 p-12 bg-slate-900 rounded-3xl shadow-2xl border border-indigo-500/50">
            <div className="w-24 h-24 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 animate-bounce">
              <UploadCloud className="w-12 h-12" />
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-black text-white mb-2">Drop Audio Here</h2>
              <p className="text-slate-400 font-medium">MP3, WAV, FLAC and more supported</p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-500/20">
              <Waves className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">YTGEN Voice <span className="text-indigo-400">Trimmer</span></h1>
              <p className="text-slate-400 font-medium">Professional grade local silence remover</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => reset()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
            {!audioBuffer ? (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all"
              >
                <Zap className="w-4 h-4" />
                Upload Audio
              </button>
            ) : (
              <button 
                onClick={processAudio}
                disabled={isProcessing}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
                Apply Cuts
              </button>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept="audio/*" 
            />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Visualizer & Playback */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 backdrop-blur-sm shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">Waveform View</span>
                  {fileName && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-lg border border-slate-700 max-w-[240px]">
                      <FileAudio className="w-3 h-3 text-indigo-400" />
                      <span className="text-slate-300 font-medium text-xs truncate">{fileName}</span>
                    </div>
                  )}
                </div>
                <div className="mono text-sm text-slate-500">
                  {formatTime(currentTime)} / {formatTime(audioBuffer?.duration || 0)}
                </div>
              </div>

              <WaveformVisualizer 
                audioBuffer={audioBuffer} 
                segments={segments} 
                currentTime={currentTime} 
              />

              <div className="mt-8 flex items-center justify-center gap-6">
                <button 
                  onClick={togglePlay}
                  disabled={!audioBuffer}
                  className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-800 text-white hover:bg-indigo-600 transition-all disabled:opacity-20"
                >
                  {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                </button>
              </div>
            </div>

            {/* Empty State / Prompt */}
            {!audioBuffer && (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group border-2 border-dashed border-slate-800 rounded-3xl p-12 flex flex-col items-center justify-center gap-4 bg-slate-900/20 hover:bg-indigo-600/5 hover:border-indigo-500/50 transition-all cursor-pointer"
              >
                <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center text-slate-600 group-hover:text-indigo-400 group-hover:scale-110 transition-all">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="text-slate-300 font-bold text-lg">Drag & drop your audio file here</p>
                  <p className="text-slate-500 text-sm">or click to browse your computer</p>
                </div>
              </div>
            )}

            {/* Processed Results */}
            {processedBuffer && stats && (
              <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-3xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <h3 className="font-bold text-lg">Processing Complete</h3>
                  </div>
                  <button 
                    onClick={downloadResult}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <Download className="w-4 h-4" />
                    Export .WAV
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">New Duration</p>
                    <p className="text-xl font-bold text-white mono">{formatTime(stats.trimmedDuration)}</p>
                  </div>
                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Cuts Made</p>
                    <p className="text-xl font-bold text-white mono">{stats.silenceCount}</p>
                  </div>
                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Reduced By</p>
                    <p className="text-xl font-bold text-emerald-400 mono">{stats.reductionPercentage.toFixed(1)}%</p>
                  </div>
                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Quality</p>
                    <p className="text-xl font-bold text-indigo-400 mono">16-bit PCM</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Controls */}
          <aside className="space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 backdrop-blur-sm shadow-xl sticky top-8">
              <div className="flex items-center gap-2 mb-8 pb-4 border-b border-slate-800">
                <Settings2 className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Detection Parameters</h2>
              </div>

              <div className="space-y-8">
                {/* Threshold */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-300">Silence Threshold</label>
                    <span className="mono text-xs font-bold bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">{options.thresholdDb} dB</span>
                  </div>
                  <input 
                    type="range" 
                    min="-80" 
                    max="-20" 
                    step="1"
                    value={options.thresholdDb}
                    onChange={(e) => setOptions({ ...options, thresholdDb: parseInt(e.target.value) })}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    <span>-80dB (Sensitive)</span>
                    <span>-20dB (Loose)</span>
                  </div>
                </div>

                {/* Min Duration */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-300">Min. Silence Length</label>
                    <span className="mono text-xs font-bold bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">{options.minSilenceDuration}ms</span>
                  </div>
                  <input 
                    type="range" 
                    min="50" 
                    max="2000" 
                    step="50"
                    value={options.minSilenceDuration}
                    onChange={(e) => setOptions({ ...options, minSilenceDuration: parseInt(e.target.value) })}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* Padding */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-300">Breath Padding</label>
                    <span className="mono text-xs font-bold bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">{options.padding}ms</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="500" 
                    step="10"
                    value={options.padding}
                    onChange={(e) => setOptions({ ...options, padding: parseInt(e.target.value) })}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                <div className="pt-6 border-t border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-300">Smart Analysis</label>
                    <button 
                      onClick={runSmartAnalysis}
                      disabled={!audioBuffer || isAiAnalyzing}
                      className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-colors disabled:opacity-20"
                      title="Let AI suggest parameters"
                    >
                      {isAiAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed italic">
                    Uses Gemini Flash to analyze the audio file profile and suggest optimal threshold/padding for voices or ambient noise.
                  </p>
                </div>

                <div className="flex items-center gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <Info className="w-4 h-4 text-slate-500 shrink-0" />
                  <p className="text-[11px] text-slate-400 leading-tight">
                    All processing happens in-memory on your CPU. No audio data leaves your computer.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
        
        <footer className="mt-16 pt-8 border-t border-slate-900">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 select-none hover:border-indigo-500/30 transition-colors">
              <span className="text-indigo-400">●</span> YTGen Automations Watermark <span className="text-indigo-400">●</span>
            </div>
            <p className="text-slate-600 text-xs font-medium tracking-wide">
              YTGEN Voice Trimmer &copy; 2024 • Local Browser Processing
            </p>
            <div className="flex flex-col items-center gap-2 text-[10px] text-slate-700 font-bold uppercase tracking-widest mt-2">
              <p>Contact: +447446270523</p>
              <p>Built with <span className="text-rose-500 text-lg leading-none">♥</span> for Audio Creators</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
