import { focusRing } from "@/lib/ui";

export default function GoogleButton({ onClick, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#E5E5E5] bg-[#F1E9D2] px-4 py-2.5 text-sm font-medium text-[#111111] transition-colors hover:bg-[#EFEFEB] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing} ${className}`}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#E5E5E5] text-xs"
      >
        G
      </span>
      Continue with Google
    </button>
  );
}
