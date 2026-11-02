import { PlantProviders } from "@/components/app/PlantProviders";

export default function PlantLayout({ children }: { children: React.ReactNode }) {
  return <PlantProviders>{children}</PlantProviders>;
}
