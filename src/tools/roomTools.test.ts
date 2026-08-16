import { describe, expect, test } from "vitest";
import { getAvailableRooms } from "./roomTools";

describe("getAvailableRooms", () => {
  test("5人の場合、利用可能な会議室を取得できる", () => {
    const rooms = getAvailableRooms(
      "2026-08-16",
      "14:00",
      "15:00",
      5,
    );

    expect(rooms).toEqual([
      {
        id: "room-c",
        name: "会議室C",
        capacity: 12,
      },
    ]);
  });

  test("13人の場合、利用可能な会議室がない", () => {
    const rooms = getAvailableRooms(
      "2026-08-16",
      "14:00",
      "15:00",
      13,
    );

    expect(rooms).toEqual([]);
  });

  test("参加人数が0人の場合、エラーになる", () => {
    expect(() =>
      getAvailableRooms(
        "2026-08-16",
        "14:00",
        "15:00",
        0,
      ),
    ).toThrow();
  });

  test("終了時刻が開始時刻より前の場合、エラーになる", () => {
    expect(() =>
      getAvailableRooms(
        "2026-08-16",
        "15:00",
        "14:00",
        5,
      ),
    ).toThrow();
  });
});