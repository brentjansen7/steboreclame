const fs = require('fs');
const { exec } = require('child_process');

// Read .env.production
const envContent = fs.readFileSync('.env.production', 'utf8');
const match = envContent.match(/VERTEX_AI_CREDENTIALS=(.+)/s);
if (!match) {
  console.error('VERTEX_AI_CREDENTIALS not found in .env.production');
  process.exit(1);
}

const creds = match[1].trim();

// Validate
try {
  JSON.parse(creds);
  console.log('✓ JSON valid');
} catch (e) {
  console.error('JSON invalid:', e.message);
  process.exit(1);
}

// Write to temp file
const path = require('path');
const tempFile = path.join(process.env.TEMP || '/tmp', 'vertex-creds-' + Date.now() + '.txt');
fs.writeFileSync(tempFile, creds);

// Run vercel env add
const cmd = process.platform === 'win32'
  ? `type "${tempFile}" | vercel env add VERTEX_AI_CREDENTIALS production`
  : `cat "${tempFile}" | vercel env add VERTEX_AI_CREDENTIALS production`;

exec(cmd, (err, stdout, stderr) => {
  fs.unlinkSync(tempFile);
  if (err) {
    console.error('Error:', stderr);
    process.exit(1);
  }
  console.log(stdout);
  console.log('✓ Credentials set in Vercel');
});
