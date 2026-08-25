import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getAvailableRooms, reserveRoom } from "./tools/roomTools";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL = "gemini-3.6-flash";

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
          description: "参加人数。1以上の整数。",
        },
      },
      required: ["date", "startTime", "endTime", "participants"],
    },
  },
  {
    type: "function" as const,
    name: "book_room",
    description:
      "ユーザーが予約内容を確認した後に、指定された会議室を予約します。ユーザーの確認前には絶対に呼び出してはいけません。",
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
          description: "参加人数。1以上の整数。",
        },
      },
      required: [
        "roomId",
        "date",
        "startTime",
        "endTime",
        "participants",
      ],
    },
  },
];

type ReservationArgs = {
  date: string;
  startTime: string;
  endTime: string;
  participants?: number;
  roomId?: string;
};

function getSystemInstruction(currentDateTime: string) {
  return `
現在日時: ${currentDateTime}
タイムゾーン: Asia/Tokyo

あなたは会議室予約を支援するAIエージェントです。

ユーザーの依頼内容を確認し、予約に必要な情報を判断してください。

必要な情報:
- 予約日
- 開始時刻
- 終了時刻
- 参加人数

重要な入力ルール:

1. 参加人数は1人以上の整数である必要があります。
2. 参加人数が0以下の場合は不正な入力です。
3. 参加人数が不正な場合は、get_available_roomsを呼び出してはいけません。
4. 不正な参加人数が入力された場合、ユーザーが正しい参加人数を入力するまで予約処理を進めないでください。
5. ユーザーが追加情報を入力した場合は、以前の情報と合わせて判断してください。
6. 追加情報で以前の値が修正された場合は、最新の値を使用してください。
7. 「明日」「明後日」「来週月曜日」などの相対的な日付が指定された場合は、現在日時を基準にYYYY-MM-DD形式へ変換してください。
8. 必要な情報が不足している場合は、不足している情報だけをユーザーに質問してください。
9. 必要な情報がすべて揃った場合のみ、get_available_roomsを使用してください。
10. get_available_roomsの結果を受け取ったら、利用可能な会議室と予約内容をユーザーに提示し、予約してよいか確認してください。
11. ユーザーが「はい」「予約して」「お願いします」など、予約を承認した場合のみbook_roomを呼び出してください。
12. ユーザーが「いいえ」「キャンセル」などと回答した場合はbook_roomを呼び出さず、予約をキャンセルしてください。
13. ユーザーの確認なしにbook_roomを呼び出してはいけません。
14. 利用可能な会議室がない場合は、book_roomを呼び出してはいけません。
15. 予約が完了したら、予約した会議室、日時、参加人数をユーザーに分かりやすく伝えてください。
`;
}

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

    const now = new Date();

    const currentDateTime = now.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });

    /*
     * 最初のInteraction
     */
    let interaction = await ai.interactions.create({
      model: MODEL,
      input: `
${getSystemInstruction(currentDateTime)}

ユーザーの依頼:
${userInput}
      `,
      tools: roomTools,
    });

    /*
     * エージェントループ
     */
    while (true) {
      const toolCall = interaction.steps.find(
        (step) => step.type === "function_call",
      );

      /*
       * Tool Callがない場合
       *
       * → Geminiの通常回答を表示
       * → ユーザーから追加情報を受け取る
       * → previous_interaction_idで会話を継続
       */
      if (!toolCall || toolCall.type !== "function_call") {
        const aiMessage = interaction.output_text;

        console.log("\nAI:", aiMessage);

        const additionalInput = await readline.question(
          "追加情報を入力してください（終了する場合は「終了」）: ",
        );

        if (additionalInput.trim() === "終了") {
          console.log("AI: 予約処理を終了しました。");
          break;
        }

        if (!additionalInput.trim()) {
          console.log("AI: 入力内容が空です。");
          continue;
        }

        interaction = await ai.interactions.create({
          model: MODEL,
          previous_interaction_id: interaction.id,
          input: additionalInput,
          tools: roomTools,
          system_instruction: getSystemInstruction(
            currentDateTime,
          ),
        });

        continue;
      }

      /*
       * Tool Callを表示
       */
      console.log("\nTool:", toolCall.name);
      console.log(
        "Arguments:",
        JSON.stringify(toolCall.arguments, null, 2),
      );

      const args = toolCall.arguments as ReservationArgs;

      /*
       * ==========================================================
       * get_available_rooms
       * ==========================================================
       */
      if (toolCall.name === "get_available_rooms") {
        try {
          /*
           * アプリ側でも参加人数を検証する。
           *
           * LLMの判断だけに依存せず、
           * 実際のTool実行前にもバリデーションを行う。
           */
          if (
            args.participants === undefined ||
            !Number.isInteger(args.participants) ||
            args.participants < 1
          ) {
            const errorResult = {
              success: false,
              error:
                "参加人数は1人以上の整数で指定してください。",
            };

            console.log(
              "Tool result:",
              errorResult,
            );

            interaction = await ai.interactions.create({
              model: MODEL,
              previous_interaction_id: interaction.id,
              input: [
                {
                  type: "function_result",
                  name: toolCall.name,
                  call_id: toolCall.id,
                  result: [
                    {
                      type: "text",
                      text: JSON.stringify(errorResult),
                    },
                  ],
                },
              ],
              tools: roomTools,
              system_instruction:
                getSystemInstruction(currentDateTime),
            });

            continue;
          }

          /*
           * 実際の会議室検索
           */
          const rooms = getAvailableRooms(
            args.date,
            args.startTime,
            args.endTime,
            args.participants,
          );

          console.log("Tool result:", rooms);

          /*
           * 利用可能な部屋がない場合
           *
           * シナリオ4:
           * 「利用可能な会議室がありません。」
           * と表示して、そのまま予約処理を終了する。
           */
          if (rooms.length === 0) {
            console.log("AI: 利用可能な会議室がありません。");
            break;
          }

          /*
           * Toolの結果をGeminiへ返す
           *
           * ここがエージェントループの重要部分。
           */
          const result = {
            success: true,
            rooms,
          };

          interaction = await ai.interactions.create({
            model: MODEL,
            previous_interaction_id: interaction.id,
            input: [
              {
                type: "function_result",
                name: toolCall.name,
                call_id: toolCall.id,
                result: [
                  {
                    type: "text",
                    text: JSON.stringify(result),
                  },
                ],
              },
            ],
            tools: roomTools,
            system_instruction:
              getSystemInstruction(currentDateTime),
          });

          continue;
        } catch (error) {
          console.log(
            "Tool error:",
            error instanceof Error
              ? error.message
              : "予期しないエラーが発生しました。",
          );

          const errorResult = {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "予期しないエラーが発生しました。",
          };

          interaction = await ai.interactions.create({
            model: MODEL,
            previous_interaction_id: interaction.id,
            input: [
              {
                type: "function_result",
                name: toolCall.name,
                call_id: toolCall.id,
                result: [
                  {
                    type: "text",
                    text: JSON.stringify(errorResult),
                  },
                ],
              },
            ],
            tools: roomTools,
            system_instruction:
              getSystemInstruction(currentDateTime),
          });

          continue;
        }
      }

      /*
       * ==========================================================
       * book_room
       * ==========================================================
       */
      if (toolCall.name === "book_room") {
        try {
          /*
           * book_room側でも安全のためバリデーション
           */
          if (
            !args.roomId ||
            !args.date ||
            !args.startTime ||
            !args.endTime ||
            args.participants === undefined ||
            !Number.isInteger(args.participants) ||
            args.participants < 1
          ) {
            const errorResult = {
              success: false,
              error:
                "予約に必要な情報が正しく指定されていません。",
            };

            console.log(
              "Tool result:",
              errorResult,
            );

            interaction = await ai.interactions.create({
              model: MODEL,
              previous_interaction_id: interaction.id,
              input: [
                {
                  type: "function_result",
                  name: toolCall.name,
                  call_id: toolCall.id,
                  result: [
                    {
                      type: "text",
                      text: JSON.stringify(errorResult),
                    },
                  ],
                },
              ],
              tools: roomTools,
              system_instruction:
                getSystemInstruction(currentDateTime),
            });

            continue;
          }

          /*
           * book_room Toolの実体
           */
          const reservation = reserveRoom(
            args.roomId,
            args.date,
            args.startTime,
            args.endTime,
          );

          console.log("Tool: book_room");
          console.log(
            "Arguments:",
            JSON.stringify(args, null, 2),
          );

          /*
           * 予約失敗
           */
          if (reservation === null) {
            const result = {
              success: false,
              message:
                "指定した会議室は予約できませんでした。",
            };

            console.log("Tool result:", result);

            interaction = await ai.interactions.create({
              model: MODEL,
              previous_interaction_id: interaction.id,
              input: [
                {
                  type: "function_result",
                  name: toolCall.name,
                  call_id: toolCall.id,
                  result: [
                    {
                      type: "text",
                      text: JSON.stringify(result),
                    },
                  ],
                },
              ],
              tools: roomTools,
              system_instruction:
                getSystemInstruction(currentDateTime),
            });

            continue;
          }

          /*
           * 予約成功
           */
          const result = {
            success: true,
            reservation: {
              ...reservation,
              participants: args.participants,
            },
          };

          console.log("Tool result:", result);

          /*
           * book_roomの結果をGeminiへ返す
           */
          interaction = await ai.interactions.create({
            model: MODEL,
            previous_interaction_id: interaction.id,
            input: [
              {
                type: "function_result",
                name: toolCall.name,
                call_id: toolCall.id,
                result: [
                  {
                    type: "text",
                    text: JSON.stringify(result),
                  },
                ],
              },
            ],
            tools: roomTools,
            system_instruction:
              getSystemInstruction(currentDateTime),
          });

          continue;
        } catch (error) {
          console.log(
            "Tool error:",
            error instanceof Error
              ? error.message
              : "予期しないエラーが発生しました。",
          );

          const errorResult = {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "予期しないエラーが発生しました。",
          };

          interaction = await ai.interactions.create({
            model: MODEL,
            previous_interaction_id: interaction.id,
            input: [
              {
                type: "function_result",
                name: toolCall.name,
                call_id: toolCall.id,
                result: [
                  {
                    type: "text",
                    text: JSON.stringify(errorResult),
                  },
                ],
              },
            ],
            tools: roomTools,
            system_instruction:
              getSystemInstruction(currentDateTime),
          });

          continue;
        }
      }

      /*
       * 未知のTool
       */
      console.log(
        `AI: 未知のToolです: ${toolCall.name}`,
      );

      break;
    }
  } catch (error) {
    console.error(
      "エラー:",
      error instanceof Error
        ? error.message
        : error,
    );
  } finally {
    readline.close();
  }
}

main();