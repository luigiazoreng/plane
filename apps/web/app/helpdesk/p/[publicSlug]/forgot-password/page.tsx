/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { useParams, Link } from "react-router";
import { observer } from "mobx-react";
import { Input } from "@plane/propel/input";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { publicHelpdeskStore as publicStore } from "@/store/public-helpdesk.store";

const HelpdeskForgotPasswordPage = observer(() => {
  const { publicSlug } = useParams();
  const pSlug = publicSlug?.toString() || "";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    setLoading(true);
    try {
      await publicStore.forgotPasswordCustomer(pSlug, cleanEmail);
      setEmail(cleanEmail);
      setSubmitted(true);
    } catch (_err) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Something went wrong",
        message: "Unable to process your request. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shadow-sm mx-auto mt-12 max-w-md rounded-lg border border-subtle bg-surface-2 p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl text-primary font-bold">Reset your password</h1>
        <p className="text-sm text-placeholder mt-2">Enter your email and we'll send you a link to reset your password.</p>
      </div>

      {submitted ? (
        <div className="space-y-6 text-center">
          <p className="text-sm text-secondary">
            If an account exists for <span className="text-primary font-medium">{email}</span>, we've sent a password
            reset link to that address.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center"
            onClick={() => {
              setSubmitted(false);
              setEmail("");
            }}
          >
            Try a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-sm text-secondary mb-1.5 block font-medium">
              Email Address
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full"
              required
            />
          </div>

          <Button type="submit" variant="primary" className="mt-6 w-full justify-center" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}

      <p className="text-sm text-placeholder mt-6 text-center">
        Remembered your password?{" "}
        <Link to={`/helpdesk/p/${pSlug}/login`} className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
});

export default HelpdeskForgotPasswordPage;
