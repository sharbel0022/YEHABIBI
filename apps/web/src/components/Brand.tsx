import Link from "next/link";
export function Brand({
  light = false,
  onNavigate,
}: {
  light?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      aria-label="Yei Habibi – Catering & Fest, startsida"
      className={`brand ${light ? "brand-light" : ""}`}
    >
      <img
        src="/brand-mark.svg"
        alt=""
        aria-hidden="true"
        width="48"
        height="54"
      />
      <span>
        <strong>Yei Habibi</strong>
        <small>CATERING &amp; FEST</small>
      </span>
    </Link>
  );
}
