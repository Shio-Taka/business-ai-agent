import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
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
      "ユーザーの確認後に、指定した会議室を予約します。",
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
  const readline = createInterface({ input, output });

  try {
    const userInput = await readline.question(
      "会議室の予約内容を入力してください: ",
    );

    if (!userInput.trim()) {
      console.log("AI: 予約内容が入力されていません。");
      return;
    }

    // 現在日時を日本時間で取得
    const now = new Date();

    const currentDateTime = now.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });

    let interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: `
現在日時: ${currentDateTime}
タイムゾーン: Asia/Tokyo

あなたは会議室予約を支援するAIエージェントです。

ユーザーの依頼内容を確認し、必要な情報を判断してください。

「明日」「明後日」「来週月曜日」などの相対的な日付が指定された場合は、
現在日時を基準に具体的なYYYY-MM-DD形式の日付へ変換してください。

必要な情報が揃っている場合は、
get_available_rooms を使用して空室を確認してください。

予約を実行する前には、必ずユーザーに確認を求めてください。
ユーザーの確認なしに book_room を実行してはいけません。

ユーザーの依頼:
${userInput}
      `,
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

      if (toolCall.name === "get_available_rooms") {
        try {
          if (args.participants === undefined) {
            throw new Error("参加人数が指定されていません。");
          }

          const rooms = getAvailableRooms(
            args.date,
            args.startTime,
            args.endTime,
            args.participants,
          );

          console.log("Tool result:", rooms);

          if (rooms.length === 0) {
            console.log("AI: 利用可能な会議室がありません。");
            break;
          }

          const selectedRoom = rooms[0];

          console.log(
            `\n${selectedRoom.name}（定員${selectedRoom.capacity}名）を`,
          );

          console.log(
            `${args.date} ${args.startTime}〜${args.endTime}で予約します。`,
          );

          const answer = await readline.question(
            "この予約を実行しますか？（はい / いいえ）: ",
          );

          if (answer.trim() !== "はい") {
            console.log("AI: 予約をキャンセルしました。");
            break;
          }

          // ユーザー確認後、予約を実行
          const reservation = reserveRoom(
            selectedRoom.id,
            args.date,
            args.startTime,
            args.endTime,
          );

          if (reservation === null) {
            console.log("AI: 予約に失敗しました。");
            break;
          }

          console.log("Tool: book_room");
          console.log("Tool result:", reservation);

          console.log("\nAI: 予約が完了しました。");
          console.log(`会議室: ${reservation.name}`);
          console.log(
            `日時: ${args.date} ${args.startTime}〜${args.endTime}`,
          );
          console.log(`利用人数: ${args.participants}名`);

          break;
        } catch (error) {
          console.log(
            "AI:",
            error instanceof Error
              ? error.message
              : "予期しないエラーが発生しました。",
          );

          break;
        }
      }

      if (toolCall.name === "book_room") {
        try {
          if (!args.roomId) {
            throw new Error("roomIdが指定されていません。");
          }

          const reservation = reserveRoom(
            args.roomId,
            args.date,
            args.startTime,
            args.endTime,
          );

          if (reservation === null) {
            throw new Error("指定した会議室は予約できません。");
          }

          console.log("Tool result:", reservation);

          console.log("\nAI: 予約が完了しました。");
          console.log(`会議室: ${reservation.name}`);
          console.log(
            `日時: ${args.date} ${args.startTime}〜${args.endTime}`,
          );

          if (args.participants !== undefined) {
            console.log(`利用人数: ${args.participants}名`);
          }

          break;
        } catch (error) {
          console.log(
            "AI:",
            error instanceof Error
              ? error.message
              : "予期しないエラーが発生しました。",
          );

          break;
        }
      }

      console.log(`AI: 未知のToolです: ${toolCall.name}`);
      break;
    }
  } finally {
    readline.close();
  }
}

main();