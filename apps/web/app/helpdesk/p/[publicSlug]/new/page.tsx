/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { observer } from "mobx-react";
import { publicHelpdeskStore as publicStore } from "@/store/public-helpdesk.store";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/propel/input";
import { Button } from "@plane/propel/button";

const HelpdeskPublicNewRequestPage = observer(() => {
  const { publicSlug } = useParams();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // If user is not logged in, email is required
    if (!title || !description || (!publicStore.customerToken && !email)) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Please fill all required fields" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await publicStore.createPublicRequest(publicSlug.toString(), {
        title,
        description,
        contact_email: email,
        source: "public_form",
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "Your request has been submitted successfully.",
      });
      setTitle("");
      setDescription("");
      setEmail("");
      // Redirect to the newly created request page if logged in, otherwise show success
      if (publicStore.customerToken) {
        router.push(`/helpdesk/p/${publicSlug}/${response.id}`);
      } else {
        setIsSuccess(true);
      }
    } catch (_err) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to submit request." });
    } finally {
      setSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <div className="bg-green-500/10 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full">
          <svg className="text-green-500 h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl text-text-100 mb-4 font-bold">Request Submitted Successfully!</h1>
        <p className="text-text-400 mb-8">
          We've received your request and will get back to you at{" "}
          <span className="text-text-100 font-semibold">{email}</span> as soon as possible.
        </p>
        <Button variant="primary" onClick={() => router.push(`/helpdesk/p/${publicSlug}`)}>
          Return to Portal
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl text-text-100 font-bold">Submit a request</h1>
        <p className="text-text-400 mt-2">Please provide as much detail as possible so we can help you better.</p>
      </div>

      <div className="shadow-sm rounded-xl border border-subtle bg-surface-2 p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {!publicStore.customerToken && (
            <div>
              <label htmlFor="contact_email" className="text-sm text-text-200 mb-1.5 block font-medium">
                Contact Email <span className="text-red-500">*</span>
              </label>
              <Input
                id="contact_email"
                type="email"
                value={email}
                onChange={(e: any) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full"
                required
              />
              <p className="text-xs text-text-400 mt-1">We will use this email to update you on your request.</p>
            </div>
          )}

          <div>
            <label htmlFor="title" className="text-sm text-text-200 mb-1.5 block font-medium">
              Subject <span className="text-red-500">*</span>
            </label>
            <Input
              id="title"
              type="text"
              value={title}
              onChange={(e: any) => setTitle(e.target.value)}
              placeholder="Brief summary of the issue"
              className="w-full"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="text-sm text-text-200 mb-1.5 block font-medium">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              className="text-sm text-text-100 placeholder:text-text-400 focus:border-primary focus:ring-primary min-h-[150px] w-full rounded-md border border-subtle bg-surface-1 p-3 focus:ring-1 focus:outline-none"
              value={description}
              onChange={(e: any) => setDescription(e.target.value)}
              placeholder="Please enter the details of your request. A member of our support staff will respond as soon as possible."
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-subtle pt-6">
            <Button variant="secondary" onClick={() => router.push(`/helpdesk/p/${publicSlug}`)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              Submit Request
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default HelpdeskPublicNewRequestPage;
