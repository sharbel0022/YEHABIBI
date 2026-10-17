'use client';
import {useEffect,useRef,useState} from 'react';
import { Pause, Play } from 'lucide-react';

export function HeroMedia({videoUrl,poster}:{videoUrl:string|null;poster:string}){
  const ref=useRef<HTMLVideoElement>(null);
  const [playing,setPlaying]=useState(false);
  const [allowMotion,setAllowMotion]=useState(true);
  useEffect(()=>{
    const m=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>setAllowMotion(!m.matches);
    update();m.addEventListener('change',update);return()=>m.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    if(!ref.current)return;
    if(!allowMotion){ref.current.pause();return;}
    ref.current.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));
  },[allowMotion,videoUrl]);
  function toggle(){if(!ref.current)return;if(ref.current.paused){ref.current.play().then(()=>setPlaying(true)).catch(()=>{});}else{ref.current.pause();setPlaying(false);}}
  return <div className="hero-media">
    <img src={poster} alt="Inspiration: libanesisk mezze och färska råvaror" className="hero-poster" fetchPriority="high"/>
    {videoUrl&&<video ref={ref} muted loop playsInline preload="metadata" poster={poster} className="hero-video" aria-hidden="true"><source src={videoUrl}/></video>}
    {videoUrl&&<button type="button" className="hero-play" onClick={toggle} aria-label={playing?'Pausa filmen':'Spela filmen'}>{playing?<Pause size={18}/>:<Play size={18}/>} <span>{playing?'Pausa video':'Spela video'}</span></button>}
  </div>;
}
