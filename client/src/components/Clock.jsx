import { useEffect, useState } from 'react';

// Real-time clock, ported from the old portal's clock.js. Local time, updates
// every second.
export default function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div id="time">
      <div className="clock">{time}</div>
      <div className="date">{date}</div>
    </div>
  );
}
