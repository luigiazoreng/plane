/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { Input } from "@plane/propel/input";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { HelpdeskFormRenderer } from "@/components/helpdesk/form-renderer";
import { publicHelpdeskStore as publicStore } from "@/store/public-helpdesk.store";
import { PublicHelpdeskService } from "@plane/services";

const publicHelpdeskService = new PublicHelpdeskService();

const HelpdeskPublicFormPage = observer(() => {
  const { publicSlug, formSlug } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [successEmail, setSuccessEmail] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);

  const pSlug = publicSlug?.toString() || "";
  const fSlug = formSlug?.toString() || "";

  useEffect(() => {
    if (!pSlug || !fSlug) return;

    const load = async () => {
      try {
        await publicStore.fetchPublicPortal(pSlug);
        await publicStore.fetchPortalForm(pSlug, fSlug);
      } catch (_error: any) {
        if (_error?.response?.status === 401) {
          navigate(`/helpdesk/p/${pSlug}/login?next=/helpdesk/p/${pSlug}/forms/${fSlug}`, { replace: true });
          return;
        }
        setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to load form." });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [fSlug, navigate, pSlug]);

  const attachmentTransport = useMemo(
    () => ({
      getCredentials: (data: { name: string; type: string; size: number }) =>
        publicHelpdeskService.getAssetUploadCredentials(
          pSlug,
          data,
          publicStore.customerToken || undefined
        ),
      markUploaded: (assetId: string) =>
        publicHelpdeskService.markAssetUploaded(
          pSlug,
          assetId,
          publicStore.customerToken || undefined
        ),
    }),
    [pSlug]
  );

  const form = publicStore.currentForm;
  const orderedFields = useMemo(
    () => (form?.fields_detail || []).slice().sort((a, b) => a.sequence - b.sequence),
    [form]
  );

  const handleValueChange = (key: string, value: unknown) => {
    setFieldValues((prev) => {
      const next = { ...prev, [key]: value };
      // When a cascade_select value changes, clear any descendant values so
      // children don't hold stale selections
      for (const field of orderedFields) {
        if (field.parent_field_key === key && field.key !== key) {
          next[field.key] = "";
          // Also clear grandchildren
          for (const child of orderedFields) {
            if (child.parent_field_key === field.key) {
              next[child.key] = "";
            }
          }
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    setSubmitting(true);
    try {
      // Aggregate all asset IDs from the field values
      const asset_ids: string[] = [];
      for (const field of orderedFields) {
        if (field.field_type === "attachment") {
          const val = fieldValues[field.key];
          if (Array.isArray(val)) {
            asset_ids.push(...val);
          } else if (typeof val === "string" && val.trim()) {
            asset_ids.push(val.trim());
          }
        }
      }

      const response = await publicStore.submitPublicForm(pSlug, form.slug, {
        ...fieldValues,
        asset_ids,
        contact_email: publicStore.customerToken ? undefined : contactEmail,
      });

      setSuccessEmail(contactEmail);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "Your request has been submitted successfully.",
      });

      if (publicStore.customerToken) {
        navigate(`/helpdesk/p/${pSlug}/${response.id}`);
      } else {
        setSubmittedRequestId(response.id);
        setIsSuccess(true);
      }
    } catch (_error: any) {
      const message =
        _error?.response?.data?.error ||
        _error?.response?.data?.title ||
        _error?.response?.data?.description ||
        "Failed to submit request.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-2xl text-text-100 font-bold">Form not found</h1>
        <p className="text-text-400 mt-2">The requested form is unavailable or you do not have access to it.</p>
      </div>
    );
  }

  if (isSuccess) {
    const nextParam = submittedRequestId ? `?next=/helpdesk/p/${pSlug}/${submittedRequestId}` : "";
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-3xl text-text-100 font-bold">Request submitted successfully</h1>
        <p className="text-text-400 mt-3">{form.success_message || "Your request has been submitted successfully."}</p>
        {successEmail ? <p className="text-sm text-text-300 mt-2">We will contact you at {successEmail}.</p> : null}

        {submittedRequestId && (
          <div className="mt-8 rounded-xl border border-subtle bg-surface-2 p-6">
            <p className="text-text-200 font-medium">Want to track your ticket?</p>
            <p className="text-sm text-text-400 mt-1">Create an account or sign in to follow up on this request.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button variant="primary" onClick={() => navigate(`/helpdesk/p/${pSlug}/register${nextParam}`)}>
                Create account
              </Button>
              <Button variant="secondary" onClick={() => navigate(`/helpdesk/p/${pSlug}/login${nextParam}`)}>
                Sign in
              </Button>
            </div>
          </div>
        )}

        <Button className="mt-6" variant="ghost" onClick={() => navigate(`/helpdesk/p/${pSlug}`)}>
          Return to Portal
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl text-text-100 font-bold">{form.name}</h1>
        <p className="text-text-400 mt-2">
          {form.description || "Please provide as much detail as possible so our team can help you quickly."}
        </p>
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
                value={contactEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContactEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full"
                required
              />
            </div>
          )}

          <HelpdeskFormRenderer
            fields={orderedFields}
            values={fieldValues}
            onValueChange={handleValueChange}
            attachmentTransport={attachmentTransport}
          />

          <div className="flex items-center justify-end gap-3 border-t border-subtle pt-6">
            <Button
              variant="secondary"
              type="button"
              onClick={() =>
                publicStore.portalForms.length > 1
                  ? navigate(`/helpdesk/p/${pSlug}/new`)
                  : navigate(`/helpdesk/p/${pSlug}`)
              }
            >
              Back
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

export default HelpdeskPublicFormPage;
