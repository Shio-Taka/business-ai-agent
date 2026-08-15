export type Room = {
  id: string;
  name: string;
  capacity: number;
};

type Reservation = {
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
};

const rooms: Room[] = [
  {
    id: "room-a",
    name: "会議室A",
    capacity: 4,
  },
  {
    id: "room-b",
    name: "会議室B",
    capacity: 8,
  },
  {
    id: "room-c",
    name: "会議室C",
    capacity: 12,
  },
];

// 仮の予約データ
const reservations: Reservation[] = [
  {
    roomId: "room-b",
    date: "2026-08-16",
    startTime: "14:00",
    endTime: "15:00",
  },
];

function isOverlapping(
  startTime: string,
  endTime: string,
  reservationStart: string,
  reservationEnd: string,
): boolean {
  return startTime < reservationEnd && endTime > reservationStart;
}

export function getAvailableRooms(
  date: string,
  startTime: string,
  endTime: string,
  participants: number,
): Room[] {
  return rooms.filter((room) => {
    // 収容人数を超える会議室は除外
    if (room.capacity < participants) {
      return false;
    }

    // 指定時間に予約が入っているか確認
    const hasConflict = reservations.some((reservation) => {
      return (
        reservation.roomId === room.id &&
        reservation.date === date &&
        isOverlapping(
          startTime,
          endTime,
          reservation.startTime,
          reservation.endTime,
        )
      );
    });

    return !hasConflict;
  });
}