import { Utensils } from "lucide-react";
import { dishPreview } from "./presentation";
import styles from "./DishPhoto.module.css";

export function DishPhoto({ name, className = "" }: { name: string; className?: string }) {
  const photo = dishPreview(name);
  if (!photo) return (
    <span className={`${styles.photo} ${styles.placeholder} ${className}`} aria-hidden="true">
      <Utensils size={24} />
    </span>
  );
  const scale = photo.zoom / 100;
  return (
    <span
      role="img"
      aria-label={name}
      className={`${styles.photo} ${className}`}
      style={{
        backgroundImage: `url("${photo.src}")`,
        backgroundSize: `${photo.zoom}% auto`,
        backgroundPosition: `${((scale * photo.x - 0.5) / (scale - 1)) * 100}% ${((scale * photo.y - 0.5) / (scale - 1)) * 100}%`,
      }}
    />
  );
}
