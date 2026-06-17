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
import type { IHelpdeskFormField } from "@plane/types";
import { publicHelpdeskStore as publicStore } from "@/store/public-helpdesk.store";

const renderFieldInput = (field: IHelpdeskFormField, value: unknown, onChange: (value: unknown) => void) => {
  switch (field.field_type) {
    case "system_title":
    case "short_text":
      return (
        <Input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full"
        />
      );
    case "system_description":
    case "long_text":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="text-sm text-text-100 placeholder:text-text-400 focus:border-primary min-h-[140px] w-full rounded-md border border-subtle bg-surface-1 p-3 outline-none"
        />
      );
    case "select":
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm text-text-100 focus:border-primary w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 outline-none"
        >
          <option value="">Select an option</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "checkbox":
      return (
        <label className="text-sm text-text-200 flex items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-subtle"
          />
          <span>{field.help_text || field.label}</span>
        </label>
      );
    case "date":
      return (
        <Input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          className="w-full"
        />
      );
    default:
      return null;
  }
};

const HelpdeskPublicFormPage = observer(() => {
  const { publicSlug, formSlug } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [successEmail, setSuccessEmail] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

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
          navigate(`/helpdesk/p/${pSlug}/login`, { replace: true });
          return;
        }
        setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to load form." });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [fSlug, navigate, pSlug]);

  const form = publicStore.currentForm;
  const orderedFields = useMemo(
    () => (form?.fields_detail || []).slice().sort((a, b) => a.sequence - b.sequence),
    [form]
  );

  const handleValueChange = (key: string, value: unknown) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    setSubmitting(true);
    try {
      const response = await publicStore.submitPublicForm(pSlug, form.slug, {
        ...fieldValues,
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
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-3xl text-text-100 font-bold">Request submitted successfully</h1>
        <p className="text-text-400 mt-3">{form.success_message || "Your request has been submitted successfully."}</p>
        {successEmail ? <p className="text-sm text-text-300 mt-2">We will contact you at {successEmail}.</p> : null}
        <Button className="mt-6" variant="primary" onClick={() => navigate(`/helpdesk/p/${pSlug}`)}>
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

          {orderedFields.map((field) => (
            <div key={field.id}>
              <label className="text-sm text-text-200 mb-1.5 block font-medium">
                {field.label} {field.required ? <span className="text-red-500">*</span> : null}
              </label>
              {renderFieldInput(field, fieldValues[field.key], (value) => handleValueChange(field.key, value))}
              {field.field_type !== "checkbox" && field.help_text ? (
                <p className="text-xs text-text-400 mt-1">{field.help_text}</p>
              ) : null}
            </div>
          ))}

          <div className="flex items-center justify-end gap-3 border-t border-subtle pt-6">
            <Button variant="secondary" type="button" onClick={() => navigate(`/helpdesk/p/${pSlug}/new`)}>
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
