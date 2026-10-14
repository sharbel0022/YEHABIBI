import 'server-only';
import { adminDb } from '@/lib/supabase';
import { isSupabaseReady, previewMenus, previewItems, previewSettings } from '@/lib/config';
import type { Menu, MenuItem, Settings } from '@/types/domain';

export async function getMenus(): Promise<Menu[]> {
  if (!isSupabaseReady()) return previewMenus;
  const { data, error } = await adminDb().from('menus').select('*').eq('active',true).order('sort_order');
  if (error) throw new Error('Kunde inte läsa meny');
  return (data || []) as Menu[];
}
/** Returns only visible, approved dishes. All database access remains server-side. */
export async function getMenuItems(): Promise<MenuItem[]> {
  if (!isSupabaseReady()) return previewItems;
  const { data, error } = await adminDb().from('menu_items').select('*').eq('active', true).order('sort_order');
  if (error) throw new Error('Kunde inte läsa maträtter. Kontrollera V2-migreringen.');
  return (data || []) as MenuItem[];
}
export async function getSettings(): Promise<Settings> {
  if (!isSupabaseReady()) return previewSettings;
  const { data, error } = await adminDb().from('business_settings').select('*').eq('id',1).single();
  if (error || !data) throw new Error('Kunde inte läsa inställningar');
  return data as Settings;
}
