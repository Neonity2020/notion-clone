import { SignIn } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "../components/AuthShell";

export const Route = createFileRoute("/sign-in/$")({
  component: Page,
});

function Page() {
  return (
    <AuthShell>
      <SignIn />
    </AuthShell>
  );
}
