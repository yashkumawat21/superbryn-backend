// Hard-coded available appointment slots
export const AVAILABLE_SLOTS = [
  { date: '2024-01-15', time: '09:00', available: true },
  { date: '2024-01-15', time: '10:00', available: true },
  { date: '2024-01-15', time: '11:00', available: true },
  { date: '2024-01-15', time: '14:00', available: true },
  { date: '2024-01-15', time: '15:00', available: true },
  { date: '2024-01-16', time: '09:00', available: true },
  { date: '2024-01-16', time: '10:00', available: true },
  { date: '2024-01-16', time: '11:00', available: true },
  { date: '2024-01-16', time: '14:00', available: true },
  { date: '2024-01-16', time: '15:00', available: true },
  { date: '2024-01-17', time: '09:00', available: true },
  { date: '2024-01-17', time: '10:00', available: true },
  { date: '2024-01-17', time: '11:00', available: true },
  { date: '2024-01-17', time: '14:00', available: true },
  { date: '2024-01-17', time: '15:00', available: true },
];

export function getAvailableSlots(date?: string) {
  if (date) {
    return AVAILABLE_SLOTS.filter(slot => slot.date === date && slot.available);
  }
  return AVAILABLE_SLOTS.filter(slot => slot.available);
}
