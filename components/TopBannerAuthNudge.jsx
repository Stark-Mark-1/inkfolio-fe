"use client";

import { useState } from "react";
import Link from "next/link";
import { focusRing } from "@/lib/ui";

export default function TopBannerAuthNudge({ onSignIn, onContinueGuest }) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="border-b border-[#E5E5E5] py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#555555]">Sign in to save your progress.</p>
        <div className="flex items-center gap-2">
          {onSignIn ? (
            <button
              type="button"
              onClick={onSignIn}
              className={`rounded-md border border-[#E5E5E5] px-3 py-1.5 text-sm text-[#111111] transition-colors hover:bg-[#EFEFEB] ${focusRing}`}
            >
              Sign In
            </button>
          ) : (
            <Link
              href="/auth/signin"
              className={`rounded-md border border-[#E5E5E5] px-3 py-1.5 text-sm text-[#111111] transition-colors hover:bg-[#EFEFEB] ${focusRing}`}
            >
              Sign In
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              onContinueGuest?.();
              setVisible(false);
            }}
            className={`rounded-md border border-[#E5E5E5] px-3 py-1.5 text-sm text-[#111111] transition-colors hover:bg-[#EFEFEB] ${focusRing}`}
          >
            Continue as Guest
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className={`px-2 py-1 text-xs text-[#555555] underline-offset-2 transition-colors hover:text-[#111111] hover:underline ${focusRing}`}
            aria-label="Dismiss sign-in nudge"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
