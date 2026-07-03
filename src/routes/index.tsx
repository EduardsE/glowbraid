import { createFileRoute } from "@tanstack/react-router";
import { FilamentStudio } from "@/components/filament/FilamentStudio";

export const Route = createFileRoute("/")({ component: FilamentStudio });
