/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observable, action, makeObservable, runInAction } from "mobx";
import { PublicHelpdeskService } from "@plane/services";
import type { IHelpdeskForm, IHelpdeskPortal, IHelpdeskRequest } from "@plane/types";

import type { IHelpdeskCustomer } from "@plane/types";

export class PublicHelpdeskStore {
  customerToken: string | null = null;
  customerData: IHelpdeskCustomer | null = null;
  currentPortal: IHelpdeskPortal | null = null;
  portalForms: IHelpdeskForm[] = [];
  currentForm: IHelpdeskForm | null = null;
  myRequests: IHelpdeskRequest[] = [];

  private hasHydratedCustomerSession = false;
  private publicHelpdeskService: PublicHelpdeskService;

  constructor() {
    makeObservable(this, {
      customerToken: observable,
      customerData: observable,
      currentPortal: observable,
      portalForms: observable,
      currentForm: observable,
      myRequests: observable,

      setCustomerToken: action,
      setCustomerData: action,
      hydrateCustomerSession: action,
      logout: action,

      fetchPublicPortal: action,
      fetchPortalForms: action,
      fetchPortalForm: action,
      loginCustomer: action,
      registerCustomer: action,
      fetchMyRequests: action,
      createPublicRequest: action,
      submitPublicForm: action,
    });

    this.publicHelpdeskService = new PublicHelpdeskService();
  }

  hydrateCustomerSession() {
    if (this.hasHydratedCustomerSession || typeof window === "undefined") return;

    this.hasHydratedCustomerSession = true;
    const storedToken = localStorage.getItem("helpdesk_customer_token");
    if (!storedToken || storedToken === "null" || storedToken === "undefined") return;

    try {
      const [, payloadB64] = storedToken.split(".");
      const payload = JSON.parse(atob(payloadB64)) as { exp?: number };
      if (payload.exp && payload.exp * 1000 > Date.now()) {
        this.customerToken = storedToken;
        const storedData = localStorage.getItem("helpdesk_customer_data");
        if (storedData) {
          try {
            this.customerData = JSON.parse(storedData);
          } catch {
            // ignore malformed data
          }
        }
      } else {
        localStorage.removeItem("helpdesk_customer_token");
        localStorage.removeItem("helpdesk_customer_data");
      }
    } catch {
      localStorage.removeItem("helpdesk_customer_token");
      localStorage.removeItem("helpdesk_customer_data");
    }
  }

  setCustomerToken = (token: string | null) => {
    this.customerToken = token;
    this.hasHydratedCustomerSession = true;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("helpdesk_customer_token", token);
      } else {
        localStorage.removeItem("helpdesk_customer_token");
      }
    }
  };

  setCustomerData = (data: any) => {
    this.customerData = data;
    if (typeof window !== "undefined") {
      if (data) {
        localStorage.setItem("helpdesk_customer_data", JSON.stringify(data));
      } else {
        localStorage.removeItem("helpdesk_customer_data");
      }
    }
  };

  logout = () => {
    this.setCustomerToken(null);
    this.setCustomerData(null);
    this.portalForms = [];
    this.currentForm = null;
    this.myRequests = [];
  };

  async fetchPublicPortal(publicSlug: string) {
    const portal = await this.publicHelpdeskService.getPublicPortal(publicSlug);
    runInAction(() => {
      this.currentPortal = portal;
    });
    return portal;
  }

  async fetchPortalForms(publicSlug: string) {
    this.hydrateCustomerSession();
    const forms = await this.publicHelpdeskService.getPublicForms(publicSlug, this.customerToken || undefined);
    runInAction(() => {
      this.portalForms = forms;
    });
    return forms;
  }

  async fetchPortalForm(publicSlug: string, formSlug: string) {
    this.hydrateCustomerSession();
    const form = await this.publicHelpdeskService.getPublicForm(publicSlug, formSlug, this.customerToken || undefined);
    runInAction(() => {
      this.currentForm = form;
    });
    return form;
  }

  async loginCustomer(publicSlug: string, data: any) {
    const res = await this.publicHelpdeskService.loginCustomer(publicSlug, data);
    runInAction(() => {
      this.setCustomerToken(res.token);
      this.setCustomerData(res.customer);
    });
    return res;
  }

  async registerCustomer(publicSlug: string, data: any) {
    const res = await this.publicHelpdeskService.registerCustomer(publicSlug, data);
    runInAction(() => {
      this.setCustomerToken(res.token);
      this.setCustomerData(res.customer);
    });
    return res;
  }

  async fetchMyRequests(publicSlug: string) {
    this.hydrateCustomerSession();
    if (!this.customerToken) return [];

    const requests = await this.publicHelpdeskService.getPublicRequests(publicSlug, this.customerToken);
    runInAction(() => {
      this.myRequests = requests;
    });
    return requests;
  }

  async createPublicRequest(publicSlug: string, data: Partial<IHelpdeskRequest>) {
    this.hydrateCustomerSession();
    const request = await this.publicHelpdeskService.createPublicRequest(
      publicSlug,
      data,
      this.customerToken || undefined
    );
    runInAction(() => {
      if (this.customerToken) {
        this.myRequests = [request, ...this.myRequests];
      }
    });
    return request;
  }

  async submitPublicForm(publicSlug: string, formSlug: string, data: Record<string, unknown>) {
    this.hydrateCustomerSession();
    const request = await this.publicHelpdeskService.submitPublicForm(
      publicSlug,
      formSlug,
      data,
      this.customerToken || undefined
    );
    runInAction(() => {
      if (this.customerToken) {
        this.myRequests = [request, ...this.myRequests];
      }
    });
    return request;
  }
}

export const publicHelpdeskStore = new PublicHelpdeskStore();
