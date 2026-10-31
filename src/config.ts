import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const envSchema = z.object({
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
  GROQ_MODEL: z.string().min(1, "GROQ_MODEL is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(
    `Invalid environment configuration:\n${details}\n` +
      "Copy .env.example to .env and fill in the required values.",
  );
  process.exit(1);
}

export const config = {
  groqApiKey: parsed.data.GROQ_API_KEY,
  groqModel: parsed.data.GROQ_MODEL,
} as const;
