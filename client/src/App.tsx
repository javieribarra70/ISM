import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ProjectPage from "@/pages/project-page";
import AdminPage from "@/pages/admin-page";
import { ProjectsProvider } from "@/hooks/use-projects";
import { UsersProvider } from "@/hooks/use-users";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";

function App() {
  return (
    <>
      <AuthProvider>
        <UsersProvider>
          <ProjectsProvider>
            <Switch>
              <ProtectedRoute path="/" component={HomePage} />
              <ProtectedRoute path="/project/:projectId" component={ProjectPage} />
              <ProtectedRoute path="/admin" component={AdminPage} />
              <Route path="/auth" component={AuthPage} />
              <Route component={NotFound} />
            </Switch>
          </ProjectsProvider>
        </UsersProvider>
      </AuthProvider>
      <Toaster />
    </>
  );
}

export default App;
