import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    'GasWatch Pro: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set.\n' +
    'Running in Demo Mode with simulated data.\n' +
    'Set these in your .env file to connect to real hardware.'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
