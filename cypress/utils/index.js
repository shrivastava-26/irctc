import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export function formatDate(inputDate) {
  return dayjs(inputDate, 'DD/MM/YYYY', true).format('ddd, DD MMM');
}

// Migrated from the original project unchanged. Do not change these values
// until a current authoritative IRCTC source or the live UI proves otherwise.
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
  if (!openTime) throw new Error(`Unsupported coach: ${coach}`);

  const [hour, minute] = openTime.split(':').map(Number);
  return now.isAfter(now.hour(hour).minute(minute).second(0).millisecond(0));
};

export const tatkalOpenTimeForToday = (coach) => {
  const openTime = tatkalOpenTimings[coach];
  if (!openTime) throw new Error(`Unsupported coach: ${coach}`);
  return openTime;
};

