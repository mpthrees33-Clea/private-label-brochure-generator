'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || '';

// gtag declaration for TypeScript
declare global {
  interface Window {
    gtag: (...args: (string | Date | { [key: string]: unknown })[]) => void;
    dataLayer: unknown[];
  }
}

export function pageview(path: string) {
  if (!GA_MEASUREMENT_ID || typeof window === 'undefined') return;
  window.gtag('config', GA_MEASUREMENT_ID, {
    page_path: path,
  });
}

export function event(
  action: string,
  params?: { [key: string]: string | number | boolean }
) {
  if (!GA_MEASUREMENT_ID || typeof window === 'undefined') return;
  window.gtag('event', action, params ?? {});
}

// Inner tracker holds the useSearchParams() call. Must sit under a
// Suspense boundary so Next.js can statically prerender pages that
// don't otherwise opt into dynamic rendering — without this wrap, every
// static page in the app fails the build with "useSearchParams() should
// be wrapped in a suspense boundary".
function GoogleAnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    const path = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    pageview(path);
  }, [pathname, searchParams]);

  return null;
}

export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
      <Script
        id="gtag-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', {
              page_path: window.location.pathname,
            });
          `,
        }}
      />
      <Suspense fallback={null}>
        <GoogleAnalyticsTracker />
      </Suspense>
    </>
  );
}
