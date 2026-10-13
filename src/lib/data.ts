import 'server-only';
import { adminDb } from '@/lib/supabase';
import { isSupabaseReady, previewMenus, previewSettings } from '@/lib/config';
import type { Menu, Settings } from '@/types/domain';

export async function getMenus(): Promise<Menu[]> {
  if (!isSupabaseReady()) return previewMenus;
  const { data, error } = await adminDb().from('menus').select('*').eq('active',true).order('sort_order');
  if (error) throw new Error('Kunde inte läsa meny');
  return (data || []) as Menu[];
}
export async function getSettings(): Promise<Settings> {
  if (!isSupabaseReady()) return previewSettings;
  const { data, error } = await adminDb().from('business_settings').select('*').eq('id',1).single();
  if (error || !data) throw new Error('Kunde inte läsa inställningar');
  return data as Settings;
}
