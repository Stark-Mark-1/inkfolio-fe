"use client";

import { useState } from "react";
import { focusRing } from "@/lib/ui";

// Email + password sign-in / register form for Firebase auth.
// Props:
//   onSignIn(email, password)   → called when signing into an existing account
//   onRegister(email, password) → called when creating a new account
//   onSuccess()                 → called after successful auth
export default function OTPForm({ onSignIn, onRegister, onSuccess }) {
  const [mode, setMode] = useState("signin"); // "signin" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const submitButtonClass = [
    "inline-flex w-full items-center justify-center rounded-md bg-[#1E3A8A]",
    "px-4 py-2.5 text-sm font-medium text-white transition-colors",
    "hover:bg-[#1C347C] disabled:cursor-not-allowed disabled:opacity-70",
    focusRing,
  ].join(" ");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");
    setIsError(false);

    try {
      if (mode === "signin") {
        await onSignIn?.(email, password);
      } else {
        await onRegister?.(email, password);
      }
      setMessage(mode === "signin" ? "Signed in." : "Account created.");
      onSuccess?.();
    } catch (err) {
      setIsError(true);
      setMessage(err?.message || "Something went wrong. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} aria-label="Email sign in form">
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
          onChange={(e) => setEmail(e.target.value)}
          className={`w-full rounded-md border border-[#E5E5E5] bg-[#F1E9D2] px-3 py-2 text-sm text-[#111111] placeholder:text-[#777777] ${focusRing}`}
          placeholder="name@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-[#111111]">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`w-full rounded-md border border-[#E5E5E5] bg-[#F1E9D2] px-3 py-2 text-sm text-[#111111] placeholder:text-[#777777] ${focusRing}`}
          placeholder="••••••••"
        />
      </div>

      <button type="submit" disabled={isLoading} className={submitButtonClass}>
        {isLoading
          ? "Please wait..."
          : mode === "signin"
          ? "Sign In"
          : "Create Account"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "signin" ? "register" : "signin"));
          setMessage("");
        }}
        className="text-xs text-[#555555] underline-offset-2 hover:underline"
      >
        {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
      </button>

      {message && (
        <p className={`text-sm ${isError ? "text-red-600" : "text-[#555555]"}`}>{message}</p>
      )}
    </form>
  );
}
