import { ShieldCheck } from "lucide-react";
import { SEOHead } from "../seo/SEOHead";
import {
  BRAND_NAME,
  PRIVACY_POLICY_URL,
  SERVICE_WEBSITE_URL,
  SUPPORT_EMAIL,
  TERMS_OF_SERVICE_URL,
  USER_DATA_DELETION_URL,
} from "../config/brand";

const lastUpdated = "June 30, 2026";

const policySections = [
  {
    title: "1. Scope",
    content: [
      `${BRAND_NAME} is a business management platform that may connect with third-party services such as TikTok Shop, Facebook and other approved channels to help users manage operations, content, orders and customer interactions.`,
      "This Privacy Policy explains what data we collect, how we use it, how long we retain it and how users can revoke access or request deletion.",
    ],
  },
  {
    title: "2. Data We Receive",
    content: [
      "Account and profile data you provide directly, such as name, email address, phone number, company information and login credentials.",
      "Connection data received after you authorize a third-party platform, such as public profile identifiers, shop identifiers, page identifiers, OAuth access tokens, refresh tokens and permission scopes.",
      "Business data synchronized at your request, such as selected product catalog data, order data, inventory-related data, conversation metadata and media or text content that you choose to process through the platform.",
      "Technical usage data such as IP address, browser type, device information, timestamps, logs and security events.",
    ],
  },
  {
    title: "3. How We Use Data",
    content: [
      "To authenticate users and maintain secure access to the platform.",
      "To establish and maintain approved integrations, including TikTok Shop OAuth connections and related synchronization flows.",
      "To sync and display the data you explicitly authorize, including profile, order, product, messaging or publishing-related data supported by the connected platform.",
      "To generate AI-assisted drafts, content suggestions, media prompts or workflow automations based only on the materials and instructions you submit to the system.",
      "To monitor service reliability, prevent abuse, troubleshoot incidents and comply with applicable legal obligations.",
    ],
  },
  {
    title: "4. TikTok Shop And Other Platform Permissions",
    content: [
      "When you connect TikTok Shop or another third-party service, we only request and use the permissions required for the features you activate.",
      "For TikTok-related features, this may include scopes such as user identity verification, shop order synchronization or product synchronization when those features are enabled in your account.",
      "We do not ask users to provide their TikTok password directly to us. Access is granted through the platform's official authorization flow.",
    ],
  },
  {
    title: "5. AI Processing And User-Provided Materials",
    content: [
      "When you submit text, upload files or request AI-assisted image or content generation, the system may process the exact materials you provide in order to generate drafts or outputs.",
      "We design the workflow to prioritize source fidelity. However, users remain responsible for reviewing generated outputs before publication or business use.",
      "You should not upload materials that you are not authorized to process.",
    ],
  },
  {
    title: "6. Sharing And Disclosure",
    content: [
      "We may share data with infrastructure, hosting, analytics, AI or support providers only to the extent necessary to operate the service.",
      "We may disclose information when required by law, legal process, security response or to enforce our terms and protect the platform.",
      "We do not sell personal data provided through the service.",
    ],
  },
  {
    title: "7. Retention And Security",
    content: [
      "We retain account, connection and operational data only for as long as needed to provide the service, satisfy legal obligations, resolve disputes or enforce our agreements.",
      "OAuth tokens and platform connection credentials are stored with access controls and are disabled or removed when the integration is disconnected or a deletion request is completed.",
      "We use reasonable administrative, technical and organizational safeguards, but no system can guarantee absolute security.",
    ],
  },
  {
    title: "8. Your Choices And Rights",
    content: [
      "You may disconnect a linked platform from the integration settings inside the application.",
      "You may also revoke the application's access directly from the settings page of the connected third-party platform.",
      "You may request access, correction or deletion of eligible data by contacting our support channel or using the deletion page published by the service.",
    ],
  },
  {
    title: "9. Contact",
    content: [
      `Service website: ${SERVICE_WEBSITE_URL}`,
      `Privacy Policy: ${PRIVACY_POLICY_URL}`,
      `Terms of Service: ${TERMS_OF_SERVICE_URL}`,
      `Data deletion instructions: ${USER_DATA_DELETION_URL}`,
      `Support email: ${SUPPORT_EMAIL}`,
    ],
  },
];

export default function PrivacyPolicy() {
  const meta = {
    title: `Privacy Policy | ${BRAND_NAME}`,
    description: `Privacy Policy for ${BRAND_NAME}, including account data, connected platform data, TikTok Shop integration data and deletion rights.`,
    keywords: "privacy policy, TikTok Shop API, user data deletion, iGen ERP",
    path: "/privacy-policy",
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <SEOHead meta={meta} />

      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="h-4 w-4" />
              <span>Legal</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
              Privacy Policy
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              This page describes how {BRAND_NAME} handles account information, connected
              platform data, uploaded materials and data deletion requests for public app
              review and user reference.
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
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-slate-700">
          {BRAND_NAME} only accesses third-party platform data after an explicit user
          authorization flow. Users can revoke access at any time from the application
          settings or the connected platform settings.
        </div>

        {policySections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">{section.title}</h2>
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              {section.content.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
