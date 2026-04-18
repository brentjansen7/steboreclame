# Setting Up Vertex AI Credentials

The "Genereer met Gemini" feature requires valid Google Service Account credentials.

## Current Status

Your `.env.local` file has incomplete credentials. The following fields are **missing**:
- `client_email` (critical for authentication)
- `client_id` (required for JWT)

## How to Fix

### Option 1: Get Service Account JSON from Google Cloud (Recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Make sure you're in project **stebo-vertex** (top left dropdown)
3. Go to **IAM & Admin** → **Service Accounts** (left sidebar)
4. Look for a service account (or create one if none exists)
5. Click on it to open details
6. Go to **Keys** tab
7. Click **Add Key** → **Create new key**
8. Choose **JSON** format
9. A JSON file will download - open it with Notepad++
10. Copy the ENTIRE contents (including the outer `{}`)
11. Run this command:
    ```bash
    cd stebo-reclame
    node apply-vertex-credentials.js
    ```
12. Paste the JSON when prompted
13. If successful, run:
    ```bash
    npm run dev
    ```

### Option 2: Use the Setup Script

Once you have the JSON file:

```bash
cd stebo-reclame

# Copy your downloaded JSON file to the stebo-reclame folder
# Then run:
node apply-vertex-credentials.js < /path/to/service-account-key.json
```

## Testing

After setup:
1. Run `npm run dev` (or `npm run build && npm start`)
2. Open http://localhost:3000
3. Go to a project preview
4. Click "Genereer met Gemini" button
5. Should work without errors

## Troubleshooting

- **Error: "VERTEX_AI_CREDENTIALS is geen geldige JSON"** → Credentials are still incomplete or corrupted
- **Error: "project_id ontbreekt"** → The JSON doesn't have all required fields
- **401 Unauthorized** → The client_email or private_key is invalid

## Required Fields in Service Account JSON

The complete JSON must have:
- `type`: "service_account"
- `project_id`: your Google Cloud project ID
- `private_key_id`: unique key identifier
- `private_key`: PEM-formatted private RSA key
- `client_email`: service account email (looks like name@projectid.iam.gserviceaccount.com)
- `client_id`: numeric ID
- `auth_uri`: (optional, defaults to Google's OAuth)
- `token_uri`: (optional, defaults to Google's token endpoint)

## Need Help?

Make sure you have:
1. ✓ A Google Cloud account with billing enabled
2. ✓ Vertex AI API enabled on your project
3. ✓ A valid Service Account in that project
4. ✓ Downloaded the credentials as JSON (not PDF)
