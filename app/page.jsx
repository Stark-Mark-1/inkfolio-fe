"use client";

import Link from "next/link";
import { useState } from "react";
import AuthModal from "@/components/AuthModal";
import DonationFooter from "@/components/DonationFooter";
import MinimalLayout from "@/components/MinimalLayout";
import TopBannerAuthNudge from "@/components/TopBannerAuthNudge";
import { focusRing } from "@/lib/ui";

export default function LandingPage() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <MinimalLayout>
      <TopBannerAuthNudge onSignIn={() => setIsAuthModalOpen(true)} />

      <main className="pb-28 pt-10 sm:pt-12">
        <section className="max-w-3xl border-t border-[#E5E5E5] pt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
            Title
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111111] sm:text-3xl">
            Write better. Launch smarter.
          </h1>
        </section>

        <section className="mt-8 max-w-3xl border-t border-[#E5E5E5] pt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
            Summary
          </p>
          <p className="max-w-2xl text-base leading-relaxed text-[#555555] sm:text-lg">
            Improve your resume. Generate a portfolio. Deploy instantly.
          </p>
        </section>

        <section className="mt-8 max-w-3xl border-t border-[#E5E5E5] pt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
            Actions
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/workspace"
              className={`rounded-md bg-[#1E3A8A] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] ${focusRing}`}
            >
              Upload Resume
            </Link>
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className={`rounded-md border border-[#E5E5E5] px-5 py-2.5 text-sm font-medium text-[#111111] transition-colors hover:bg-[#EFEFEB] ${focusRing}`}
            >
              Sign In
            </button>
          </div>
        </section>
      </main>

      <AuthModal open={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <DonationFooter />
    </MinimalLayout>
  );
}
