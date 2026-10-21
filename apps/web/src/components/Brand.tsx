import Link from "next/link";
export function Brand({
  light = false,
  signature = false,
  onNavigate,
}: {
  light?: boolean;
  signature?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      aria-label={`${signature ? "Ye" : "Yei"} Habibi – Catering & Fest, startsida`}
      className={`brand ${light ? "brand-light" : ""} ${signature ? "brand-signature" : ""}`}
    >
      {signature ? (
        <img
          src="/brand/ye-habibi-signature.svg"
          alt=""
          aria-hidden="true"
          width="240"
          height="84"
        />
      ) : (
        <>
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
        </>
      )}
    </Link>
  );
}
