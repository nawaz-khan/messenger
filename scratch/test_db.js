const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function test() {
  console.log('Testing Supabase Connection...');
  const { data, error } = await supabase.from('message_read_receipts').select('*').limit(5);
  console.log('Read receipts data:', data);
  console.log('Read receipts error:', error);
}

test();
