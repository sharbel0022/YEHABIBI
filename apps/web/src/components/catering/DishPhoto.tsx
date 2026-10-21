import { Utensils } from "lucide-react";
import { dishPreview } from "./presentation";
import { getDishPhoto } from "./plock-data";
import styles from "./DishPhoto.module.css";

export function DishPhoto({ name, className = "" }: { name: string; className?: string }) {
  const original = getDishPhoto(name);
  if (original) return <span role="img" aria-label={name} className={`${styles.photo} ${className}`} style={{ backgroundImage: `url("${original}")`, backgroundSize: original.endsWith("/baklava.jpg") ? "auto 145%" : "cover", backgroundPosition: original.endsWith("/baklava.jpg") ? "center bottom" : "center" }} />;
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
