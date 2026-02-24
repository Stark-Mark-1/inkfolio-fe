"use client";

import { useState } from "react";
import { focusRing } from "@/lib/ui";

export default function OTPForm({ onSendCode, onVerify }) {
  // prettier-ignore
  const submitButtonClass = [
    "inline-flex",
    "w-full",
    "items-center",
    "justify-center",
    "rounded-md",
    "bg-[#1E3A8A]",
    "px-4",
    "py-2.5",
    "text-sm",
    "font-medium",
    "text-white",
    "transition-colors",
    "hover:bg-[#1C347C]",
    "disabled:cursor-not-allowed",
    "disabled:opacity-70",
    focusRing
  ].join(" ");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSendCode = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      if (onSendCode) {
        await onSendCode(email);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      setCodeSent(true);
      setMessage("Code sent. Check your email.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      if (onVerify) {
        await onVerify({ email, otp });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      setMessage("Code verified.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={codeSent ? handleVerify : handleSendCode}
      aria-label="Email OTP sign in form"
    >
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-[#111111]">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`w-full rounded-md border border-[#E5E5E5] bg-[#F1E9D2] px-3 py-2 text-sm text-[#111111] placeholder:text-[#777777] ${focusRing}`}
          placeholder="name@company.com"
        />
      </div>

      {codeSent && (
        <div>
          <label htmlFor="otp" className="mb-1 block text-sm font-medium text-[#111111]">
            OTP (6 digits)
          </label>
          <input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
            className={`w-full rounded-md border border-[#E5E5E5] bg-[#F1E9D2] px-3 py-2 text-sm tracking-[0.2em] text-[#111111] placeholder:text-[#777777] ${focusRing}`}
            placeholder="000000"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className={submitButtonClass}
      >
        {isLoading ? "Please wait..." : codeSent ? "Verify" : "Send code"}
      </button>

      {message && <p className="text-sm text-[#555555]">{message}</p>}
    </form>
  );
}
