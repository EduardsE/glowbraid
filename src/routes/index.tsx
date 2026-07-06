import { createFileRoute } from "@tanstack/react-router";
import { GlowbraidStudio } from "@/components/glowbraid/GlowbraidStudio";

export const Route = createFileRoute("/")({
  component: GlowbraidStudio,
  ssr: false,
});
