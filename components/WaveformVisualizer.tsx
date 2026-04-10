
import React, { useRef, useEffect } from 'react';
import { AudioSegment } from '../types';

interface WaveformVisualizerProps {
  audioBuffer: AudioBuffer | null;
  segments: AudioSegment[];
  currentTime: number;
}

const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({ audioBuffer, segments, currentTime }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth * dpr;
    const height = canvas.offsetHeight * dpr;
    canvas.width = width;
    canvas.height = height;
    ctx.scale(dpr, dpr);

    const drawWidth = canvas.offsetWidth;
    const drawHeight = canvas.offsetHeight;
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / drawWidth);
    const amp = drawHeight / 2;

    ctx.clearRect(0, 0, drawWidth, drawHeight);

    // Draw Background Segments (Silence vs Sound)
    segments.forEach(seg => {
      const xStart = (seg.start / audioBuffer.duration) * drawWidth;
      const xEnd = (seg.end / audioBuffer.duration) * drawWidth;
      
      ctx.fillStyle = seg.isSilence ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.05)';
      ctx.fillRect(xStart, 0, xEnd - xStart, drawHeight);
      
      if (seg.isSilence) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.beginPath();
        ctx.moveTo(xStart, 0);
        ctx.lineTo(xStart, drawHeight);
        ctx.stroke();
      }
    });

    // Draw Waveform
    ctx.beginPath();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1;
    
    for (let i = 0; i < drawWidth; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();

    // Draw Playhead
    const playheadX = (currentTime / audioBuffer.duration) * drawWidth;
    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, drawHeight);
    ctx.stroke();

  }, [audioBuffer, segments, currentTime]);

  return (
    <div className="relative w-full h-48 bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
      <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />
      {!audioBuffer && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-medium">
          Upload audio to see waveform
        </div>
      )}
    </div>
  );
};

export default WaveformVisualizer;
