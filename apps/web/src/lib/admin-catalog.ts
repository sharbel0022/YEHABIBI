import 'server-only';
import { adminDb } from '@/lib/supabase';
export async function configuredMenuAddons(ids:string[]|undefined) {
  if(!ids?.length)return true;
  if(new Set(ids).size!==ids.length)return false;
  const {data,error}=await adminDb().from('dishes').select('id').in('id',ids).eq('active',true).eq('direct_addon_enabled',true);
  return !error&&data?.length===ids.length;
}
