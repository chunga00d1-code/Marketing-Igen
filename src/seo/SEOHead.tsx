import { useEffect } from "react";
import { BRAND_NAME, BRAND_TAGLINE } from "../config/brand";
import { buildDocumentTitle, DEFAULT_SEO, SEO_BASE_URL, SEO_DEFAULT_IMAGE, SEO_DEFAULT_LOCALE, type SeoMeta, resolveSeoUrl } from "./seo-config";

function ensureMeta(selector: string, attributes: Record<string, string>) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    Object.entries(attributes).forEach(([key, value]) => el!.setAttribute(key, value));
    document.head.appendChild(el);
  }
  return el;
}

function ensureLink(selector: string, attributes: Record<string, string>) {
  let el = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    Object.entries(attributes).forEach(([key, value]) => el!.setAttribute(key, value));
    document.head.appendChild(el);
  }
  return el;
}

function ensureJsonLd(id: string) {
  let el = document.head.querySelector(`#${id}`) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

export function SEOHead({ meta }: { meta: SeoMeta }) {
  useEffect(() => {
    const merged = {
      ...DEFAULT_SEO,
      ...meta,
      image: meta.image || SEO_DEFAULT_IMAGE,
      robots: meta.robots || DEFAULT_SEO.robots,
      type: meta.type || "website",
    };

    const canonicalUrl = resolveSeoUrl(merged.path);
    document.title = buildDocumentTitle(merged.title);
    document.documentElement.lang = "vi";

    ensureMeta('meta[name="description"]', { name: "description" }).setAttribute("content", merged.description);
    ensureMeta('meta[name="keywords"]', { name: "keywords" }).setAttribute("content", merged.keywords);
    ensureMeta('meta[name="robots"]', { name: "robots" }).setAttribute("content", merged.robots || "index, follow");
    ensureMeta('meta[name="author"]', { name: "author" }).setAttribute("content", BRAND_NAME);
    ensureMeta('meta[name="application-name"]', { name: "application-name" }).setAttribute("content", BRAND_NAME);
    ensureMeta('meta[name="apple-mobile-web-app-title"]', { name: "apple-mobile-web-app-title" }).setAttribute("content", BRAND_NAME);
    ensureMeta('meta[name="format-detection"]', { name: "format-detection" }).setAttribute("content", "telephone=no");
    ensureMeta('meta[name="referrer"]', { name: "referrer" }).setAttribute("content", "strict-origin-when-cross-origin");
    ensureMeta('meta[name="theme-color"]', { name: "theme-color" }).setAttribute("content", "#00aeca");

    ensureMeta('meta[property="og:type"]', { property: "og:type" }).setAttribute("content", merged.type || "website");
    ensureMeta('meta[property="og:locale"]', { property: "og:locale" }).setAttribute("content", SEO_DEFAULT_LOCALE);
    ensureMeta('meta[property="og:site_name"]', { property: "og:site_name" }).setAttribute("content", BRAND_NAME);
    ensureMeta('meta[property="og:title"]', { property: "og:title" }).setAttribute("content", merged.title);
    ensureMeta('meta[property="og:description"]', { property: "og:description" }).setAttribute("content", merged.description);
    ensureMeta('meta[property="og:url"]', { property: "og:url" }).setAttribute("content", canonicalUrl);
    ensureMeta('meta[property="og:image"]', { property: "og:image" }).setAttribute("content", merged.image || SEO_DEFAULT_IMAGE);
    ensureMeta('meta[property="og:image:secure_url"]', { property: "og:image:secure_url" }).setAttribute("content", merged.image || SEO_DEFAULT_IMAGE);
    ensureMeta('meta[property="og:image:width"]', { property: "og:image:width" }).setAttribute("content", "1200");
    ensureMeta('meta[property="og:image:height"]', { property: "og:image:height" }).setAttribute("content", "630");
    ensureMeta('meta[property="og:image:alt"]', { property: "og:image:alt" }).setAttribute("content", merged.title);

    ensureMeta('meta[name="twitter:card"]', { name: "twitter:card" }).setAttribute("content", "summary_large_image");
    ensureMeta('meta[name="twitter:title"]', { name: "twitter:title" }).setAttribute("content", merged.title);
    ensureMeta('meta[name="twitter:description"]', { name: "twitter:description" }).setAttribute("content", merged.description);
    ensureMeta('meta[name="twitter:image"]', { name: "twitter:image" }).setAttribute("content", merged.image || SEO_DEFAULT_IMAGE);

    ensureLink('link[rel="canonical"]', { rel: "canonical" }).setAttribute("href", canonicalUrl);
    ensureLink('link[rel="alternate"][hreflang="vi-VN"]', { rel: "alternate", hreflang: "vi-VN" }).setAttribute("href", canonicalUrl);
    ensureLink('link[rel="alternate"][hreflang="x-default"]', { rel: "alternate", hreflang: "x-default" }).setAttribute("href", canonicalUrl);

    const jsonLd = ensureJsonLd("igen-seo-jsonld");
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${SEO_BASE_URL}/#organization`,
          name: BRAND_NAME,
          url: SEO_BASE_URL,
          logo: {
            "@type": "ImageObject",
            url: SEO_DEFAULT_IMAGE,
          },
        },
        {
          "@type": "WebSite",
          "@id": `${SEO_BASE_URL}/#website`,
          name: BRAND_NAME,
          url: SEO_BASE_URL,
          inLanguage: "vi-VN",
          description: BRAND_TAGLINE,
          publisher: {
            "@id": `${SEO_BASE_URL}/#organization`
          }
        },
        {
          "@type": "WebApplication",
          "@id": `${canonicalUrl}/#webapplication`,
          name: BRAND_NAME,
          url: canonicalUrl,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description: merged.description,
          image: merged.image || SEO_DEFAULT_IMAGE,
          inLanguage: "vi-VN",
        },
        {
          "@type": "WebPage",
          "@id": `${canonicalUrl}/#webpage`,
          name: merged.title,
          url: canonicalUrl,
          description: merged.description,
          inLanguage: "vi-VN",
          isPartOf: {
            "@id": `${SEO_BASE_URL}/#website`
          },
          primaryImageOfPage: {
            "@type": "ImageObject",
            url: merged.image || SEO_DEFAULT_IMAGE,
          },
        },
      ],
    });
  }, [meta]);

  return null;
}
