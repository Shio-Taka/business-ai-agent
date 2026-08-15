import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import { getAvailableRooms } from "./tools/roomTools";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const roomTool = {
  type: "function" as const,
  name: "get_available_rooms",
  description:
    "指定した日時と参加人数から、利用可能な会議室を検索します。",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "予約日。YYYY-MM-DD形式。",
      },
      startTime: {
        type: "string",
        description: "開始時刻。HH:mm形式。",
      },
      endTime: {
        type: "string",
        description: "終了時刻。HH:mm形式。",
      },
      participants: {
        type: "number",
        description: "参加人数。",
      },
    },
    required: ["date", "startTime", "endTime", "participants"],
  },
};

async function main() {
  const interaction = await ai.interactions.create({
    model: "gemini-3.6-flash",
    input:
      "2026-08-16の14:00から15:00まで、5人で使える会議室を探してください。",
    tools: [roomTool],
  });

  const toolCall = interaction.steps.find(
    (step) => step.type === "function_call",
  );

  if (!toolCall || toolCall.type !== "function_call") {
    console.log(interaction.output_text);
    return;
  }

  console.log("Tool:", toolCall.name);
  console.log("Arguments:", toolCall.arguments);

  const args = toolCall.arguments as {
    date: string;
    startTime: string;
    endTime: string;
    participants: number;
  };

  const rooms = getAvailableRooms(
    args.date,
    args.startTime,
    args.endTime,
    args.participants,
  );

  console.log("Available rooms:", rooms);

  const finalInteraction = await ai.interactions.create({
    model: "gemini-3.6-flash",
    previous_interaction_id: interaction.id,
    input: [
      {
        type: "function_result",
        name: toolCall.name,
        call_id: toolCall.id,
        result: [
          {
            type: "text",
            text: JSON.stringify(rooms),
          },
        ],
      },
    ],
  });

  console.log("AI:", finalInteraction.output_text);
}

main();