#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { execSync } = require('child_process');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function main() {
  console.log('Google Vertex AI Service Account Setup\n');

  // Check if JSON was piped in
  let jsonInput = '';

  if (!process.stdin.isTTY) {
    // Data is being piped in
    for await (const chunk of process.stdin) {
      jsonInput += chunk;
    }
  } else {
    // Interactive mode
    await new Promise(resolve => {
      console.log('Paste your Service Account JSON file contents below.');
      console.log('(Press Enter twice when done)\n');

      let lines = [];
      let emptyCount = 0;

      const onLine = (line) => {
        if (line.trim() === '') {
          emptyCount++;
          if (emptyCount >= 2) {
            rl.removeListener('line', onLine);
            rl.close();
            jsonInput = lines.join('\n');
            resolve();
          }
        } else {
          emptyCount = 0;
          lines.push(line);
        }
      };

      rl.on('line', onLine);
    });
  }

  if (!jsonInput.trim()) {
    console.error('No input received');
    process.exit(1);
  }

  // Parse and validate JSON
  let credentials;
  try {
    credentials = JSON.parse(jsonInput);
    console.log('\n✓ JSON is valid');
  } catch (e) {
    console.error('\n✗ Invalid JSON:', e.message);
    process.exit(1);
  }

  // Check required fields
  const required = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email', 'client_id'];
  const missing = required.filter(f => !credentials[f]);

  if (missing.length > 0) {
    console.error('✗ Missing required fields:', missing.join(', '));
    process.exit(1);
  }

  // Validate private_key format
  if (!credentials.private_key.includes('BEGIN PRIVATE KEY') || !credentials.private_key.includes('END PRIVATE KEY')) {
    console.error('✗ private_key does not look like a valid PEM key');
    process.exit(1);
  }

  console.log('✓ All required fields present');
  console.log('  project_id:', credentials.project_id);
  console.log('  client_email:', credentials.client_email);

  // Update .env.local
  const envLocalPath = '.env.local';
  if (!fs.existsSync(envLocalPath)) {
    console.error('✗ .env.local not found');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  const jsonString = JSON.stringify(credentials);
  const newEnv = envContent.replace(
    /VERTEX_AI_CREDENTIALS=.+?(?=\n[A-Z_]+=|$)/s,
    `VERTEX_AI_CREDENTIALS=${jsonString}`
  );

  fs.writeFileSync(envLocalPath, newEnv);
  console.log('\n✓ Updated .env.local');

  // Create base64 for Vercel
  const b64 = Buffer.from(jsonString).toString('base64');
  fs.writeFileSync('.env.vertex-creds-b64.txt', b64);
  console.log('✓ Created base64 version');

  // Show next steps
  console.log('\n=== Next Steps ===\n');
  console.log('1. Set credentials in Vercel:');
  console.log('   vercel env rm VERTEX_AI_CREDENTIALS 2>/dev/null || true');
  console.log('   vercel env add VERTEX_AI_CREDENTIALS_B64 production < .env.vertex-creds-b64.txt');
  console.log('\n2. Push to GitHub:');
  console.log('   git add .env.vertex-creds-b64.txt');
  console.log('   git commit -m "Add Vertex AI credentials"');
  console.log('   git push');
  console.log('\n3. Test locally:');
  console.log('   npm run dev');
  console.log('   Then test the "Genereer met Gemini" button');

  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
