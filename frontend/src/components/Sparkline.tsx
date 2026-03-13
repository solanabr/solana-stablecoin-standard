"use client";

import { useEffect, useRef } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
}

export default function Sparkline({
  data,
  width = 300,
  height = 80,
  color = "#6366f1",
  fillColor = "rgba(99, 102, 241, 0.15)",
}: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...data) * 0.95;
    const max = Math.max(...data) * 1.05 || 1;
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const pad = 4;

    const points: [number, number][] = data.map((v, i) => [
      i * stepX,
      pad + ((max - v) / range) * (height - pad * 2),
    ]);

    // Fill gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, fillColor);
    gradient.addColorStop(1, "transparent");

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const cpx = (points[i - 1][0] + points[i][0]) / 2;
      ctx.bezierCurveTo(cpx, points[i - 1][1], cpx, points[i][1], points[i][0], points[i][1]);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const cpx = (points[i - 1][0] + points[i][0]) / 2;
      ctx.bezierCurveTo(cpx, points[i - 1][1], cpx, points[i][1], points[i][0], points[i][1]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // End dot
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last[0], last[1], 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#0a0a0f";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [data, width, height, color, fillColor]);

  if (data.length < 2) {
    return (
      <div className="sparkline-empty">
        Collecting supply data...
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block" }}
    />
  );
}
