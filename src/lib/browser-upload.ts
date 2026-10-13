import { createBrowserClient } from '@supabase/ssr';

/** Browser sends the file straight to Supabase via a short-lived, admin-authorized token. */
export async function uploadAdminFile(file:File):Promise<string>{
  const response=await fetch('/api/admin/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,size:file.size,contentType:file.type})});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Kunde inte förbereda uppladdning.');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)throw new Error('Uppladdning saknar konfiguration.');
  const supabase=createBrowserClient(url,key);
  const {error}=await supabase.storage.from('catering-media').uploadToSignedUrl(result.path,result.token,file,{contentType:file.type});
  if(error)throw new Error(error.message);
  return result.url;
}
