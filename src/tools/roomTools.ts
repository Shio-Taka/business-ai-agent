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

const reservations: Reservation[] = [
  {
    roomId: "room-b",
    date: "2026-08-16",
    startTime: "14:00",
    endTime: "15:00",
  },
];

function isValidDate(date: string): boolean {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(date)) {
    return false;
  }

  const parsedDate = new Date(`${date}T00:00:00`);

  return !Number.isNaN(parsedDate.getTime());
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function isValidTime(time: string): boolean {
  const timePattern = /^\d{2}:\d{2}$/;

  if (!timePattern.test(time)) {
    return false;
  }

  const minutes = timeToMinutes(time);

  return minutes >= 0 && minutes < 24 * 60;
}

function validateReservationInput(
  date: string,
  startTime: string,
  endTime: string,
  participants: number,
): void {
  if (!isValidDate(date)) {
    throw new Error("日付はYYYY-MM-DD形式で指定してください。");
  }

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    throw new Error("時刻はHH:mm形式で指定してください。");
  }

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    throw new Error("開始時刻は終了時刻より前にしてください。");
  }

  if (!Number.isInteger(participants) || participants <= 0) {
    throw new Error("参加人数は1人以上の整数で指定してください。");
  }
}

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
  validateReservationInput(date, startTime, endTime, participants);

  return rooms.filter((room) => {
    if (room.capacity < participants) {
      return false;
    }

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

export function reserveRoom(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
): Room | null {
  const room = rooms.find((room) => room.id === roomId);

  if (!room) {
    return null;
  }

  const hasConflict = reservations.some((reservation) => {
    return (
      reservation.roomId === roomId &&
      reservation.date === date &&
      isOverlapping(
        startTime,
        endTime,
        reservation.startTime,
        reservation.endTime,
      )
    );
  });

  if (hasConflict) {
    return null;
  }

  reservations.push({
    roomId,
    date,
    startTime,
    endTime,
  });

  return room;
}