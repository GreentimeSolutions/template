import { createFileRoute } from "@tanstack/react-router";
import { YoucogApp } from "@/components/youcog/app";

export const Route = createFileRoute("/")({ component: YoucogApp });
