# Get Google Service Account Credentials via gcloud CLI

This is faster than using the web console.

## Prerequisites

1. Install gcloud CLI: https://cloud.google.com/sdk/docs/install
2. Run `gcloud init` and login with your Google account
3. Make sure your project is "stebo-vertex": `gcloud config set project stebo-vertex`

## Steps

### 1. Create a new Service Account

```bash
gcloud iam service-accounts create vertex-ai-sa \
  --display-name="Vertex AI Service Account"
```

### 2. Grant Vertex AI permissions

```bash
gcloud projects add-iam-policy-binding stebo-vertex \
  --member="serviceAccount:vertex-ai-sa@stebo-vertex.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding stebo-vertex \
  --member="serviceAccount:vertex-ai-sa@stebo-vertex.iam.gserviceaccount.com" \
  --role="roles/editor"
```

### 3. Download credentials as JSON

```bash
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=vertex-ai-sa@stebo-vertex.iam.gserviceaccount.com
```

This creates `service-account-key.json` in your current directory.

### 4. Apply to stebo-reclame

```bash
cd stebo-reclame
cat ../service-account-key.json | node apply-vertex-credentials.js
```

If using Windows PowerShell:
```powershell
Get-Content ../service-account-key.json | node apply-vertex-credentials.js
```

### 5. Verify and deploy

```bash
# Check .env.local was updated
grep -A 2 VERTEX_AI_CREDENTIALS .env.local

# Push to GitHub (triggers Vercel redeploy)
git add SETUP_VERTEX_CREDENTIALS.md
git commit -m "Vertex AI credentials set up"
git push

# Test locally
npm run dev
```

## Troubleshooting

**"Project not found"**: Run `gcloud config set project stebo-vertex`

**"Permission denied"**: Make sure you're logged in: `gcloud auth login`

**"Service account already exists"**: Use a different name, like `vertex-ai-sa-2`

**"resource...does not have serviceprincipal"**: Wait a few seconds and retry, Google Cloud needs time to propagate
