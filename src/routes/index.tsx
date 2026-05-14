import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // Always send users to /home; the app layout handles auth
    throw redirect({ to: "/home" });
  },
});
