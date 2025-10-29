import { addMinutes, format, isBefore, isSunday, parseISO, setHours, setMinutes } from 'date-fns';

export const OPEN_HOUR = 11;
export const CLOSE_HOUR = 19;
export const SLOT_INTERVAL = 30;
export const MAX_APPOINTMENTS_PER_DAY = 6;

export const isWorkingDay = (date) => !isSunday(date);

export const generateSlots = () => {
  const slots = [];
  let cursor = setMinutes(setHours(new Date(), OPEN_HOUR), 0);
  const closing = setMinutes(setHours(new Date(), CLOSE_HOUR), 0);

  while (isBefore(cursor, closing)) {
    slots.push(format(cursor, 'HH:mm'));
    cursor = addMinutes(cursor, SLOT_INTERVAL);
  }

  return slots;
};

export const DAILY_SLOTS = generateSlots();

export const formatDate = (date) => format(date, 'yyyy-MM-dd');

export const parseLocalDate = (value) => {
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

export const nextWorkingDay = (startDate) => {
  for (let i = 0; i < 30; i += 1) {
    const candidate = new Date(startDate);
    candidate.setDate(candidate.getDate() + i);
    if (isWorkingDay(candidate)) {
      return candidate;
    }
  }
  return startDate;
};

export const getNearestSlot = (suggestedSlot) => {
  if (!suggestedSlot) return null;
  return `${suggestedSlot.date} at ${suggestedSlot.time}`;
};
