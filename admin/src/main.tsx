import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ClerkProvider } from "@clerk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner.tsx";
import "./index.css";
import App from "./App.tsx";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/sign-in"
      appearance={{
        variables: { colorPrimary: "#0f766e", borderRadius: "0.5rem" },
      }}
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <Toaster />
        </QueryClientProvider>
      </ThemeProvider>
    </ClerkProvider>
  </StrictMode>,
);
