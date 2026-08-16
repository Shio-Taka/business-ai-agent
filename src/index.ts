import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import { getAvailableRooms, reserveRoom } from "./tools/roomTools";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const roomTools = [
  {
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
  },
  {
    type: "function" as const,
    name: "book_room",
    description:
      "指定した会議室を指定日時に予約します。予約前に空き状況を確認してください。",
    parameters: {
      type: "object",
      properties: {
        roomId: {
          type: "string",
          description: "予約する会議室のID。",
        },
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
      required: ["roomId", "date", "startTime", "endTime"],
    },
  },
];

async function main() {
  let interaction = await ai.interactions.create({
    model: "gemini-3.6-flash",
    input:
      "2026-08-16の14:00から15:00まで、5人で使える会議室を予約してください。",
    tools: roomTools,
  });

  while (true) {
    const toolCall = interaction.steps.find(
      (step) => step.type === "function_call",
    );

    if (!toolCall || toolCall.type !== "function_call") {
      console.log("AI:", interaction.output_text);
      break;
    }

    console.log("Tool:", toolCall.name);
    console.log("Arguments:", toolCall.arguments);

    const args = toolCall.arguments as {
      date: string;
      startTime: string;
      endTime: string;
      participants?: number;
      roomId?: string;
    };

    let toolResult: unknown;

    try {
      if (toolCall.name === "get_available_rooms") {
        if (args.participants === undefined) {
          throw new Error("参加人数が指定されていません。");
        }

        toolResult = getAvailableRooms(
          args.date,
          args.startTime,
          args.endTime,
          args.participants,
        );
      } else if (toolCall.name === "book_room") {
        if (!args.roomId) {
          throw new Error("roomIdが指定されていません。");
        }

        toolResult = reserveRoom(
          args.roomId,
          args.date,
          args.startTime,
          args.endTime,
        );

        if (toolResult === null) {
          throw new Error("指定した会議室は予約できません。");
        }
      } else {
        throw new Error(`未知のToolです: ${toolCall.name}`);
      }
    } catch (error) {
      toolResult = {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "予期しないエラーが発生しました。",
      };
    }

    console.log("Tool result:", toolResult);

    interaction = await ai.interactions.create({
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
              text: JSON.stringify(toolResult),
            },
          ],
        },
      ],
    });
  }
}

main();