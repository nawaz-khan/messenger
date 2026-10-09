import { createClient } from '@supabase/supabase-js'; 
import * as fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = envFile.split('\n').reduce((acc: any, line: string) => {
    const [key, ...value] = line.split('=');
    if (key && value) acc[key.trim()] = value.join('=').trim().replace(/"/g, '');
    return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY); 
async function run() { 
    console.log('Fetching public groups...');
    const { data, error } = await supabase
        .from('groups')
        .select('*, conversations(conversation_members(count))')
        .eq('privacy', 'public')
        .order('created_at', { ascending: false });
    if (error) console.error("Error:", error);
    else console.dir(data, { depth: null });
} 
run();
