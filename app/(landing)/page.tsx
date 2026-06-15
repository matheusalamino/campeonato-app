import HeroSection from "@/components/landing/HeroSection";
import { getRecentChampions } from "@/lib/landing/queries";

export default async function LandingPage() {
  const recentChampions = await getRecentChampions(4);

  return (
    <main>
      <HeroSection recentChampions={recentChampions} />
    </main>
  );
}
