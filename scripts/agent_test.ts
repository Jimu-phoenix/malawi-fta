import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions.js";
import { runAgentTurn } from "../src/agent/loop.js";

const scenarios: Array<{ label: string; message: string }> = [
  {
    label: "(a) zitumbuwa logs directly with no questions",
    message: "I had 2 zitumbuwa",
  },
  {
    label: "(b) bread asks exactly one clarifying question",
    message: "I had bread",
  },
  {
    label: "(c) undo that removes the last meal",
    message: "undo that",
  },
  {
    label: "(d) unknown food replies not in table without inventing numbers",
    message: "I ate 100 g of fooobar",
  },
];

let history: ChatCompletionMessageParam[] = [];

for (const scenario of scenarios) {
  console.log(`\n=== ${scenario.label} ===`);
  console.log(`USER: ${scenario.message}`);

  const result = await runAgentTurn(history, scenario.message, (event) => {
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
