/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useForm } from "react-hook-form";
import { Lightbulb } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IFormattedInstanceConfiguration, TInstanceAIConfigurationKeys } from "@plane/types";
// components
import type { TControllerInputFormField } from "@/components/common/controller-input";
import { ControllerInput } from "@/components/common/controller-input";
// hooks
import { useInstance } from "@/hooks/store";

const AI_PROVIDERS = [
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Gemini", value: "gemini" },
  { label: "DeepSeek", value: "deepseek" },
] as const;
type TAIProvider = (typeof AI_PROVIDERS)[number]["value"];

const PROVIDER_HELP_TEXT: Record<TAIProvider, string> = {
  anthropic: "Use a Claude model slug such as claude-3-5-sonnet-20240620.",
  deepseek: "Use a DeepSeek model such as deepseek-v4-flash or deepseek-v4-pro.",
  gemini: "Use a Gemini model slug such as gemini-1.5-pro-latest.",
  openai: "Use an OpenAI model such as gpt-4o-mini.",
};

const PROVIDER_MODEL_PLACEHOLDER: Record<TAIProvider, string> = {
  anthropic: "claude-3-5-sonnet-20240620",
  deepseek: "deepseek-v4-flash",
  gemini: "gemini-1.5-pro-latest",
  openai: "gpt-4o-mini",
};

const PROVIDER_BASE_URL_PLACEHOLDER: Record<TAIProvider, string> = {
  anthropic: "Optional. Leave blank to use Anthropic's default endpoint",
  deepseek: "https://api.deepseek.com",
  gemini: "Optional. Leave blank to use the default gateway",
  openai: "Optional. Leave blank to use OpenAI's default endpoint",
};

type IInstanceAIForm = {
  config: IFormattedInstanceConfiguration;
};

type AIFormValues = Record<TInstanceAIConfigurationKeys, string>;

export function InstanceAIForm(props: IInstanceAIForm) {
  const { config } = props;
  // store
  const { updateInstanceConfigurations } = useInstance();
  // form data
  const {
    handleSubmit,
    control,
    register,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AIFormValues>({
    defaultValues: {
      LLM_API_KEY: config["LLM_API_KEY"],
      LLM_BASE_URL: config["LLM_BASE_URL"] ?? "",
      LLM_MODEL: config["LLM_MODEL"],
      LLM_PROVIDER: config["LLM_PROVIDER"] ?? "openai",
    },
  });
  const selectedProvider = (watch("LLM_PROVIDER") || "openai") as TAIProvider;

  const aiFormFields: TControllerInputFormField[] = [
    {
      key: "LLM_MODEL",
      type: "text",
      label: "LLM Model",
      description: PROVIDER_HELP_TEXT[selectedProvider],
      placeholder: PROVIDER_MODEL_PLACEHOLDER[selectedProvider],
      error: Boolean(errors.LLM_MODEL),
      required: false,
    },
    {
      key: "LLM_API_KEY",
      type: "password",
      label: "API key",
      description: "Paste the API key for the provider selected above.",
      placeholder: "sk-...",
      error: Boolean(errors.LLM_API_KEY),
      required: false,
    },
    {
      key: "LLM_BASE_URL",
      type: "text",
      label: "Base URL",
      description:
        selectedProvider === "deepseek"
          ? "DeepSeek is OpenAI-compatible and usually works with https://api.deepseek.com."
          : "Optional override for OpenAI-compatible or proxy endpoints.",
      placeholder: PROVIDER_BASE_URL_PLACEHOLDER[selectedProvider],
      error: Boolean(errors.LLM_BASE_URL),
      required: false,
    },
  ];

  const onSubmit = async (formData: AIFormValues) => {
    const payload: Partial<AIFormValues> = { ...formData };

    await updateInstanceConfigurations(payload)
      .then(() =>
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success",
          message: "AI Settings updated successfully",
        })
      )
      .catch((err) => console.error(err));
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div>
          <div className="pb-1 text-18 font-medium text-primary">LLM provider</div>
          <div className="text-13 font-regular text-tertiary">
            Configure OpenAI, Anthropic, Gemini, or DeepSeek for Plane AI features.
          </div>
        </div>
        <div className="max-w-md space-y-1">
          <h4 className="text-13 text-tertiary">Provider</h4>
          <select
            {...register("LLM_PROVIDER")}
            className="border-custom-border-200 bg-custom-background-100 text-sm text-custom-text-100 w-full rounded-md border px-3 py-2 font-medium"
          >
            {AI_PROVIDERS.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
          <p className="pt-0.5 text-11 text-tertiary">
            Select the provider Plane should use when calling the AI backend.
          </p>
        </div>
        <div className="grid-col grid w-full grid-cols-1 items-start justify-between gap-x-12 gap-y-8 lg:grid-cols-3">
          {aiFormFields.map((field) => (
            <ControllerInput
              key={field.key}
              control={control}
              type={field.type}
              name={field.key}
              label={field.label}
              description={field.description}
              placeholder={field.placeholder}
              error={field.error}
              required={field.required}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-start gap-4">
        <Button variant="primary" size="lg" onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
          {isSubmitting ? "Saving" : "Save changes"}
        </Button>

        <div className="relative inline-flex items-center gap-1.5 rounded-sm border border-accent-subtle bg-accent-subtle px-4 py-2 text-caption-sm-regular text-accent-secondary">
          <Lightbulb className="size-4" />
          <div>DeepSeek support requires using a compatible base URL. Leave Base URL blank for default providers.</div>
        </div>
      </div>
    </div>
  );
}
