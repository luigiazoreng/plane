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
// Note: We'll inject PublicHelpdeskStore using a local instance or React Context
// For now, let's assume we instantiate it locally or pass it via context.
import { publicHelpdeskStore as publicStore } from "@/store/public-helpdesk.store";

const HelpdeskLoginPage = observer(() => {
  const { publicSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pSlug = publicSlug?.toString() || "";
  const nextPath = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      await publicStore.loginCustomer(pSlug, { email, password });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "Logged in successfully",
      });
      navigate(nextPath || `/helpdesk/p/${pSlug}`);
    } catch (_err) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Login Failed",
        message: "Invalid email or password",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shadow-sm mx-auto mt-12 max-w-md rounded-lg border border-subtle bg-surface-2 p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl text-text-100 font-bold">Sign in to Support</h1>
        <p className="text-sm text-text-400 mt-2">Enter your email and password to access your tickets.</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="text-sm text-text-200 mb-1.5 block font-medium">
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

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="text-sm text-text-200 font-medium">
              Password
            </label>
            <Link
              to={`/helpdesk/p/${pSlug}/forgot-password${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full"
            required
          />
        </div>

        <Button type="submit" variant="primary" className="mt-6 w-full justify-center" loading={loading}>
          Sign In
        </Button>
      </form>

      <p className="text-sm text-text-400 mt-6 text-center">
        Don't have an account?{" "}
        <Link
          to={`/helpdesk/p/${pSlug}/register${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`}
          className="font-medium text-primary hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
});

export default HelpdeskLoginPage;
