# Troubleshooting Gemini Integration

## Error: Model not found (404)

```
Publisher Model `projects/stebo-vertex/locations/us-central1/publishers/google/models/gemini-2.5-flash-001` was not found
```

**This means:** Credentials are working, but the Gemini model isn't available on your project.

### Solutions:

1. **Make sure billing is enabled** on your Google Cloud project:
   - Go to https://console.cloud.google.com
   - Go to **Billing** (left sidebar)
   - Ensure a payment method is attached
   - You should have $300 free credits available

2. **Enable required APIs**:
   ```bash
   # Using gcloud CLI:
   gcloud services enable vertexai.googleapis.com
   gcloud services enable aiplatform.googleapis.com
   gcloud services enable generativelanguage.googleapis.com
   ```

3. **Or enable via console**:
   - Go to **APIs & Services** → **Library**
   - Search for "Vertex AI API" and click **Enable**
   - Search for "Generative AI API" and click **Enable**
   - Search for "Cloud Logging API" and click **Enable**

4. **Try a different model**:
   - If gemini-2.5-flash-001 still doesn't work, try:
     - `gemini-2.0-flash`
     - `gemini-pro`
   
   Edit [route.ts](src/app/api/ai-enhance/route.ts) line 111:
   ```typescript
   `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent`
   ```

## Error: Missing fields

```
VERTEX_AI_CREDENTIALS ontbreekt velden: client_email, client_id
```

**This means:** Your Service Account JSON is incomplete.

See [SETUP_VERTEX_CREDENTIALS.md](SETUP_VERTEX_CREDENTIALS.md)

## Error: JSON parse error

```
VERTEX_AI_CREDENTIALS is geen geldige JSON
```

**This means:** The credentials file is corrupted.

Run:
```bash
node apply-vertex-credentials.js
```

And paste a fresh Service Account JSON from Google Cloud.

## Credentials look complete but still getting errors

1. Make sure you pushed to GitHub (triggers Vercel redeploy):
   ```bash
   git status
   git add .
   git commit -m "Update Vertex AI credentials"
   git push
   ```

2. Wait 2-3 minutes for Vercel to rebuild

3. Test again from a fresh browser window (clear cache):
   - `Ctrl+Shift+Delete` (or `Cmd+Shift+Delete` on Mac)
   - Clear all history
   - Reload https://stebo-reclame.vercel.app

4. Check logs:
   ```bash
   vercel logs --follow
   ```

## Everything set up but still not working?

1. Verify credentials locally:
   ```bash
   node -e "const fs=require('fs');const c=fs.readFileSync('.env.local','utf8').match(/VERTEX_AI_CREDENTIALS=(.+)/)[1];const j=JSON.parse(c);console.log('Valid:', j.client_email)"
   ```

2. Make sure project_id is correct:
   ```bash
   gcloud config get-value project
   ```

3. Check if service account has proper permissions:
   ```bash
   gcloud projects get-iam-policy stebo-vertex --flatten="bindings[].members" --format="table(bindings.role)" --filter="bindings.members:vertex-ai-sa@stebo-vertex.iam.gserviceaccount.com"
   ```
