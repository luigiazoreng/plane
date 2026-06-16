/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PublicHelpdeskService } from "@plane/services";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

const publicHelpdeskService = new PublicHelpdeskService();

export default function HelpdeskPublicPortalPage() {
  const { publicSlug } = useParams();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !email) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Please fill all fields" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await publicHelpdeskService.createPublicRequest(publicSlug.toString(), {
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
      // Redirect to the newly created request page
      router.push(`/helpdesk/p/${publicSlug}/${response.id}`);
    } catch (_err) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to submit request. Please try again." });
      setSubmitting(false);
    }
  };

  return (
    <div className="shadow-sm overflow-hidden rounded-lg border border-subtle bg-surface-1">
      <div className="border-b border-subtle p-8">
        <h1 className="text-2xl mb-2 font-bold text-primary">Submit a Request</h1>
        <p className="text-tertiary">Our support team will get back to you as soon as possible.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 p-8">
        <div>
          <label htmlFor="email" className="text-sm mb-1 block font-medium text-secondary">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            className="text-sm focus:border-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-primary focus:outline-none"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label htmlFor="title" className="text-sm mb-1 block font-medium text-secondary">
            Subject
          </label>
          <input
            id="title"
            type="text"
            className="text-sm focus:border-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-primary focus:outline-none"
            placeholder="Brief summary of your issue"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="text-sm mb-1 block font-medium text-secondary">
            Description
          </label>
          <textarea
            id="description"
            rows={5}
            className="text-sm focus:border-primary w-full resize-y rounded-md border border-subtle bg-surface-2 px-3 py-2 text-primary focus:outline-none"
            placeholder="Please describe your issue in detail..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-sm hover:bg-primary-hover rounded-md px-4 py-2 font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
