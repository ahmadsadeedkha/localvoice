import { parsePhoneNumberFromString } from "libphonenumber-js";

export function PhoneNumber({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">Unknown</span>;
  const pretty =
    parsePhoneNumberFromString(value)?.formatInternational() ?? value;
  return <span className="font-mono tabular-nums">{pretty}</span>;
}
