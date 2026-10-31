import Groq from "groq-sdk";
import { config } from "../src/config.js";

const groq = new Groq({ apiKey: config.groqApiKey });

const completion = await groq.chat.completions.create({
  model: config.groqModel,
  messages: [{ role: "user", content: "Reply with the single word: ready" }],
});

const reply = completion.choices[0]?.message?.content;
console.log(reply ?? "(no reply received)");
