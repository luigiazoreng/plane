/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { observer } from "mobx-react";
import { ArrowLeft, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IHelpdeskCustomer } from "@plane/types";
import { AppHeader } from "@/components/core/app-header";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";

const HelpdeskCustomersPage = observer(() => {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const helpdeskStore = useHelpdesk();

  const wSlug = workspaceSlug?.toString() || "";

  const [deletingCustomer, setDeletingCustomer] = useState<IHelpdeskCustomer | null>(null);
  const [togglingCustomerId, setTogglingCustomerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!wSlug) return;
    setIsLoading(true);
    helpdeskStore
      .fetchCustomers(wSlug)
      .catch(() => setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to load customers." }))
      .finally(() => setIsLoading(false));
  }, [wSlug, helpdeskStore]);

  const customers = helpdeskStore.getWorkspaceCustomers(wSlug);

  const handleToggleActive = async (customer: IHelpdeskCustomer) => {
    setTogglingCustomerId(customer.id);
    try {
      await helpdeskStore.updateCustomer(wSlug, customer.id, { is_active: !customer.is_active });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Updated",
        message: `${customer.name} has been ${customer.is_active ? "deactivated" : "activated"}.`,
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update customer." });
    } finally {
      setTogglingCustomerId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    try {
      await helpdeskStore.deleteCustomer(wSlug, deletingCustomer.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Deleted", message: `${deletingCustomer.name} has been removed.` });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to delete customer." });
    } finally {
      setDeletingCustomer(null);
    }
  };

  return (
    <>
      <AppHeader
        header={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/${wSlug}/helpdesk`)}
              className="rounded-md p-1 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
            >
              <ArrowLeft className="size-4" />
            </button>
            <h1 className="text-base font-semibold text-primary">Helpdesk Users</h1>
          </div>
        }
      />

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-primary">Customer Accounts</h2>
            <p className="mt-1 text-13 text-tertiary">
              Users who have registered through the public portal to submit and track tickets.
            </p>
          </div>
          <span className="text-13 text-tertiary">
            {customers.length} {customers.length === 1 ? "user" : "users"}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border border-subtle bg-layer-1" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-subtle bg-layer-1 py-20 text-center">
            <Users className="mb-4 size-10 text-tertiary" />
            <h3 className="text-base font-medium text-primary">No customers yet</h3>
            <p className="mt-1 text-13 text-tertiary">
              Customers will appear here after they register through the public portal.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-subtle bg-layer-1">
            <table className="w-full text-left text-13">
              <thead className="text-xs border-b border-subtle bg-layer-2 text-tertiary uppercase">
                <tr>
                  <th className="tracking-wider px-5 py-3.5 font-medium">Name</th>
                  <th className="tracking-wider px-5 py-3.5 font-medium">Email</th>
                  <th className="tracking-wider px-5 py-3.5 font-medium">Status</th>
                  <th className="tracking-wider px-5 py-3.5 font-medium">Registered</th>
                  <th className="tracking-wider px-5 py-3.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {customers.map((customer) => (
                  <tr key={customer.id} className="group transition-colors hover:bg-layer-2">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-accent-subtle text-xs flex size-8 shrink-0 items-center justify-center rounded-full font-semibold text-accent-primary">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-primary">{customer.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-secondary">{customer.email}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-xs inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ${
                          customer.is_active
                            ? "bg-success-subtle text-success-primary"
                            : "bg-layer-2 text-tertiary"
                        }`}
                      >
                        {customer.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-tertiary">
                      {new Date(customer.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(customer)}
                          disabled={togglingCustomerId === customer.id}
                          title={customer.is_active ? "Deactivate" : "Activate"}
                          className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {customer.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCustomer(customer)}
                          title="Delete"
                          className="hover:bg-danger-subtle hover:text-danger-primary rounded-md p-1.5 text-tertiary transition-colors"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deletingCustomer && (
        <ConfirmModal
          title="Delete customer account"
          body={`Are you sure you want to permanently delete ${deletingCustomer.name} (${deletingCustomer.email})? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeletingCustomer(null)}
        />
      )}
    </>
  );
});

export default HelpdeskCustomersPage;

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="shadow-xl w-full max-w-sm rounded-xl border border-subtle bg-layer-1 p-6">
        <h3 className="text-base font-semibold text-primary">{title}</h3>
        <p className="mt-2 text-13 text-tertiary">{body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" size="base" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="error-fill" size="base" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
