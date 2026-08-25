import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'
export const supabase = createClient(url, key)
export type BusLocation = { id:string; route_name:string; latitude:number; longitude:number; accuracy:number | null; is_active:boolean; updated_at:string }
