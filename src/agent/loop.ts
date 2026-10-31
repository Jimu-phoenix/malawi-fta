import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions.js";
import { config } from "../config.js";
import { executeTool, toolDefinitions } from "../tools/index.js";

const MAX_ITERATIONS = 20;
const DEFAULT_USER_ID = "local";

const SYSTEM_PROMPT = `You are a calorie-tracking assistant for Malawian foods.

Rules:
- All calorie numbers must come from tools. Never estimate or supply calorie numbers from memory.
- Amounts must be in grams for now. If the user gives a household measure (plate, spoon, cup) and no portion data is available, ask for grams or an approximate weight instead of guessing.
- Use search_food to resolve food names and codes. When several foods match (for example homemade vs commercial bread), ask the user which one they mean.
- Run calculate_calories and show the result. Call log_meal only after the user confirms the calculated result.
- Use user_id "${DEFAULT_USER_ID}" for all tool calls unless the user explicitly names another user.
- If a food has no energy value in the table, say "no energy value in the table" and do not guess.
- Use a neutral tone. Do not praise or shame the user about food.
- This is general guidance, not medical advice.`;

export type AgentEvent =
  | { type: "tool_call"; name: string; arguments: string }
  | { type: "tool_result"; name: string; result: string }
  | { type: "assistant"; content: string };

export type AgentTurnResult = {
  reply: string;
  messages: ChatCompletionMessageParam[];
};

const groq = new Groq({ apiKey: config.groqApiKey });

export async function runAgentTurn(
  history: ChatCompletionMessageParam[],
  userMessage: string,
  onEvent?: (event: AgentEvent) => void,
): Promise<AgentTurnResult> {
  const hasSystemPrompt = history.some((message) => message.role === "system");
  const messages: ChatCompletionMessageParam[] = hasSystemPrompt
    ? [...history]
    : [{ role: "system", content: SYSTEM_PROMPT }, ...history];
  messages.push({ role: "user", content: userMessage });

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    const completion = await groq.chat.completions.create({
      model: config.groqModel,
      messages,
      tools: toolDefinitions,
      tool_choice: "auto",
      temperature: 0.2,
    });

    const response = completion.choices[0]?.message;
    if (response === undefined) {
      throw new Error("Groq returned no assistant message.");
    }

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const reply = response.content?.trim() ?? "";
      messages.push({ role: "assistant", content: reply });
      onEvent?.({ type: "assistant", content: reply });
      return { reply, messages };
    }

    messages.push({
      role: "assistant",
      content: response.content ?? null,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const name = toolCall.function.name;
      const argumentsText = toolCall.function.arguments;
      onEvent?.({ type: "tool_call", name, arguments: argumentsText });

      let result: string;
      try {
        result = await executeTool(name, argumentsText);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result = `Tool error (${name}): ${message}`;
      }

      onEvent?.({ type: "tool_result", name, result });
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  throw new Error(`Agent exceeded ${MAX_ITERATIONS} tool iterations.`);
}
