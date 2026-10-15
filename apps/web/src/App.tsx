import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AuthCallback } from "./features/auth/pages/AuthCallback";
import { RequireAuth, RequireOnboarding } from "./features/auth/guards";
const CompaniesPage = lazy(() =>
  import("./features/companies/pages/CompaniesPage").then((m) => ({ default: m.CompaniesPage })),
);
const CompanyPage = lazy(() =>
  import("./features/companies/pages/CompanyPage").then((m) => ({ default: m.CompanyPage })),
);
import { OnboardingRoute } from "./features/onboarding/OnboardingRoute";
const OpportunitiesPage = lazy(() =>
  import("./features/opportunities/pages/OpportunitiesPage").then((m) => ({ default: m.OpportunitiesPage })),
);
const OpportunityPage = lazy(() =>
  import("./features/opportunities/pages/OpportunityPage").then((m) => ({ default: m.OpportunityPage })),
);
const InboxPage = lazy(() => import("./features/inbox/pages/InboxPage"));
const DashboardPage = lazy(() => import("./features/dashboard/pages/DashboardPage"));
const QueuesPage = lazy(() => import("./features/queues/pages/QueuesPage"));
const ContactPage = lazy(() => import("./features/contacts/pages/ContactPage"));

/** Rota inicial. */
const HOME_PATH = "/inbox";

export default function App() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingRoute />} />

        <Route element={<RequireOnboarding />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to={HOME_PATH} replace />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/companies/:id" element={<CompanyPage />} />
            <Route path="/opportunities" element={<OpportunitiesPage />} />
            <Route path="/opportunities/:id" element={<OpportunityPage />} />
            <Route path="/contacts/:id" element={<ContactPage />} />
            <Route path="/settings/queues" element={<QueuesPage />} />
            <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
