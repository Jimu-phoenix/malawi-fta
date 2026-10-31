import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions.js";
import { runAgentTurn } from "../src/agent/loop.js";

const messages = [
  "how many calories in 150 g of zitumbuwa?",
  "I ate 200 g of nsima",
  "what is my total today?",
];

let history: ChatCompletionMessageParam[] = [];

for (const message of messages) {
  console.log(`\nUSER: ${message}`);

  const result = await runAgentTurn(history, message, (event) => {
    if (event.type === "tool_call") {
      console.log(`TOOL CALL: ${event.name}(${event.arguments})`);
    }
    if (event.type === "tool_result") {
      console.log(`TOOL RESULT: ${event.result}`);
    }
  });

  history = result.messages;
  console.log(`ASSISTANT: ${result.reply}`);
}
