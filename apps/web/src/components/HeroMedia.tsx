'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

export function HeroMedia({ videoUrl, poster }: { videoUrl: string | null; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [allowMotion, setAllowMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAllowMotion(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!allowMotion) { video.pause(); return; }
    video.play().catch(() => setPlaying(false));
  }, [allowMotion, videoUrl]);
  function toggle() {
    const video = ref.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => setPlaying(false));
    else video.pause();
  }
  return <div className="hero-media">
    <img src={poster} alt="Inspiration: libanesisk mezze och färska råvaror" className="hero-poster" fetchPriority="high"/>
    {videoUrl && <video ref={ref} muted loop playsInline preload="metadata" poster={poster} className="hero-video"
      aria-hidden="true" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
      <source src={videoUrl}/>
    </video>}
    {videoUrl && <button type="button" className="hero-play" onClick={toggle} aria-label={playing ? 'Pausa filmen' : 'Spela filmen'}>
      {playing ? <Pause size={18}/> : <Play size={18}/>} <span>{playing ? 'Pausa video' : 'Spela video'}</span>
    </button>}
  </div>;
}
