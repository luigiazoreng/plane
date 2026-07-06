/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router";
import { observer } from "mobx-react";
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
  const [loading, setLoading] = useState(false);

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

    setLoading(true);
    try {
      await publicStore.resetPasswordCustomer(pSlug, token, password);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Password reset",
        message: "Your password has been reset. You can now sign in.",
      });
      navigate(`/helpdesk/p/${pSlug}/login`);
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Unable to reset password",
        message: err?.response?.data?.error || "This reset link may be invalid or expired.",
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="text-sm text-text-200 mb-1.5 block font-medium">
            New Password
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            placeholder="Create a strong password"
            className="w-full"
            required
            minLength={8}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="text-sm text-text-200 mb-1.5 block font-medium">
            Confirm Password
          </label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            className="w-full"
            required
            minLength={8}
          />
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
