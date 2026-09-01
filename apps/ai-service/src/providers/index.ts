export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface ILLMProvider {
  name: string;
  complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse>;
}

export class MockProvider implements ILLMProvider {
  name = "mock";

  async complete(messages: LLMMessage[], _options?: LLMRequestOptions): Promise<LLMResponse> {
    const lastUserMessage =
      messages
        .slice()
        .toReversed()
        .find((m: LLMMessage) => m.role === "user")?.content || "";
    return {
      content: `[Mock AI Response] Evaluated prompt: "${lastUserMessage}". Context grounded successfully.`,
      provider: "mock",
      model: "mock-model-v1",
      usage: { promptTokens: 10, completionTokens: 15 },
    };
  }
}

export class OpenAIProvider implements ILLMProvider {
  name = "openai";
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
    this.baseUrl = baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  }

  async complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key missing. Configure OPENAI_API_KEY environment variable.");
    }

    const model = options?.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Provider error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return {
      content: data.choices[0]?.message?.content || "",
      provider: "openai",
      model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
    };
  }
}

export class DeepSeekProvider implements ILLMProvider {
  name = "deepseek";
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.DEEPSEEK_API_KEY || "";
    this.baseUrl = baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
  }

  async complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error("DeepSeek API key missing. Configure DEEPSEEK_API_KEY environment variable.");
    }

    const model = options?.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek Provider error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return {
      content: data.choices[0]?.message?.content || "",
      provider: "deepseek",
      model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
    };
  }
}

export class AnthropicProvider implements ILLMProvider {
  name = "anthropic";
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.baseUrl = baseUrl || process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1";
  }

  async complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error("Anthropic API key missing. Configure ANTHROPIC_API_KEY environment variable.");
    }

    const model = options?.model || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    const systemMessage = messages.find((m) => m.role === "system")?.content;
    const nonSystemMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.3,
        system: systemMessage,
        messages: nonSystemMessages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic Provider error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return {
      content: data.content?.[0]?.text || "",
      provider: "anthropic",
      model,
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
      },
    };
  }
}

export class GeminiProvider implements ILLMProvider {
  name = "gemini";
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  }

  async complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error("Gemini API key missing. Configure GEMINI_API_KEY environment variable.");
    }

    const model = options?.model || process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const systemMessage = messages.find((m) => m.role === "system")?.content;
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    const payload: any = { contents };

    if (systemMessage) {
      payload.systemInstruction = {
        parts: [{ text: systemMessage }],
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini Provider error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      content: responseText,
      provider: "gemini",
      model,
    };
  }
}

export const ProviderFactory = {
  getProvider(providerName?: string): ILLMProvider {
    const name = (providerName || process.env.AI_PROVIDER || "mock").toLowerCase();
    switch (name) {
      case "openai":
        return new OpenAIProvider();
      case "deepseek":
        return new DeepSeekProvider();
      case "anthropic":
      case "claude":
        return new AnthropicProvider();
      case "gemini":
      case "google":
        return new GeminiProvider();
      case "mock":
      default:
        return new MockProvider();
    }
  },
};
