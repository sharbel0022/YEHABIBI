"use client";
import { useId, useState } from "react";
import type { VenuePhotoAsset } from "./venue-showcases";
export function VenuePhoto({ image, className, decorative = false, fit = "cover", onError }: {
  image: VenuePhotoAsset; className?: string; decorative?: boolean; fit?: "cover" | "contain"; onError?: () => void;
}) {
  const [failedSource, setFailedSource] = useState<string>();
  const clipId = useId();
  function failed() { setFailedSource(image.src); onError?.(); }
  if (failedSource === image.src) return <span className={className} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : image.alt} aria-hidden={decorative || undefined} style={{display:"grid",placeItems:"center",background:"#121610",color:"#c8bc9b",padding:20}}>Bilden kunde inte laddas.</span>;
  if (!image.crop) return <img className={className} src={image.src} alt={decorative ? "" : image.alt} loading="lazy" onError={failed} />;
  const {left,top,width,height} = image.crop;
  return <svg className={className} viewBox={`${left} ${top} ${width} ${height}`} preserveAspectRatio={fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : image.alt} aria-hidden={decorative || undefined} style={{display:"block",overflow:"hidden"}}><defs><clipPath id={clipId}><rect x={left} y={top} width={width} height={height} /></clipPath></defs><image href={image.src} width={1448} height={1086} clipPath={`url(#${clipId})`} onError={failed} /></svg>;
}
