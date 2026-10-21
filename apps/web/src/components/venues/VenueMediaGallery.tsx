"use client";

import { ChevronLeft, ChevronRight, Expand, ImageOff, X } from "lucide-react";
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { keepDialogFocus } from "@/components/hospitality/dialog-focus";
import { VenuePhoto } from "./VenuePhoto";
import type { VenuePhotoAsset } from "./venue-showcases";
import styles from "./VenueMediaGallery.module.css";

export function VenueMediaGallery({
  name,
  images,
  videoSrc,
  videoLabel = "Video",
}: {
  name: string;
  images: VenuePhotoAsset[];
  videoSrc?: string;
  videoLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [failedVideo, setFailedVideo] = useState<string>();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const gallery = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const headingId = useId();
  const captionId = useId();
  const currentIndex = Math.min(index, Math.max(0, images.length - 1));
  const currentImage = images[currentIndex];

  function imageFailed(src: string) {
    setFailedImages((current) => new Set(current).add(src));
  }

  function openImage(nextIndex: number, trigger: HTMLButtonElement) {
    opener.current = trigger;
    setIndex(nextIndex);
    video.current?.pause();
    dialog.current?.showModal();
  }

  function moveImage(direction: number) {
    setIndex((current) => (Math.min(current, images.length - 1) + direction + images.length) % images.length);
  }

  function dialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    keepDialogFocus(event);
    if (event.altKey || event.ctrlKey || event.metaKey || images.length < 2) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveImage(event.key === "ArrowLeft" ? -1 : 1);
    }
  }

  function restoreFocus() {
    if (opener.current?.isConnected) opener.current.focus();
    else gallery.current?.focus();
  }

  return (
    <section ref={gallery} tabIndex={-1} className={styles.gallery} aria-label={`Bilder${videoSrc ? " och video" : ""} från ${name}`}>
      {images.length > 0 && <p className={styles.galleryHint}>Klicka på en bild för att se den större.</p>}
      {(images.length > 0 || videoSrc) ? (
          <div className={styles.imageGrid} style={{ "--media-columns": Math.min(4, images.length + Number(!!videoSrc)) } as CSSProperties}>
            {images.map((image, imageIndex) => {
              const failed = failedImages.has(image.src);
              return (
                <button
                  key={`${image.src}-${imageIndex}`}
                  type="button"
                  data-venue-thumbnail={imageIndex}
                  className={styles.thumbnail}
                  aria-haspopup="dialog"
                  aria-label={`${failed ? "Bilden kunde inte visas. " : ""}Öppna bild ${imageIndex + 1} av ${images.length}: ${image.alt || name}`}
                  onClick={(event) => openImage(imageIndex, event.currentTarget)}
                >
                  {failed ? (
                    <span className={styles.imageFallback} aria-hidden="true"><ImageOff size={30} /><span>Bilden kunde inte visas</span></span>
                  ) : (
                    <VenuePhoto image={image} className={styles.thumbnailPhoto} decorative onError={() => imageFailed(image.src)} />
                  )}
                  <span className={styles.expandIcon} aria-hidden="true"><Expand size={18} /></span>
                  <span className={styles.imageNumber} aria-hidden="true">{String(imageIndex + 1).padStart(2, "0")}</span>
                </button>
              );
            })}
            {videoSrc && (
        <figure className={styles.videoCard}>
          <div className={styles.videoHeading}>{videoLabel}</div>
          {failedVideo === videoSrc ? (
            <div className={styles.videoFallback} role="status"><p>Videon kunde inte visas just nu.</p></div>
          ) : (
            <video
              ref={video}
              className={styles.video}
              src={videoSrc}
              poster={images[0]?.crop ? undefined : images[0]?.src}
              controls
              playsInline
              preload="metadata"
              aria-label={`${videoLabel} från ${name}`}
              onError={() => setFailedVideo(videoSrc)}
            >
              Din webbläsare kan inte spela upp videon.
            </video>
          )}
          <figcaption className={styles.videoCaption}>{videoLabel.toLocaleLowerCase("sv-SE") === "bildspel" ? "Spelbart bildspel av bilderna." : "Spela upp videon för att se mer av lokalen."}</figcaption>
        </figure>
            )}
          </div>
      ) : <p className={styles.emptyGallery}>Fler bilder från lokalen kommer snart.</p>}

      {images.length > 0 && (
        <dialog ref={dialog} className={styles.lightbox} aria-labelledby={headingId} aria-describedby={captionId} onKeyDown={dialogKeyDown} onClose={restoreFocus}>
          <div className={styles.lightboxTop}>
            <div><h2 id={headingId}>{name}</h2><span>Bild {currentIndex + 1} av {images.length}</span></div>
            <button type="button" className={styles.closeButton} aria-label="Stäng bildgalleriet" autoFocus onClick={() => dialog.current?.close()}><X size={23} aria-hidden="true" /></button>
          </div>
          {currentImage && (
            <figure className={styles.lightboxFigure}>
              <div className={styles.lightboxStage}>
                {failedImages.has(currentImage.src) ? (
                  <div className={styles.imageFallback} role="img" aria-label={`${currentImage.alt || name}. Bilden kunde inte visas.`}><ImageOff size={42} aria-hidden="true" /><p>Bilden kunde inte visas just nu.</p></div>
                ) : (
                  <VenuePhoto key={`${currentImage.src}-${currentIndex}`} image={currentImage} className={styles.lightboxPhoto} fit="contain" onError={() => imageFailed(currentImage.src)} />
                )}
              </div>
              <figcaption id={captionId}>{currentImage.alt || `${name}, bild ${currentIndex + 1}`}</figcaption>
            </figure>
          )}
          {images.length > 1 && (
            <div className={styles.lightboxControls}>
              <button type="button" onClick={() => moveImage(-1)} aria-label="Föregående bild"><ChevronLeft size={20} aria-hidden="true" /><span>Föregående</span></button>
              <span className={styles.counter} aria-live="polite" aria-atomic="true">{currentIndex + 1} / {images.length}</span>
              <button type="button" onClick={() => moveImage(1)} aria-label="Nästa bild"><span>Nästa</span><ChevronRight size={20} aria-hidden="true" /></button>
            </div>
          )}
        </dialog>
      )}
    </section>
  );
}
