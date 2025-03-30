import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ProjectPage from "@/pages/project-page";
import AdminPage from "@/pages/admin-page";
import { ProjectsProvider } from "@/hooks/use-projects";
import { UsersProvider } from "@/hooks/use-users";

function App() {
  return (
    <>
      <UsersProvider>
        <ProjectsProvider>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/project/:projectId" component={ProjectPage} />
            <Route path="/admin" component={AdminPage} />
            <Route path="/auth" component={AuthPage} />
            <Route component={NotFound} />
          </Switch>
        </ProjectsProvider>
      </UsersProvider>
      <Toaster />
    </>
  );
}

export default App;
