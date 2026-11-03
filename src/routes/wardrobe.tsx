import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old preview path; the wardrobe is now the Ghost Lab. */
export const Route = createFileRoute("/wardrobe")({
  beforeLoad: () => { throw redirect({ to: "/lab" }); },
});
