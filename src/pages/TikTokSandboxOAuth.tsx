import React, { useState } from "react";
import { ArrowLeftRight, HelpCircle, ShieldAlert, UserCircle, Video } from "lucide-react";

export default function TikTokSandboxOAuth() {
  const [authorizing, setAuthorizing] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);
  const target = searchParams.get("target") || "personal";

  type SandboxOAuthPayload =
    | {
        ok: true;
        target: string;
        profile: {
          username: string;
          displayName: string;
          avatarUrl: string;
        };
      }
    | {
        ok: false;
        target: string;
        error: string;
      };

  const sendResult = (payload: SandboxOAuthPayload) => {
    try {
      localStorage.setItem("tt_oauth_result", JSON.stringify(payload));
    } catch (error) {
      console.error("TikTok sandbox localStorage error:", error);
    }

    try {
      if (window.opener) {
        window.opener.postMessage({ type: "TIKTOK_OAUTH_RESULT", payload }, window.location.origin);
      }
    } catch (error) {
      console.error("TikTok sandbox postMessage error:", error);
    }
  };

  const handleAuthorize = () => {
    setAuthorizing(true);
    setTimeout(() => {
      sendResult({
        ok: true,
        target,
        profile: {
          username: "igen_marketing_sandbox",
          displayName: target === "company" ? "iGen Marketing Business Sandbox" : "iGen Marketing Sandbox",
          avatarUrl: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150&auto=format&fit=crop&q=80",
        },
      });
      window.close();
    }, 900);
  };

  const handleCancel = () => {
    sendResult({
      ok: false,
      target,
      error: "User cancelled TikTok Sandbox authorization.",
    });
    window.close();
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#0a0a0a] font-sans text-slate-100 selection:bg-[#fe2c55]/30">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-900 bg-[#0f0f10] px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-black">
            <span className="text-sm font-black tracking-tighter text-white">TikTok</span>
            <div className="absolute -inset-0.5 rounded-lg bg-[#fe2c55] opacity-20 blur-xs" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Developer Sandbox</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Testing Environment
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-8">
        <div className="mb-8 text-center">
          <div className="mb-5 flex items-center justify-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-650 shadow-lg">
              <span className="font-serif text-2xl font-extrabold text-white">iM</span>
            </div>
            <ArrowLeftRight className="h-5 w-5 animate-pulse text-slate-500" />
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-slate-800 bg-[#111]">
              <img
                src="https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150&auto=format&fit=crop&q=80"
                alt="TikTok Sandbox"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-white">
            Authorize <span className="text-indigo-400">iGen Marketing</span>
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            to access your TikTok Sandbox account for account connection and video publishing.
          </p>
        </div>

        <div className="mb-6 flex gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 text-left">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-200">Developer Testing Mode Enabled</p>
            <p className="text-[11px] leading-relaxed text-slate-400">
              This mock consent screen demonstrates only the TikTok scopes requested for review: basic account identity and video publishing.
            </p>
          </div>
        </div>

        <div className="space-y-4 text-left">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            This app will receive permission to:
          </p>

          <div className="space-y-4 rounded-2xl border border-slate-900 bg-[#0f0f10] p-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
                <UserCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-slate-200">Read basic account identity</p>
                  <span className="rounded-md bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">user.info.basic</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Used to confirm which sandbox TikTok account is connected and display the account name in iGen Marketing.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 border-t border-slate-950 pt-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#fe2c55]/20 bg-[#fe2c55]/10 text-[#fe2c55]">
                <Video className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-slate-200">Publish videos prepared by the user</p>
                  <span className="rounded-md bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">video.publish</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Used to submit a video from a TikTok content card after the user reviews and clicks the publish action.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-slate-500">
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="text-[10px]">Access can be revoked from TikTok or from the integration settings.</span>
        </div>
      </main>

      <footer className="sticky bottom-0 z-10 flex items-center gap-4 border-t border-slate-900 bg-[#0f0f10] px-6 py-5">
        <button
          onClick={handleCancel}
          disabled={authorizing}
          className="flex-1 cursor-pointer rounded-xl border border-slate-700/50 bg-slate-800 py-3 text-xs font-bold text-slate-300 transition-all hover:bg-slate-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleAuthorize}
          disabled={authorizing}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#fe2c55] to-[#f2203e] py-3 text-xs font-bold text-white shadow-md shadow-[#fe2c55]/20 transition-all hover:brightness-110 disabled:opacity-50"
        >
          {authorizing ? "Connecting..." : "Authorize"}
        </button>
      </footer>
    </div>
  );
}
