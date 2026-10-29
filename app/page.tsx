import Link from "next/link";
import messages from "@/messages/en.json";

export default function Home() {
  const t = messages.landing;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-5xl font-bold tracking-tight">{t.title}</h1>
      <p className="text-xl font-medium">{t.tagline}</p>
      <p className="text-base leading-7 opacity-80">{t.description}</p>
      <p className="text-sm opacity-60">{t.status}</p>
      <Link href="/problem" className="underline">
        {messages.intake.title}
      </Link>
    </main>
  );
}
