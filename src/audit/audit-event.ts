export const PROFILE_CHANGED_EVENT = 'employee.profile.changed';
export const PROFILE_CHANGED_QUEUE = 'employee.profile.changed';
export const PROFILE_CHANGED_DEAD_QUEUE =
  'employee.profile.changed.dead';

export interface ProfileChangedEvent {
  eventId: string;
  eventType: typeof PROFILE_CHANGED_EVENT;
  employeeId: string;
  changedFields: string[];
  occurredAt: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isProfileChangedEvent(
  value: unknown,
): value is ProfileChangedEvent {
  if (!value || typeof value !== 'object') return false;

  const event = value as Record<string, unknown>;

  return (
    typeof event.eventId === 'string' &&
    UUID_PATTERN.test(event.eventId) &&
    event.eventType === PROFILE_CHANGED_EVENT &&
    typeof event.employeeId === 'string' &&
    UUID_PATTERN.test(event.employeeId) &&
    Array.isArray(event.changedFields) &&
    event.changedFields.every((field) => typeof field === 'string') &&
    typeof event.occurredAt === 'string' &&
    !Number.isNaN(Date.parse(event.occurredAt))
  );
}