'use client';
export function PrintOrderButton() { return <button type="button" className="btn btn-primary no-print" onClick={()=>window.print()}>Skriv ut order</button>; }
