'use client';

import {useState} from 'react';
import {uploadAdminFile} from '@/lib/browser-upload';
import type {LegacyDeliveryZone,Settings} from '@/types/domain';

type Editable = Omit<Settings,'id'>;

/** A single place to manage branding, delivery prices and seasonal campaigns. */
export function AdminSettings({initialSettings}:{initialSettings:Settings}) {
  const [form,setForm]=useState<Editable>(initialSettings);
  const [zonesText,setZonesText]=useState(
    (initialSettings.delivery_zones||[])
      .map(zone=>`${zone.name} | ${zone.postal_prefix} | ${zone.fee_ore/100}`).join('\n')
  );
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);

  function set<K extends keyof Editable>(key:K,value:Editable[K]){
    setForm(old=>({...old,[key]:value}));
  }
  function parseZones():LegacyDeliveryZone[] {
    return zonesText.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{
      const [name,prefix,price,...rest]=line.split('|').map(s=>s.trim());
      const kronor=Number((price||'').replace(',','.'));
      if(rest.length||!name||!/^[0-9]{1,5}$/.test(prefix||'')||
        !Number.isFinite(kronor)||kronor<0||kronor>10000){
        throw new Error('Leveranszon måste skrivas: Område | Postnummerprefix | Pris i kr');
      }
      return {name,postal_prefix:prefix,fee_ore:Math.round(kronor*100)};
    });
  }
  async function save(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setMessage('');setBusy(true);
    try {
      const updated={...form,delivery_zones:parseZones()};
      const res=await fetch('/api/admin/settings',{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(updated)
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Kunde inte spara.');
      setForm(data.settings as Settings);
      setMessage('Sparat. Ändringarna visas på webbplatsen.');
    }catch(e){setMessage(e instanceof Error?e.message:'Kunde inte spara.');}
    finally{setBusy(false);}
  }
  async function upload(file:File|undefined,field:'hero_video_url'|'hero_poster_url'|'campaign_image_url') {
    if(!file)return;setUploading(true);setMessage('');
    try {
      const url=await uploadAdminFile(file);
      set(field,url);
      setMessage('Filen är uppladdad. Tryck Spara för att publicera.');
    }catch(e){setMessage(e instanceof Error?e.message:'Uppladdningen misslyckades.');}
    finally{setUploading(false);}
  }
  return <form className="admin-panel" onSubmit={save}>
    <h2>Inställningar för Cedar Mezze</h2>
    <p className="admin-note">Bara riktiga företagsuppgifter, godkända priser och bilder från ägaren/fotografen ska publiceras.</p>

    <h3>Företag och kontakt</h3>
    <div className="admin-grid"><div>
      {([['brand_name','Varumärkesnamn'],['tagline','Slogan'],['description','Kort beskrivning'],
        ['contact_email','Kontaktmejl'],['contact_phone','Telefon']] as const).map(([key,label])=>
        <div className="field" key={key}><label htmlFor={key}>{label}</label>
          <input id={key} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></div>)}
    </div><div>
      {([['service_area','Leveransområde'],['location_city','Ort'],['pickup_address','Hämtadress']] as const).map(([key,label])=>
        <div className="field" key={key}><label htmlFor={key}>{label}</label>
          <input id={key} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></div>)}
      <div className="field"><label htmlFor="minPeople">Minsta sällskap som får bygga egen meny</label>
        <input id="minPeople" type="number" min="1" max="100" value={form.custom_min_people}
          onChange={e=>set('custom_min_people',Number(e.target.value))}/></div>
    </div></div>

    <h3>Leverans eller hämtning</h3>
    <div className="field-grid">
      <div className="field"><label htmlFor="baseFee">Grundavgift för leverans, kr</label>
        <input id="baseFee" type="number" min="0" step="0.01" value={form.delivery_fee_ore/100}
          onChange={e=>set('delivery_fee_ore',Math.round(Number(e.target.value)*100))}/></div>
      <div className="field"><label htmlFor="leadDays">Framförhållning, antal dagar</label>
        <input id="leadDays" type="number" min="0" max="90" value={form.min_advance_days}
          onChange={e=>set('min_advance_days',Number(e.target.value))}/></div>
    </div>
    <div className="field"><label htmlFor="zones">Postnummerzoner (en per rad)</label>
      <textarea id="zones" rows={3} value={zonesText} onChange={e=>setZonesText(e.target.value)}
        placeholder="Västerås centrum | 722 | 49\nVästerås övrigt | 72 | 99"/>
      <p className="field-hint">Format: Namn | första 1–5 siffrorna i postnummer | leveranspris i kronor. Längsta prefix gäller. Grundavgiften är den synliga V2-fallbackzonen. Katalogen och Expo använder samma zoner.</p>
    </div>
    {([['delivery_enabled','Erbjud hemleverans'],['pickup_enabled','Erbjud hämtning'],
      ['cash_enabled','Tillåt kontantbetalning vid hämtning']] as const).map(([key,label])=>
      <label key={key} className="checkbox-label"><input type="checkbox" checked={form[key]}
        onChange={e=>set(key,e.target.checked)}/>{label}</label>)}

    <h3>Startsida och media</h3>
    <div className="admin-grid">
      <div className="field"><label htmlFor="heroVideo">Ägarens MP4/WebM för startsidan</label>
        <input id="heroVideo" type="file" accept="video/mp4,video/webm" disabled={uploading}
          onChange={e=>upload(e.target.files?.[0],'hero_video_url')}/>
        <input aria-label="Startsidesvideons länk" placeholder="https://..." value={form.hero_video_url||''}
          onChange={e=>set('hero_video_url',e.target.value)}/></div>
      <div className="field"><label htmlFor="heroPoster">Stillbild när video inte spelas</label>
        <input id="heroPoster" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
          onChange={e=>upload(e.target.files?.[0],'hero_poster_url')}/>
        <input aria-label="Stillbildens länk" value={form.hero_poster_url||''}
          onChange={e=>set('hero_poster_url',e.target.value)}/></div>
    </div>

    <h3>Säsongskampanj – en åt gången</h3>
    <p className="admin-note">Exempel: Ramadan, påskfasta, jul, nyår eller student. Visa bara godkända kampanjer och datum.</p>
    <label className="checkbox-label"><input type="checkbox" checked={form.campaign_enabled}
      onChange={e=>set('campaign_enabled',e.target.checked)}/>Visa kampanjen på startsidan</label>
    <div className="field-grid">
      <div className="field"><label htmlFor="campaignTitle">Rubrik</label><input id="campaignTitle"
        value={form.campaign_title} onChange={e=>set('campaign_title',e.target.value)} placeholder="Samlas till iftar"/></div>
      <div className="field"><label htmlFor="campaignDescription">Kort beskrivning</label><textarea id="campaignDescription"
        value={form.campaign_description} onChange={e=>set('campaign_description',e.target.value)}/></div>
      <div className="field"><label htmlFor="campaignStart">Visa från</label><input id="campaignStart" type="date"
        value={form.campaign_start_date||''} onChange={e=>set('campaign_start_date',e.target.value||null)}/></div>
      <div className="field"><label htmlFor="campaignEnd">Visa till</label><input id="campaignEnd" type="date"
        value={form.campaign_end_date||''} onChange={e=>set('campaign_end_date',e.target.value||null)}/></div>
    </div>
    <div className="field"><label htmlFor="campaignPhoto">Kampanjbild</label>
      <input id="campaignPhoto" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
        onChange={e=>upload(e.target.files?.[0],'campaign_image_url')}/>
      <input aria-label="Kampanjbildens länk" value={form.campaign_image_url||''}
        onChange={e=>set('campaign_image_url',e.target.value)}/></div>

    <h3>Google och sociala medier</h3>
    <div className="admin-grid">
      {([['google_review_url','Officiell Google-recensionslänk'],['google_maps_url','Google Maps'],
        ['instagram_url','Instagram'],['facebook_url','Facebook'],['tiktok_url','TikTok']] as const).map(([key,label])=>
        <div className="field" key={key}><label htmlFor={key}>{label}</label>
          <input id={key} type="url" placeholder="https://..." value={form[key]||''}
            onChange={e=>set(key,e.target.value)}/></div>)}
    </div>
    {message&&<p className="preview-note" role="status">{message}</p>}
    <button className="btn btn-primary" disabled={busy||uploading} type="submit">{busy?'Sparar...':'Spara allt'}</button>
    <div className="divider"/>
    <h3>QR-koder till cateringbeställning och Google-recensioner</h3>
    <p className="admin-note">Beställningskoden kräver korrekt domän. Googles kod visas bara när en officiell recensionslänk finns.</p>
    <div className="admin-grid">
      <div><strong>Beställ catering</strong><img style={{width:220,maxWidth:'100%'}} src="/api/qr/bestall" alt="QR-kod för beställning"/>
        <a href="/api/qr/bestall" download="cedar-mezze-bestall.svg" className="text-link">Ladda ner</a></div>
      {form.google_review_url&&<div><strong>Google-omdöme</strong>
        <img style={{width:220,maxWidth:'100%'}} src="/api/qr/google" alt="QR-kod för riktiga Google-recensioner"/>
        <a href="/api/qr/google" download="cedar-mezze-google.svg" className="text-link">Ladda ner</a></div>}
    </div>
  </form>;
}
