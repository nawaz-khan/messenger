import { createClient } from '@supabase/supabase-js'; 
import * as fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = envFile.split('\n').reduce((acc: any, line: string) => {
    const [key, ...value] = line.split('=');
    if (key && value) acc[key.trim()] = value.join('=').trim().replace(/"/g, '');
    return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY); 
async function run() { 
    console.log('Fetching members with nested groups...');
    const { data, error } = await supabase
        .from('conversation_members')
        .select('conversation_id, user_id, role, conversations(id, groups(*))');
    if (error) console.error(error);
    else console.dir(data, { depth: null });
} 
run();
