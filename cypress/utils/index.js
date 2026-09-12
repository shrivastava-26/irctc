import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export function formatDate(inputDate) {
  return dayjs(inputDate, 'DD/MM/YYYY', true).format('ddd, DD MMM');
}

// Tatkal opening times — do not change without authoritative IRCTC evidence.
// AC classes (1A, 2A, 3A, 3E, CC, EC): 10:00 IST
// Non-AC classes (SL, 2S): 11:00 IST
export const tatkalOpenTimings = {
  '1A': '10:00',
  '2A': '10:00',
  '3A': '10:00',
  '3E': '10:00',
  CC: '10:00',
  EC: '10:00',
  '2S': '11:00',
  SL: '11:00',
};

export const hasTatkalAlreadyOpened = (coach, now = dayjs()) => {
  const openTime = tatkalOpenTimings[coach];
  if (!openTime) throw new Error(`Unsupported coach type for Tatkal: ${coach}`);
  const [hour, minute] = openTime.split(':').map(Number);
  const target = now.hour(hour).minute(minute).second(0).millisecond(0);
  return now.isAfter(target);
};

export const tatkalOpenTimeForToday = (coach) => {
  const openTime = tatkalOpenTimings[coach];
  if (!openTime) throw new Error(`Unsupported coach type for Tatkal: ${coach}`);
  return openTime;
};
