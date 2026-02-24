import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";
import MinimalLayout from "@/components/MinimalLayout";
import OTPForm from "@/components/OTPForm";

export default function SignInPage() {
  return (
    <MinimalLayout>
      <main className="flex min-h-screen items-center justify-center py-12">
        <section className="w-full max-w-md rounded-lg border border-[#E5E5E5] bg-[#F1E9D2] p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-[#111111]">Sign in</h1>
            <p className="mt-2 text-sm text-[#555555]">
              Use email OTP or Google to access your saved work.
            </p>
          </div>

          <div className="space-y-4">
            <OTPForm />
            <div className="relative py-1">
              <div className="border-t border-[#E5E5E5]" />
              <span className="absolute left-1/2 top-0 -translate-x-1/2 bg-[#F1E9D2] px-2 text-xs text-[#555555]">
                or
              </span>
            </div>
            <GoogleButton />
          </div>

          <div className="mt-6 border-t border-[#E5E5E5] pt-4">
            <Link
              href="/"
              className="text-sm text-[#1E3A8A] underline-offset-2 hover:underline"
            >
              Back to landing
            </Link>
          </div>
        </section>
      </main>
    </MinimalLayout>
  );
}
