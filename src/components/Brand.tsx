import Link from 'next/link';
export function Brand({light=false}:{light?:boolean}){
  return <Link href="/" aria-label="Cedar Mezze, startsida" className={`brand ${light?'brand-light':''}`}>
    <img src="/brand-mark.svg" alt="" aria-hidden="true" width="48" height="54"/>
    <span><strong>Cedar Mezze</strong><small>LIBANESISK CATERING</small></span>
  </Link>;
}
