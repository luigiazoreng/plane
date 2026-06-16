/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observable, action, makeObservable, runInAction } from "mobx";
import { PublicHelpdeskService } from "@plane/services";
import type { IHelpdeskPortal, IHelpdeskRequest } from "@plane/types";

import type { IHelpdeskCustomer } from "@plane/types";

export class PublicHelpdeskStore {
  customerToken: string | null = null;
  customerData: IHelpdeskCustomer | null = null;
  currentPortal: IHelpdeskPortal | null = null;
  myRequests: IHelpdeskRequest[] = [];

  private publicHelpdeskService: PublicHelpdeskService;

  constructor() {
    makeObservable(this, {
      customerToken: observable,
      customerData: observable,
      currentPortal: observable,
      myRequests: observable,

      setCustomerToken: action,
      setCustomerData: action,
      logout: action,

      fetchPublicPortal: action,
      loginCustomer: action,
      registerCustomer: action,
      fetchMyRequests: action,
      createPublicRequest: action,
    });

    this.publicHelpdeskService = new PublicHelpdeskService();

    // Load token from local storage if exists
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("helpdesk_customer_token");
      if (storedToken && storedToken !== "null" && storedToken !== "undefined") {
        try {
          const [, payloadB64] = storedToken.split(".");
          const payload = JSON.parse(atob(payloadB64)) as { exp?: number };
          if (payload.exp && payload.exp * 1000 > Date.now()) {
            this.customerToken = storedToken;
          } else {
            localStorage.removeItem("helpdesk_customer_token");
          }
        } catch {
          localStorage.removeItem("helpdesk_customer_token");
        }
      }
    }
  }

  setCustomerToken(token: string | null) {
    this.customerToken = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("helpdesk_customer_token", token);
      } else {
        localStorage.removeItem("helpdesk_customer_token");
      }
    }
  }

  setCustomerData(data: any) {
    this.customerData = data;
  }

  logout() {
    this.setCustomerToken(null);
    this.setCustomerData(null);
    this.myRequests = [];
  }

  async fetchPublicPortal(publicSlug: string) {
    const portal = await this.publicHelpdeskService.getPublicPortal(publicSlug);
    runInAction(() => {
      this.currentPortal = portal;
    });
    return portal;
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
    if (!this.customerToken) return [];

    const requests = await this.publicHelpdeskService.getPublicRequests(publicSlug, this.customerToken);
    runInAction(() => {
      this.myRequests = requests;
    });
    return requests;
  }

  async createPublicRequest(publicSlug: string, data: Partial<IHelpdeskRequest>) {
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
}

export const publicHelpdeskStore = new PublicHelpdeskStore();
