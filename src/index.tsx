import { useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions.js";
import { runAgentTurn } from "./agent/loop.js";

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

const VIEWPORT_HEIGHT = 12;
const MAX_RESULT_CHARS = 900;

function truncateResult(result: string): string {
  return result.length > MAX_RESULT_CHARS
    ? `${result.slice(0, MAX_RESULT_CHARS)}...`
    : result;
}

function MessageRow({ message }: { message: UiMessage }) {
  switch (message.kind) {
    case "user":
      return <Text color="cyan">You: {message.text}</Text>;
    case "assistant":
      return <Text>Agent: {message.text}</Text>;
    case "tool_call":
      return <Text dimColor>  tool {message.text}</Text>;
    case "tool_result":
      return <Text dimColor>  result {message.text}</Text>;
    case "error":
      return <Text color="red">Error: {message.text}</Text>;
  }
}

function App() {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
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

    try {
      const result = await runAgentTurn(
        historyRef.current,
        trimmed,
        (event) => {
          if (event.type === "tool_call") {
            addMessage(
              "tool_call",
              `${event.name}(${event.arguments})`,
            );
          }
          if (event.type === "tool_result") {
            addMessage(
              "tool_result",
              `${event.name}: ${truncateResult(event.result)}`,
            );
          }
        },
      );
      historyRef.current = result.messages;
      addMessage("assistant", result.reply || "(no response)");
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
      <Text dimColor>
        Calories only. Enter to send, Up/Down to scroll, Ctrl+C to exit.
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {messages.length === 0 ? (
          <Text dimColor>Ask about a food or log a meal in grams.</Text>
        ) : (
          visibleMessages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))
        )}
      </Box>

      <Box marginTop={1}>
        {isThinking ? (
          <Text color="yellow">Thinking...</Text>
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
          Showing {start + 1}-
          {Math.min(start + VIEWPORT_HEIGHT, messages.length)} of{" "}
          {messages.length} messages
        </Text>
      ) : null}
    </Box>
  );
}

render(<App />, { exitOnCtrlC: false });
