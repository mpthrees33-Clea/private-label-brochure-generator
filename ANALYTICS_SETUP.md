# Google Analytics Setup

## Step 1: Get Your Measurement ID

1. Go to [https://analytics.google.com](https://analytics.google.com)
2. Sign in with your Google account
3. Click "Get started today" or "Create property"
4. Property name: `Quick Flip Brochures` (or whatever you want)
5. Time zone: Eastern Time (or your preference)
6. Currency: USD
7. Click Next → answer the business questions → Create
8. Choose "Web" as your platform
9. Website URL: `https://brochures.clea-solutions.ai`
10. Stream name: `Production`
11. Click Create stream
12. Copy the **Measurement ID** (looks like `G-XXXXXXXXXX`)

## Step 2: Add to Environment

Add this to a `.env.local` file in your project root (never commit this):

```
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

## Step 3: Redeploy

```bash
cd /home/cleaserver/projects/quick-flip-brochures
npm run build
# or pm2 restart / however you deploy
```

## What Gets Tracked

- Page views (all routes)
- Referrers (where traffic comes from)
- Geography (country, city)
- Device type (desktop/mobile/tablet)
- Browser & OS
- Session duration
- User count (unique visitors)

## Custom Events

Use the `event()` helper anywhere in client components:

```tsx
import { event } from '@/components/GoogleAnalytics';

// Track brochure creation
event('generate_brochure', { factory: 'Florida Tile', collection: 'Bellanova' });

// Track PDF download
event('download_pdf', { product_id: '123' });
```

## Dashboard

Data shows up in GA4 within minutes:
- **Reports → Engagement → Pages and screens** — page views
- **Reports → Acquisition → Traffic acquisition** — referrers
- **Reports → Demographics** — location, device
