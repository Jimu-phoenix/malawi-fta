import { useState } from "react";
import { Box, Text, render } from "ink";
import TextInput from "ink-text-input";

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  function handleSubmit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setMessages((current) => [...current, `You: ${trimmed}`]);
    setInput("");
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Malawi Food Tracker</Text>
      <Text dimColor>Type a meal and press Enter.</Text>
      <Box flexDirection="column" marginTop={1}>
        {messages.map((message, index) => (
          <Text key={index}>{message}</Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="green">› </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="e.g. nsima with fried eggs"
        />
      </Box>
    </Box>
  );
}

render(<App />);
