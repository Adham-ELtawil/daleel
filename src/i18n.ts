import messages from "@/messages/en.json";

export const t = (key: keyof typeof messages.intake) => messages.intake[key];
