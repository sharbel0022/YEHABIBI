import { Facebook, Instagram } from "lucide-react";
import styles from "./SocialLinks.module.css";

const socials = [
  {
    label: "Yehabibi på Facebook",
    url: "https://www.facebook.com/yehabibi.se/",
    Icon: Facebook,
  },
  {
    label: "Yehabibi på Instagram",
    url: "https://www.instagram.com/yehabibi.se/",
    Icon: Instagram,
  },
];

export function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`${styles.links} ${className}`} aria-label="Följ Yehabibi" role="group">
      {socials.map(({ label, url, Icon }) => (
        <a key={url} href={url} aria-label={`${label} (öppnas i ny flik)`} target="_blank" rel="noopener noreferrer">
          <Icon size={19} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
