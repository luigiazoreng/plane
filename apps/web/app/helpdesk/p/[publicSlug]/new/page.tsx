/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { Badge } from "@plane/propel/badge";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Lock, Plus } from "lucide-react";
import { publicHelpdeskStore as publicStore } from "@/store/public-helpdesk.store";

const HelpdeskPublicNewRequestPage = observer(() => {
  const { publicSlug } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const pSlug = publicSlug?.toString() || "";

  useEffect(() => {
    if (!pSlug) return;

    const load = async () => {
      try {
        const forms = await publicStore.fetchPortalForms(pSlug);
        if (forms.length === 1) {
          navigate(`/helpdesk/p/${pSlug}/forms/${forms[0].slug}`, { replace: true });
        }
      } catch (_error) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to load forms." });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate, pSlug]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  if (publicStore.portalForms.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-2xl text-text-100 font-bold">No forms available</h1>
        <p className="text-text-400 mt-2">This portal does not have any active request forms right now.</p>
        <Button className="mt-6" variant="secondary" onClick={() => navigate(`/helpdesk/p/${pSlug}`)}>
          Return to Portal
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl text-text-100 font-bold">Choose a request form</h1>
        <p className="text-text-400 mt-2">Select the form that best matches the kind of support you need.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {publicStore.portalForms.map((form) => (
          <button
            key={form.id}
            type="button"
            onClick={() => navigate(`/helpdesk/p/${pSlug}/forms/${form.slug}`)}
            className="hover:border-primary/30 rounded-xl border border-subtle bg-surface-2 p-6 text-left transition-colors hover:bg-surface-1"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg text-primary">
                <Plus className="size-5" />
              </div>
              <Badge variant={form.visibility === "private" ? "warning" : "success"} size="sm">
                {form.visibility === "private" ? "Private" : "Public"}
              </Badge>
            </div>
            <h2 className="text-lg text-text-100 mt-4 font-semibold">{form.name}</h2>
            <p className="text-sm text-text-400 mt-2 line-clamp-3">
              {form.description || "Open this form to submit a request to the support team."}
            </p>
            <div className="text-xs text-text-400 mt-4 flex items-center gap-2">
              {form.visibility === "private" ? <Lock className="size-3.5" /> : null}
              <span>
                {form.visibility === "private"
                  ? "Requires portal login"
                  : "Available without login unless the portal requires it"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
});

export default HelpdeskPublicNewRequestPage;
