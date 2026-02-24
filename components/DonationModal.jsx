"use client";

import { useEffect, useRef } from "react";
import { focusRing } from "@/lib/ui";

export default function DonationModal({ open, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/15 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="donation-modal-title"
    >
      <div className="w-full max-w-md rounded-lg border border-[#E5E5E5] bg-[#F1E9D2] p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id="donation-modal-title" className="text-lg font-semibold text-[#111111]">
            Support Indian Army Families
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={`rounded-md px-2 py-1 text-sm text-[#555555] transition-colors hover:bg-[#EFEFEB] hover:text-[#111111] ${focusRing}`}
            aria-label="Close donation modal"
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-[#555555]">Official donation link</p>
            <a
              href="https://www.indianarmy.nic.in/"
              target="_blank"
              rel="noreferrer"
              className={`mt-1 inline-block text-sm font-medium text-[#1E3A8A] underline-offset-2 hover:underline ${focusRing}`}
            >
              indianarmy.nic.in
            </a>
          </div>

          <div>
            <p className="mb-2 text-sm text-[#555555]">UPI QR</p>
            <div className="flex h-44 items-center justify-center rounded-md border border-dashed border-[#E5E5E5] bg-[#F4F4F2] text-sm text-[#555555]">
              QR Placeholder
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
