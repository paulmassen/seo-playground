// src/app/robots.ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',     // Keep the app UI out of search results
        '/api/',          // Don't crawl internal API routes
        '/_next/',        // Standard Next.js internal files
      ],
    },
    // Replace with your actual sitemap URL if you create one later
    // sitemap: 'https://yourdomain.com/sitemap.xml',
  };
}