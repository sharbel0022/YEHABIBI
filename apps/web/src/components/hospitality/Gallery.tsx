"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { keepDialogFocus } from "./dialog-focus";

export function Gallery({
  images,
  name,
}: {
  images: { src: string; alt: string }[];
  name: string;
}) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<number | null>(null);
  if (!images.length) return <p>Bilder inväntar godkännande.</p>;
  const image = images[index % images.length];
  const move = (step: number) =>
    setIndex((current) => (current + step + images.length) % images.length);
  const keys = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    }
  };
  return (
    <div className="venue-gallery" onKeyDown={keys}>
      <button
        className="gallery-main"
        ref={opener}
        type="button"
        aria-label={`Visa större bild av ${name}`}
        onClick={() => dialog.current?.showModal()}
      >
        <img src={image.src} alt={image.alt} width={1000} height={750} />
        <span>
          <Maximize2 size={17} />
          Visa större
        </span>
      </button>
      <div className="gallery-thumbnails" aria-label="Välj bild">
        {images.map((item, i) => (
          <button
            key={`${item.src}-${i}`}
            type="button"
            aria-label={`Bild ${i + 1}: ${item.alt}`}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            <img
              src={item.src}
              alt=""
              width={180}
              height={120}
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <dialog
        className="gallery-dialog"
        onKeyDown={keepDialogFocus}
        ref={dialog}
        aria-label={`Bildgalleri för ${name}`}
        onClose={() => opener.current?.focus()}
        onPointerDown={(event) => {
          touchStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          const start = touchStart.current;
          if (start !== null && Math.abs(event.clientX - start) > 60)
            move(event.clientX < start ? 1 : -1);
          touchStart.current = null;
        }}
      >
        <button
          type="button"
          className="icon-button gallery-close"
          aria-label="Stäng bildgalleri"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        <img src={image.src} alt={image.alt} width={1400} height={1000} />
        <div className="gallery-controls">
          <button
            type="button"
            className="btn"
            aria-label="Föregående bild"
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </button>
          <p aria-live="polite">
            Bild {index + 1} av {images.length}
          </p>
          <button
            type="button"
            className="btn"
            aria-label="Nästa bild"
            onClick={() => move(1)}
          >
            <ChevronRight />
          </button>
        </div>
        <p className="gallery-caption">{image.alt}</p>
      </dialog>
    </div>
  );
}
