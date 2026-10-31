import { useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions.js";
import type { JSX } from "react";
import { runAgentTurn } from "./agent/loop.js";
import { config } from "./config.js";

type UiMessageKind =
  | "user"
  | "assistant"
  | "tool_call"
  | "tool_result"
  | "error";

type UiMessage = {
  id: number;
  kind: UiMessageKind;
  text: string;
};

type MealItem = {
  food_code: string;
  name_en: string | null;
  grams: number;
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  available: boolean;
  reason?: string;
};

type MealResult = {
  items: MealItem[];
  total_kcal: number;
  total_protein_g: number | null;
  total_fat_g: number | null;
  total_carbohydrate_g: number | null;
  unavailable: Array<{ food_code: string; name_en: string | null; reason: string }>;
};

type DailyResult = {
  user_id: string;
  date: string;
  total_kcal: number;
  meal_count: number;
  daily_goal: number | null;
  total_protein_g: number | null;
  total_fat_g: number | null;
  total_carbohydrate_g: number | null;
};

const VIEWPORT_HEIGHT = 14;
const MAX_RESULT_CHARS = 900;
const PROGRESS_BAR_WIDTH = 20;
const BLOCK_FULL = "█";
const BLOCK_EMPTY = "░";

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function truncate(text: string, width: number): string {
  if (text.length <= width) return text;
  return text.slice(0, width - 1) + "…";
}

function formatNutrient(value: number | null): string {
  return value === null ? "n/a" : String(round(value));
}

function formatKcal(value: number | null): string {
  return value === null ? "n/a" : String(Math.round(value));
}

function progressBar(consumed: number, goal: number | null): string {
  if (goal === null || goal <= 0) {
    return `${consumed} kcal (no goal set)`;
  }
  const pct = Math.min(100, Math.round((consumed / goal) * 100));
  const filled = Math.round((pct / 100) * PROGRESS_BAR_WIDTH);
  const bar = BLOCK_FULL.repeat(filled) + BLOCK_EMPTY.repeat(PROGRESS_BAR_WIDTH - filled);
  return `[${bar}] ${consumed} / ${goal} kcal, ${pct}%`;
}

function mealList(result: MealResult): JSX.Element {
  const items = result.items.map((item) => {
    const name = item.name_en ? truncate(item.name_en, 30) : item.food_code;
    const kcal = formatKcal(item.kcal);
    const protein = formatNutrient(item.protein_g);
    const fat = formatNutrient(item.fat_g);
    const carbs = formatNutrient(item.carbohydrate_g);
    const line =
      `• ${name} — ${item.grams} g · ${kcal} kcal · protein ${protein} g · fat ${fat} g · carbs ${carbs} g`;
    if (!item.available) {
      return (
        <Text dimColor key={item.food_code}>
          {line}  ({item.reason ?? "unavailable"})
        </Text>
      );
    }
    return <Text key={item.food_code}>{line}</Text>;
  });

  const totalLine =
    `----  Totals: ${formatKcal(result.total_kcal)} kcal · protein ${formatNutrient(result.total_protein_g)} g · fat ${formatNutrient(result.total_fat_g)} g · carbs ${formatNutrient(result.total_carbohydrate_g)} g`;

  return (
    <Box key="meal-list">
      {items}
      <Text dimColor>{"-".repeat(40)}</Text>
      <Text bold>{totalLine}</Text>
    </Box>
  );
}

function dailyProgress(result: DailyResult): JSX.Element {
  const total = Math.round(result.total_kcal);
  const bar = progressBar(total, result.daily_goal);
  const nutrientParts: string[] = [];
  if (result.total_protein_g !== null) nutrientParts.push(`Protein ${formatNutrient(result.total_protein_g)}g`);
  if (result.total_fat_g !== null) nutrientParts.push(`Fat ${formatNutrient(result.total_fat_g)}g`);
  if (result.total_carbohydrate_g !== null) nutrientParts.push(`Carbs ${formatNutrient(result.total_carbohydrate_g)}g`);
  const nutrientLine = nutrientParts.length > 0 ? `  ${nutrientParts.join(", ")}` : "";
  const missingNote =
    result.total_protein_g === null || result.total_fat_g === null || result.total_carbohydrate_g === null
      ? "  (some nutrients unavailable for logged items)"
      : "";
  return (
    <Text key="daily-progress">
      {bar}{nutrientLine}{missingNote}
    </Text>
  );
}

function inlineMarkdown(text: string): JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <Text>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return <Text bold key={String(index)}>{part.slice(2, -2)}</Text>;
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return <Text color="green" key={String(index)}>{part.slice(1, -1)}</Text>;
        }
        return <Text key={String(index)}>{part}</Text>;
      })}
    </Text>
  );
}

function renderMarkdown(text: string): JSX.Element[] {
  const lines = text.split("\n");
  return lines.map((line, lineIndex) => {
    const trimmed = line.trim();
    if (/^#{1,6}\s/.test(trimmed)) {
      const content = trimmed.replace(/^#{1,6}\s*/, "");
      return <Text bold key={String(lineIndex)}>{content}</Text>;
    }
    if (/^[-*]\s/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s*/, "");
      return (
        <Text key={String(lineIndex)}>
          <Text>  - </Text>
          {inlineMarkdown(content)}
        </Text>
      );
    }
    return (
      <Text key={String(lineIndex)}>
        {inlineMarkdown(line)}
      </Text>
    );
  });
}

function MessageRow({ message }: { message: UiMessage }): JSX.Element {
  const userLabel = message.kind === "user" ? <Text bold>You:</Text> : null;
  const agentLabel = message.kind === "assistant" ? <Text bold>Agent:</Text> : null;
  const errorLabel = message.kind === "error" ? <Text bold color="red">Error:</Text> : null;
  const toolCallLabel = message.kind === "tool_call" ? <Text dimColor>  ⏵ </Text> : null;
  const toolResultLabel = message.kind === "tool_result" ? <Text dimColor>  ↳ </Text> : null;

  let body: JSX.Element | JSX.Element[] = message.kind === "assistant" ? renderMarkdown(message.text) : <Text>{message.text}</Text>;

  return (
    <Box key={message.id} marginBottom={1}>
      {userLabel !== null && <>{userLabel}<Text> </Text></>}
      {agentLabel !== null && <>{agentLabel}<Text> </Text></>}
      {errorLabel !== null && <>{errorLabel}<Text> </Text></>}
      {toolCallLabel}
      {toolResultLabel}
      {body}
    </Box>
  );
}

function App(): JSX.Element {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [mealResults, setMealResults] = useState<MealResult[]>([]);
  const [dailyResults, setDailyResults] = useState<DailyResult[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [scrollBack, setScrollBack] = useState(0);
  const historyRef = useRef<ChatCompletionMessageParam[]>([]);
  const nextIdRef = useRef(1);

  function addMessage(kind: UiMessageKind, text: string) {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setMessages((current) => [...current, { id, kind, text }]);
    setScrollBack(0);
  }

  const maxScroll = Math.max(0, messages.length - VIEWPORT_HEIGHT);
  const start = Math.max(0, maxScroll - scrollBack);
  const visibleMessages = messages.slice(start, start + VIEWPORT_HEIGHT);

  useInput((keyInput, key) => {
    if (key.ctrl && keyInput === "c") {
      exit();
      return;
    }
    if (key.upArrow) {
      setScrollBack((current) => Math.min(maxScroll, current + 1));
    }
    if (key.downArrow) {
      setScrollBack((current) => Math.max(0, current - 1));
    }
  });

  async function handleSubmit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || isThinking) return;

    setInput("");
    addMessage("user", trimmed);
    setIsThinking(true);

    let streamingMessageId: number | null = null;
    let streamingText = "";

    try {
      const result = await runAgentTurn(
        historyRef.current,
        trimmed,
        (event) => {
          if (event.type === "tool_call") {
            addMessage(
              "tool_call",
              `${event.name}(${truncateArgs(event.arguments)})`,
            );
          }
          if (event.type === "tool_result") {
            addMessage("tool_result", `${event.name}: ${truncateResult(event.result)}`);
            try {
              const parsed = JSON.parse(event.result);
              if (
                (event.name === "calculate_calories" ||
                  event.name === "calculate_nutrition" ||
                  event.name === "log_meal") &&
                parsed.items
              ) {
                setMealResults((current) => [...current, parsed as MealResult]);
              }
              if (event.name === "get_daily_total" && parsed.date) {
                setDailyResults((current) => [...current, parsed as DailyResult]);
              }
            } catch {
              // Not JSON or not a shape we render; ignore.
            }
          }
        },
        (chunk) => {
          if (streamingMessageId === null) {
            const id = nextIdRef.current;
            nextIdRef.current += 1;
            streamingMessageId = id;
            streamingText = "";
            setMessages((current) => [...current, { id, kind: "assistant", text: "" }]);
          }
          streamingText += chunk;
          setMessages((current) =>
            current.map((message) =>
              message.id === streamingMessageId
                ? { ...message, text: streamingText }
                : message,
            ),
          );
        },
      );
      historyRef.current = result.messages;
      if (streamingMessageId === null) {
        addMessage("assistant", result.reply || "(no response)");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addMessage("error", message);
    } finally {
      setIsThinking(false);
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Malawi Food Tracker</Text>
      <Text> </Text>
      <Text dimColor>· {config.groqModel}</Text>
      <Text> </Text>
      <Text dimColor>Ctrl+C to quit</Text>

      <Box flexDirection="column" marginTop={1}>
        {messages.length === 0 ? (
          <Text dimColor>Ask about a food or log a meal.</Text>
        ) : (
          visibleMessages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))
        )}
        {mealResults.map((result) => (
          <Box key={String(result.total_kcal)} marginTop={1} marginBottom={1}>
            <Text bold>Meal result</Text>
            {mealList(result)}
          </Box>
        ))}
        {dailyResults.map((result) => (
          <Box key={result.date} marginTop={1} marginBottom={1}>
            <Text bold>Daily total</Text>
            {dailyProgress(result)}
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        {isThinking ? (
          <Text color="yellow">thinking…</Text>
        ) : (
          <>
            <Text color="green">› </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder="e.g. 150 g of zitumbuwa"
            />
          </>
        )}
      </Box>

      {messages.length > VIEWPORT_HEIGHT ? (
        <Text dimColor>
          Showing{" "}
          {start + 1}-
          {Math.min(start + VIEWPORT_HEIGHT, messages.length)} of{" "}
          {messages.length} messages
        </Text>
      ) : null}
    </Box>
  );
}

render(<App />, { exitOnCtrlC: false });

function truncateArgs(argumentsText: string): string {
  try {
    const parsed = JSON.parse(argumentsText);
    const keys = Object.keys(parsed);
    if (keys.length === 0) return "";
    const first = keys[0];
    return `${first}=…`;
  } catch {
    return argumentsText.slice(0, 40);
  }
}

function truncateResult(result: string): string {
  return result.length > MAX_RESULT_CHARS
    ? `${result.slice(0, MAX_RESULT_CHARS)}...`
    : result;
}
