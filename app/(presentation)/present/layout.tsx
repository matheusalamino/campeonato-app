import { Toaster } from "sonner";

export default function DraftLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      {children}
      <Toaster richColors position="top-center" />
    </div>
  );
}
