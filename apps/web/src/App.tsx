import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AuthCallback } from "./features/auth/pages/AuthCallback";
import { RequireAuth, RequireOnboarding } from "./features/auth/guards";
import { CompaniesPage } from "./features/companies/pages/CompaniesPage";
import { CompanyPage } from "./features/companies/pages/CompanyPage";
import { ContactTimelinePage } from "./features/contacts/pages/ContactTimelinePage";
import { OnboardingRoute } from "./features/onboarding/OnboardingRoute";
import { OpportunitiesPage } from "./features/opportunities/pages/OpportunitiesPage";
import { OpportunityPage } from "./features/opportunities/pages/OpportunityPage";
import {
  DashboardPage,
  InboxPage,
} from "./features/placeholders/pages/ComingSoonPage";

/** Rota inicial. Trocar para "/inbox" quando a Inbox for lançada. */
const HOME_PATH = "/opportunities";

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
            <Route path="/contacts/:id" element={<ContactTimelinePage />} />
            <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
