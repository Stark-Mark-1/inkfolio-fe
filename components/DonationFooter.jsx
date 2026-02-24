"use client";

import { useState } from "react";
import DonationModal from "./DonationModal";
import { focusRing } from "@/lib/ui";

export default function DonationFooter() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E5E5E5] bg-[#F1E9D2]">
        <div className="mx-auto flex max-w-[1040px] justify-center px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`rounded-md px-2 py-1 text-sm text-[#555555] underline-offset-2 transition-colors hover:text-[#1E3A8A] hover:underline ${focusRing}`}
          >
            Support Indian Army Families
          </button>
        </div>
      </div>
      <DonationModal open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
