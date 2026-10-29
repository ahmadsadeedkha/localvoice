/**
 * Input from the voice agent's tools is written by an LLM, so nothing in it is
 * trusted. Failures come back as data the agent can explain out loud.
 */
const PHONE_RE = /^\+?[0-9]{7,15}$/;

export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_REASON_LENGTH = 500;
export const MAX_NAME_LENGTH = 200;
export const MAX_MESSAGES_PER_CALL = 3;

export const DEFAULT_TRANSFER_REASON = 'Caller asked to speak with a person.';

export interface ToolError {
  error: string;
  message: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: ToolError };

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const phone = (v: unknown) =>
  typeof v === 'string' ? v.replace(/[\s\-()]/g, '') : '';

export interface TakeMessageInput {
  caller_name?: unknown;
  caller_phone?: unknown;
  message?: unknown;
}

export function validateTakeMessage(
  input: TakeMessageInput,
  callerIdPhone: string | null,
): Result<{ callerName: string | null; callerPhone: string; body: string }> {
  const body = text(input.message);
  if (!body) {
    return {
      ok: false,
      error: {
        error: 'missing_message',
        message: 'Ask the caller what they would like to pass on.',
      },
    };
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: {
        error: 'message_too_long',
        message:
          'That message is too long. Ask the caller to give a shorter version.',
      },
    };
  }

  // An explicit number wins; otherwise fall back to the caller ID of the call.
  const callerPhone = phone(input.caller_phone) || callerIdPhone || '';
  if (!PHONE_RE.test(callerPhone)) {
    return {
      ok: false,
      error: {
        error: 'missing_phone',
        message: 'Ask the caller for a phone number we can reach them on.',
      },
    };
  }

  const name = text(input.caller_name).slice(0, MAX_NAME_LENGTH);
  return {
    ok: true,
    value: { callerName: name || null, callerPhone, body },
  };
}

export interface TransferInput {
  reason?: unknown;
  caller_name?: unknown;
  caller_phone?: unknown;
}

/** A transfer request never fails on missing details: the request itself is what matters. */
export function validateTransfer(
  input: TransferInput,
  callerIdPhone: string | null,
): {
  callerName: string | null;
  callerPhone: string | null;
  reason: string;
} {
  const given = phone(input.caller_phone);
  const callerPhone = PHONE_RE.test(given) ? given : callerIdPhone;
  return {
    callerName: text(input.caller_name).slice(0, MAX_NAME_LENGTH) || null,
    callerPhone: callerPhone && PHONE_RE.test(callerPhone) ? callerPhone : null,
    reason:
      text(input.reason).slice(0, MAX_REASON_LENGTH) || DEFAULT_TRANSFER_REASON,
  };
}
