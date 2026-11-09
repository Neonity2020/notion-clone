import { SignUp } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "../components/AuthShell";

export const Route = createFileRoute("/sign-up/$")({
  component: Page,
});

function Page() {
  return (
    <AuthShell>
      <SignUp />
    </AuthShell>
  );
}
