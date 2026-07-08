import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Mail,
  Search,
  ShieldAlert,
  Trash2,
  Unplug,
} from "lucide-react";
import { SEOHead } from "../seo/SEOHead";
import {
  BRAND_NAME,
  SERVICE_WEBSITE_URL,
  SUPPORT_EMAIL,
  USER_DATA_DELETION_URL,
} from "../config/brand";

interface DeletionStatus {
  code: string;
  facebookUserId: string;
  status: "pending" | "processing" | "completed" | "failed";
  requestedAt: string;
  completedAt?: string;
  details?: string;
}

const lastUpdated = "June 30, 2026";

export default function UserDataDeletion() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusResult, setStatusResult] = useState<DeletionStatus | null>(null);

  const meta = {
    title: `User Data Deletion | ${BRAND_NAME}`,
    description: `Instructions for disconnecting integrations and requesting user data deletion from ${BRAND_NAME}.`,
    keywords: "user data deletion, TikTok Shop data deletion, Facebook data deletion, iGen ERP",
    path: "/user-data-deletion",
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get("code") || params.get("id");
    if (codeParam) {
      setCode(codeParam);
      void handleCheckStatus(codeParam);
    }
  }, []);

  const handleCheckStatus = async (checkCode: string) => {
    const activeCode = checkCode || code;
    if (!activeCode.trim()) {
      setError("Please enter a deletion request code.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatusResult(null);

    try {
      const response = await fetch(`/api/v1/facebook/data-deletion-status/${activeCode.trim()}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Deletion request code not found.");
      }

      setStatusResult(result.data);
    } catch (err: any) {
      setError(err.message || "Unable to check deletion request status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <SEOHead meta={meta} />

      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold uppercase tracking-wider">
              <ShieldAlert className="h-4 w-4" />
              <span>Privacy Control</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
              User Data Deletion
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              This page explains how users can disconnect third-party integrations, revoke
              platform access and request deletion of eligible data associated with{" "}
              {BRAND_NAME}.
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Search className="h-5 w-5 text-slate-700" />
              Check Request Status
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              If you already submitted a platform-triggered deletion request and received a
              confirmation code such as <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">DEL-XXXXXXXX</code>,
              you can check its processing status here.
            </p>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Example: DEL-3E5A29CD"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleCheckStatus("")}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white"
              />
              <button
                onClick={() => void handleCheckStatus("")}
                disabled={loading}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
              >
                {loading ? "Checking..." : "Check status"}
              </button>
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {statusResult && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <span className="font-mono font-semibold text-slate-800">{statusResult.code}</span>
                  {statusResult.status === "completed" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Completed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                      <Clock className="h-3 w-3" />
                      Processing
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-slate-600">
                  <p>
                    Platform user reference:{" "}
                    <span className="font-mono text-slate-800">
                      {statusResult.facebookUserId.slice(0, 6)}***
                    </span>
                  </p>
                  <p>
                    Requested at:{" "}
                    <span className="text-slate-800">
                      {new Date(statusResult.requestedAt).toLocaleString("en-US")}
                    </span>
                  </p>
                  {statusResult.completedAt && (
                    <p>
                      Completed at:{" "}
                      <span className="text-slate-800">
                        {new Date(statusResult.completedAt).toLocaleString("en-US")}
                      </span>
                    </p>
                  )}
                  {statusResult.details && (
                    <p className="rounded-xl bg-white px-3 py-2 text-xs leading-5 text-slate-600 border border-slate-200">
                      {statusResult.details}
                    </p>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs leading-5 text-slate-500">
              Note: the live status checker currently supports deletion codes generated by
              existing platform webhook flows. If your TikTok-related revocation or deletion
              request was submitted outside an automated callback, use the manual support
              channel below.
            </p>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-sm space-y-8">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Unplug className="h-5 w-5 text-slate-700" />
              1. Disconnect Inside The Application
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              If you connected TikTok Shop, Facebook or another supported channel to{" "}
              {BRAND_NAME}, you can remove that connection from the integration settings in
              your account. Once disconnected, the system will stop using the related access
              token for future synchronization.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-slate-700" />
              2. Revoke Access From The Third-Party Platform
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              You may also revoke the application's access directly from the settings page of
              the connected platform. After revocation, the service will no longer be able to
              retrieve new data from that platform.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="font-semibold text-slate-800">TikTok Shop or TikTok Account</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Revoke the application's authorization from your TikTok or TikTok Shop
                  account settings if you no longer want the service to access approved shop
                  or account data.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="font-semibold text-slate-800">Facebook Integration</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Remove the application from your Facebook business or account settings to
                  revoke future access and trigger the connected cleanup flow where
                  supported.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Mail className="h-5 w-5 text-slate-700" />
              3. Request Manual Deletion
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              If you want eligible data removed from the service entirely, submit a deletion
              request through our support channel and include enough information for us to
              identify the workspace or integration to be removed.
            </p>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              <p>
                Service website:{" "}
                <a
                  href={SERVICE_WEBSITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-slate-900 underline underline-offset-2"
                >
                  {SERVICE_WEBSITE_URL}
                </a>
              </p>
              <p>
                Deletion instructions URL:{" "}
                <a
                  href={USER_DATA_DELETION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-slate-900 underline underline-offset-2"
                >
                  {USER_DATA_DELETION_URL}
                </a>
              </p>
              <p>
                Contact email:{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-semibold text-slate-900 underline underline-offset-2"
                >
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">4. Data Categories Eligible For Cleanup</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="font-semibold text-slate-800">Connection Credentials</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Access tokens, refresh tokens and related platform connection identifiers
                  associated with the revoked integration.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="font-semibold text-slate-800">Synchronized Operational Data</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Eligible synchronized records, temporary caches and related metadata that
                  are no longer required for lawful retention or system integrity.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
