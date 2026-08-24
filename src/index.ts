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
      required: [
        "date",
        "startTime",
        "endTime",
        "participants",
      ],
    },
  },
  {
    type: "function" as const,
    name: "book_room",
    description:
      "ユーザーが明確に「はい」と予約を承認した後に、指定された会議室を予約します。確認前には絶対に呼び出してはいけません。",
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

ユーザーの依頼内容から以下の情報を抽出してください。

- 予約日
- 開始時刻
- 終了時刻
- 参加人数

予約フロー:

1. 必要な予約情報を抽出する。
2. 必要な情報がすべて揃ったら、get_available_roomsを呼び出す。
3. get_available_roomsの結果から利用可能な会議室をユーザーに提示する。
4. ユーザーが会議室を選択したら、その会議室・日時・参加人数を提示する。
5. 予約確認では必ず「この予約を実行しますか？（はい / いいえ）」と表示する。
6. ユーザーが明確に「はい」と回答した場合のみbook_roomを呼び出す。
7. ユーザーが「いいえ」と回答した場合は、予約を実行せず予約処理を終了する。
8. 「会議室Bでお願いします」など、会議室を選択しただけではbook_roomを呼び出さない。
9. 利用可能な会議室がない場合はbook_roomを呼び出さない。
10. ユーザーの明確な「はい」による確認なしにbook_roomを呼び出さない。
11. 予約完了後は、会議室・日時・参加人数を表示する。

入力ルール:

- 参加人数は1人以上の整数である必要があります。
- 参加人数が0以下の場合は不正な入力です。
- 参加人数が不正な場合はget_available_roomsを呼び出してはいけません。
- 必要な情報が不足している場合は、不足している情報をユーザーに質問してください。
- 「明日」「明後日」などの相対的な日付は、現在日時を基準にYYYY-MM-DDへ変換してください。
`;
}

async function main() {
  const readline = createInterface({
    input,
    output,
  });

  let reservationConfirmed = false;

  try {
    // ==========================================================
    // 1. 最初の予約内容を入力
    // ==========================================================

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

    let interaction = await ai.interactions.create({
      model: MODEL,
      input: `
${getSystemInstruction(currentDateTime)}

ユーザーの依頼:
${userInput}
      `,
      tools: roomTools,
    });

    while (true) {
      const toolCall = interaction.steps.find(
        (step) => step.type === "function_call",
      );

      // ========================================================
      // Toolがない場合
      // ========================================================

      if (!toolCall || toolCall.type !== "function_call") {
        const aiMessage = interaction.output_text;

        console.log("\nAI:", aiMessage);

        const additionalInput = await readline.question(
          "あなた: ",
        );

        const trimmedInput = additionalInput.trim();

        // 終了
        if (trimmedInput === "終了") {
          console.log("AI: 予約処理を終了しました。");
          break;
        }

        if (!trimmedInput) {
          continue;
        }

        // ======================================================
        // 「いいえ」の場合
        // ======================================================

        if (
          trimmedInput === "いいえ" ||
          trimmedInput === "キャンセル"
        ) {
          reservationConfirmed = false;

          console.log("AI: 予約をキャンセルしました。");
          break;
        }

        // ======================================================
        // 「はい」の場合
        // ======================================================

        if (trimmedInput === "はい") {
          reservationConfirmed = true;
        }

        interaction = await ai.interactions.create({
          model: MODEL,
          previous_interaction_id: interaction.id,
          input: additionalInput,
          tools: roomTools,
          system_instruction:
            getSystemInstruction(currentDateTime),
        });

        continue;
      }

      // ========================================================
      // Tool呼び出し
      // ========================================================

      console.log("\nTool:", toolCall.name);

      console.log(
        "Arguments:",
        JSON.stringify(toolCall.arguments, null, 2),
      );

      const args = toolCall.arguments as ReservationArgs;

      // ========================================================
      // 2・3. get_available_rooms
      // ========================================================

      if (toolCall.name === "get_available_rooms") {
        try {
          // 参加人数チェック
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

            console.log("Tool result:", errorResult);

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

          // 利用可能な会議室を検索
          const rooms = getAvailableRooms(
            args.date,
            args.startTime,
            args.endTime,
            args.participants,
          );

          console.log("Tool result:", rooms);

          // 利用可能な会議室がない場合
          if (rooms.length === 0) {
            const result = {
              success: false,
              rooms: [],
              message:
                "利用可能な会議室がありません。",
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
          }

          // AIへ検索結果を返す
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
          const errorResult = {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "予期しないエラーが発生しました。",
          };

          console.log("Tool error:", errorResult);

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

      // ========================================================
      // 6・7. book_room
      // ========================================================

      if (toolCall.name === "book_room") {
        try {
          // アプリ側でも「はい」を確認
          if (!reservationConfirmed) {
            const errorResult = {
              success: false,
              error:
                "ユーザーによる予約確認が完了していません。",
            };

            console.log("Tool result:", errorResult);

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

          // 予約情報チェック
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

            console.log("Tool result:", errorResult);

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

          // ====================================================
          // 実際に予約
          // ====================================================

          const reservation = reserveRoom(
            args.roomId,
            args.date,
            args.startTime,
            args.endTime,
          );

          // 予約失敗
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

          // ====================================================
          // 予約成功
          // ====================================================

          const result = {
            success: true,
            reservation: {
              ...reservation,
              participants: args.participants,
            },
          };

          console.log("Tool result:", result);

          // AIへ予約結果を返す
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

          // 予約完了を表示
          console.log("\nAI:", interaction.output_text);

          // 予約完了後は終了
          break;
        } catch (error) {
          const errorResult = {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "予期しないエラーが発生しました。",
          };

          console.log("Tool error:", errorResult);

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