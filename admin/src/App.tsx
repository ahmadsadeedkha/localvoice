import { Navigate, Route, Routes } from "react-router";
import { SignIn } from "@clerk/react";
import { AdminLayout } from "@/components/admin-layout";
import { RequirePlatformAdmin } from "@/components/require-platform-admin";
import { TenantsPage } from "@/pages/tenants";

function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/" />
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route element={<RequirePlatformAdmin />}>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Navigate to="/tenants" replace />} />
          <Route path="/tenants" element={<TenantsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
