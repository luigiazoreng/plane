/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router";
import { observer } from "mobx-react";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { Input } from "@plane/propel/input";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { publicHelpdeskStore as publicStore } from "@/store/public-helpdesk.store";

const HelpdeskResetPasswordPage = observer(() => {
  const { publicSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pSlug = publicSlug?.toString() || "";
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) return;

    if (password !== confirmPassword) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Passwords don't match",
        message: "Make sure both passwords are the same.",
      });
      return;
    }

    if (password.length < 8) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Password too short",
        message: "Password must be at least 8 characters long.",
      });
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      await publicStore.resetPasswordCustomer(pSlug, token, password);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Password reset",
        message: "Your password has been reset. You can now sign in.",
      });
      navigate(`/helpdesk/p/${pSlug}/login`);
    } catch (err: any) {
      const errorText =
        err?.response?.data?.error || "This reset link may be invalid or expired. Please request a new one.";
      setErrorMessage(errorText);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Unable to reset password",
        message: errorText,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="shadow-sm mx-auto mt-12 max-w-md rounded-lg border border-subtle bg-surface-2 p-8 text-center">
        <h1 className="text-2xl text-text-100 font-bold">Invalid reset link</h1>
        <p className="text-sm text-text-400 mt-2">
          This password reset link is missing or invalid. Please request a new one.
        </p>
        <Link
          to={`/helpdesk/p/${pSlug}/forgot-password`}
          className="text-sm mt-6 inline-block font-medium text-primary hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="shadow-sm mx-auto mt-12 max-w-md rounded-lg border border-subtle bg-surface-2 p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl text-text-100 font-bold">Set a new password</h1>
        <p className="text-sm text-text-400 mt-2">Choose a new password for your support account.</p>
      </div>

      {errorMessage && (
        <div className="border-danger/30 bg-danger/10 text-sm text-danger mb-4 flex items-start gap-2.5 rounded-md border p-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">{errorMessage}</p>
            <p className="text-xs">
              <Link to={`/helpdesk/p/${pSlug}/forgot-password`} className="hover:text-text-100 font-medium underline">
                Click here to request a new link
              </Link>
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="text-sm text-text-200 mb-1.5 block font-medium">
            New Password
          </label>
          <div className="relative flex items-center">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder="Create a strong password"
              className="w-full pr-10"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="text-text-400 hover:text-text-200 absolute right-3 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-text-400 mt-1">
            Must be at least 8 characters. Avoid common words or predictable phrases.
          </p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="text-sm text-text-200 mb-1.5 block font-medium">
            Confirm Password
          </label>
          <div className="relative flex items-center">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full pr-10"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="text-text-400 hover:text-text-200 absolute right-3 transition-colors"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" variant="primary" className="mt-6 w-full justify-center" loading={loading}>
          Reset password
        </Button>
      </form>

      <p className="text-sm text-text-400 mt-6 text-center">
        Remembered your password?{" "}
        <Link to={`/helpdesk/p/${pSlug}/login`} className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
});

export default HelpdeskResetPasswordPage;
