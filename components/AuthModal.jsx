"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import GoogleButton from "./GoogleButton";
import OTPForm from "./OTPForm";
import { supabase } from "@/lib/supabase";
import { focusRing } from "@/lib/ui";

async function sendOtp(email) {
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw new Error(error.message);
}

async function verifyOtp({ email, otp }) {
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });
  if (error) throw new Error(error.message);
}

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/workspace` },
  });
  if (error) throw new Error(error.message);
}

export default function AuthModal({
  open,
  onClose,
  variant = "signin",
  onContinueGuest,
  onSignIn,
}) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isPreDeploy = variant === "predeploy";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/15 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={isPreDeploy ? "auth-nudge-title" : "auth-modal-title"}
    >
      <div className="w-full max-w-md rounded-lg border border-[#E5E5E5] bg-[#F1E9D2] p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2
            id={isPreDeploy ? "auth-nudge-title" : "auth-modal-title"}
            className="text-lg font-semibold text-[#111111]"
          >
            {isPreDeploy ? "Before you deploy" : "Sign in"}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={`rounded-md px-2 py-1 text-sm text-[#555555] transition-colors hover:bg-[#EFEFEB] hover:text-[#111111] ${focusRing}`}
            aria-label="Close auth modal"
          >
            Close
          </button>
        </div>

        {isPreDeploy ? (
          <div className="space-y-5">
            <p className="text-sm text-[#555555]">
              Deploying creates a permanent URL. Sign in to manage it later.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onSignIn}
                className={`rounded-md bg-[#1E3A8A] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] ${focusRing}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={onContinueGuest}
                className={`rounded-md border border-[#E5E5E5] px-4 py-2.5 text-sm font-medium text-[#111111] transition-colors hover:bg-[#EFEFEB] ${focusRing}`}
              >
                Continue as Guest
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[#555555]">
              Use email OTP or your Google account to continue.
            </p>
            <OTPForm onSendCode={sendOtp} onVerify={verifyOtp} onSuccess={onClose} />
            <div className="relative py-1">
              <div className="border-t border-[#E5E5E5]" />
              <span className="absolute left-1/2 top-0 -translate-x-1/2 bg-[#F1E9D2] px-2 text-xs text-[#555555]">
                or
              </span>
            </div>
            <GoogleButton onClick={signInWithGoogle} />
            <p className="text-sm text-[#555555]">
              Prefer full page?{" "}
              <Link href="/auth/signin" className="text-[#1E3A8A] underline-offset-2 hover:underline">
                Open sign in page
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
