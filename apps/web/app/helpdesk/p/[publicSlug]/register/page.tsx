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

const HelpdeskRegisterPage = observer(() => {
  const { publicSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pSlug = publicSlug?.toString() || "";
  const nextPath = searchParams.get("next");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return;

    setLoading(true);
    try {
      await publicStore.registerCustomer(pSlug, { name, email, password });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Welcome",
        message: "Account created successfully",
      });
      navigate(nextPath || `/helpdesk/p/${pSlug}`);
    } catch (_err) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Registration Failed",
        message: "Unable to create account. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shadow-sm mx-auto mt-12 max-w-md rounded-lg border border-subtle bg-surface-2 p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl text-primary font-bold">Create an Account</h1>
        <p className="text-sm text-placeholder mt-2">Sign up to submit and track your support tickets.</p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label htmlFor="name" className="text-sm text-secondary mb-1.5 block font-medium">
            Full Name
          </label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder="John Doe"
            className="w-full"
            required
          />
        </div>

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

        <div>
          <label htmlFor="password" className="text-sm text-secondary mb-1.5 block font-medium">
            Password
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

        <Button type="submit" variant="primary" className="mt-6 w-full justify-center" loading={loading}>
          Create Account
        </Button>
      </form>

      <p className="text-sm text-placeholder mt-6 text-center">
        Already have an account?{" "}
        <Link
          to={`/helpdesk/p/${pSlug}/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
});

export default HelpdeskRegisterPage;
