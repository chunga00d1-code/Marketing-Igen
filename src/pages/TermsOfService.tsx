import { Scale } from "lucide-react";
import { SEOHead } from "../seo/SEOHead";
import {
  BRAND_NAME,
  PRIVACY_POLICY_URL,
  SERVICE_WEBSITE_URL,
  SUPPORT_EMAIL,
  TERMS_OF_SERVICE_URL,
} from "../config/brand";

const lastUpdated = "June 30, 2026";

const sections = [
  {
    title: "1. Acceptance",
    body: [
      `These Terms of Service govern access to and use of ${BRAND_NAME}, including its web application, connected platform integrations, APIs, AI-assisted workflows and related services.`,
      "By accessing or using the service, you agree to comply with these terms and all applicable laws and platform rules.",
    ],
  },
  {
    title: "2. Account Responsibility",
    body: [
      "You are responsible for maintaining the confidentiality of your account credentials and for the activities performed under your account.",
      "You must provide accurate registration and operational information and keep it up to date.",
    ],
  },
  {
    title: "3. Connected Platform Integrations",
    body: [
      "The service may integrate with TikTok Shop, Facebook and other approved third-party platforms through their official authorization mechanisms.",
      "Your use of any connected platform through the service must also comply with that platform's own developer terms, content policies, commerce policies and community rules.",
      "If you revoke access, remove permissions or disconnect an integration, the related synchronization features may stop immediately.",
    ],
  },
  {
    title: "4. Customer Content And Lawful Use",
    body: [
      "You retain responsibility for all text, files, prompts, images, videos, listings, messages and other content submitted through the service.",
      "You must ensure that your use of the service and any published output does not infringe intellectual property rights, violate privacy rights, mislead users or break any law or platform policy.",
      "You may not use the service for spam, fraud, unauthorized automation, credential abuse or illegal commercial activity.",
    ],
  },
  {
    title: "5. AI-Assisted Features",
    body: [
      "The service may offer AI-assisted drafting, analysis, prompt generation, media generation and automation support.",
      "AI outputs are generated from the instructions and materials submitted by the user and may still require human review.",
      "You are solely responsible for reviewing outputs before publication, advertising, commerce or legal reliance.",
    ],
  },
  {
    title: "6. Availability And Changes",
    body: [
      "We may update, suspend or refine features, integrations or technical requirements as platforms, laws or infrastructure change.",
      "We may restrict access to protect service integrity, prevent abuse, address security risks or comply with legal obligations.",
    ],
  },
  {
    title: "7. Termination",
    body: [
      "You may stop using the service at any time and may disconnect integrated accounts from the settings area where available.",
      "We may suspend or terminate access if we reasonably believe there is a violation of these terms, a platform policy breach, a security issue or unlawful use of the service.",
    ],
  },
  {
    title: "8. Disclaimer And Limitation",
    body: [
      "The service is provided on an as-available basis. We do not guarantee uninterrupted availability, platform compatibility at all times or that AI-generated results will be error-free.",
      "To the maximum extent allowed by law, we are not liable for indirect, incidental or consequential losses arising from your use of the service.",
    ],
  },
  {
    title: "9. Contact",
    body: [
      `Service website: ${SERVICE_WEBSITE_URL}`,
      `Terms of Service: ${TERMS_OF_SERVICE_URL}`,
      `Privacy Policy: ${PRIVACY_POLICY_URL}`,
      `Support email: ${SUPPORT_EMAIL}`,
    ],
  },
];

export default function TermsOfService() {
  const meta = {
    title: `Terms of Service | ${BRAND_NAME}`,
    description: `Terms of Service for ${BRAND_NAME}, including connected platform use, AI-assisted features and customer responsibilities.`,
    keywords: "terms of service, TikTok Shop, platform integrations, iGen ERP",
    path: "/terms-of-service",
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <SEOHead meta={meta} />

      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-bold uppercase tracking-wider">
              <Scale className="h-4 w-4" />
              <span>Legal</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
              Terms of Service
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              These terms explain the rules for using {BRAND_NAME}, including social
              platform integrations, AI-assisted features and customer responsibilities.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm shrink-0">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Service
              </p>
              <p className="mt-1 font-semibold text-slate-800">{BRAND_NAME}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Last Updated
              </p>
              <p className="mt-1 font-semibold text-slate-800">{lastUpdated}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-8">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-6 text-slate-700">
          Use of any TikTok Shop or other connected-platform feature through {BRAND_NAME}
          remains subject to the policies and technical limitations of that platform.
        </div>

        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">{section.title}</h2>
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
