import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        <div className="flex h-screen">
          <main className="flex-1 overflow-y-auto pb-10 pr-10 pl-10 pt-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
