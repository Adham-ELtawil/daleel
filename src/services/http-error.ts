import { t } from "@/src/i18n";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: Parameters<typeof t>[0],
    locale: "en" | "ar-EG" = "en",
  ) {
    super(t(code, locale));
  }
}
