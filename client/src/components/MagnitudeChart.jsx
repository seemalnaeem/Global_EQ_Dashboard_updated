import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { chartColorByMagnitude } from '../config.js';

const DAYS = 2;

// Magnitude-over-time chart, ported from the old portal's chart.js. Plots the
// quakes from the last 48 hours as points colored by magnitude; clicking the
// panel goes fullscreen.
export default function MagnitudeChart({ quakes }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const now = Date.now();
    const cutoff = now - DAYS * 24 * 60 * 60 * 1000;
    const points = quakes
      .filter((q) => {
        const t = new Date(q.occurredAt).getTime();
        return !Number.isNaN(t) && t >= cutoff && t <= now && q.magnitude !== null;
      })
      .map((q) => ({ x: new Date(q.occurredAt), y: q.magnitude }));

    const colors = points.map((p) => chartColorByMagnitude(p.y));

    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Earthquake Magnitudes',
            borderColor: 'white',
            borderWidth: 0.5,
            data: points,
            backgroundColor: colors,
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#F3F3E0' } },
          title: {
            display: true,
            color: '#F3F3E0',
            text: 'Earthquakes in the Last 48 Hours',
            font: { family: 'Helvetica Neue', size: 17, weight: 'bold' }
          },
          tooltip: {
            callbacks: {
              label(context) {
                const date = new Date(context.raw.x).toLocaleString();
                return `Time: ${date}, Magnitude: ${context.raw.y}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'hour',
              stepSize: 12,
              tooltipFormat: 'PPpp',
              displayFormats: { hour: 'h:mm a', day: 'MMM d' }
            },
            ticks: {
              color: '#F3F3E0',
              autoSkip: false,
              maxRotation: 0,
              minRotation: 0,
              callback(value) {
                const date = new Date(value);
                const hours = date.getHours();
                if (hours === 0) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                if (hours === 12) return '12:00 PM';
                return '';
              }
            },
            title: { display: true, text: 'Time', color: '#F3F3E0' }
          },
          y: {
            ticks: { color: '#F3F3E0' },
            title: { display: true, text: 'Magnitude', color: '#F3F3E0' },
            min: 0,
            max: 8
          }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [quakes]);

  function handleFullscreen() {
    const el = document.getElementById('graph');
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
  }

  return (
    <div id="graph" onClick={handleFullscreen}>
      <canvas id="magnitudeChart" ref={canvasRef} height="100" style={{ cursor: 'pointer' }}></canvas>
    </div>
  );
}
