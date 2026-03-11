"use client";

import { useEffect, useRef } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import GoogleButton from "./GoogleButton";
import OTPForm from "./OTPForm";
import { focusRing } from "@/lib/ui";

async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

async function signInWithEmail(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

async function registerWithEmail(email, password) {
  await createUserWithEmailAndPassword(auth, email, password);
}

// variant: "signin" | "nudge" | "predeploy"
//
// "nudge"    — shown after file upload, skippable
// "signin"   — standard sign-in modal
// "predeploy"— shown before deploying (legacy, kept for compat)
export default function AuthModal({
  open,
  onClose,
  variant = "signin",
  onContinueGuest,
  onSignInSuccess,
  onSignIn,
}) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSuccess = () => {
    onSignInSuccess?.();
    onClose?.();
  };

  const handleGoogleSignIn = async () => {
    await signInWithGoogle();
    handleSuccess();
  };

  const isNudge = variant === "nudge";
  const isPreDeploy = variant === "predeploy";

  const title = isNudge
    ? "Sign in to save your work"
    : isPreDeploy
    ? "Before you deploy"
    : "Sign in";

  const titleId = isNudge ? "auth-nudge-title" : isPreDeploy ? "auth-predeploy-title" : "auth-modal-title";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/15 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="w-full max-w-md rounded-lg border border-[#E5E5E5] bg-[#F1E9D2] p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-[#111111]">
            {title}
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
            {isNudge && (
              <p className="text-sm text-[#555555]">
                Sign in to save your portfolio and access it later. You can also skip and continue anonymously.
              </p>
            )}

            <GoogleButton onClick={handleGoogleSignIn} />

            <div className="relative py-1">
              <div className="border-t border-[#E5E5E5]" />
              <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-[#F1E9D2] px-2 text-xs text-[#555555]">
                or
              </span>
            </div>

            <OTPForm
              onSignIn={signInWithEmail}
              onRegister={registerWithEmail}
              onSuccess={handleSuccess}
            />

            {isNudge && (
              <button
                type="button"
                onClick={onContinueGuest}
                className={`w-full rounded-md border border-[#E5E5E5] px-4 py-2.5 text-sm font-medium text-[#111111] transition-colors hover:bg-[#EFEFEB] ${focusRing}`}
              >
                Continue without signing in
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
