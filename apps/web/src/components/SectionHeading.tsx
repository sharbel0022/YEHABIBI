export function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return <div className="section-heading">
    <span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}
  </div>;
}
