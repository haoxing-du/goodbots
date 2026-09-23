import { Outlet, Route, Routes } from "react-router-dom";
import { SignInProvider } from "./components/SignIn";
import { ConfirmProvider } from "./components/Confirm";
import { TopBar } from "./components/TopBar";
import { Home } from "./pages/Home";
import { Reviews } from "./pages/Reviews";
import { Models } from "./pages/Models";
import { ModelPage } from "./pages/ModelPage";
import { WriteReview } from "./pages/WriteReview";
import { Profile } from "./pages/Profile";
import { RequestModel } from "./pages/RequestModel";
import { Admin } from "./pages/Admin";
import { Search } from "./pages/Search";
import { ReviewPage } from "./pages/ReviewPage";
import { NotFound } from "./pages/NotFound";

function Chrome() {
  return (
    <>
      <TopBar />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}

export function App() {
  return (
    <SignInProvider>
      <ConfirmProvider>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Routes>
          <Route element={<Chrome />}>
            <Route path="/" element={<Home />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/models" element={<Models />} />
            <Route path="/m/:provider/:model" element={<ModelPage />} />
            <Route path="/u/:handle" element={<Profile />} />
            <Route path="/r/:id" element={<ReviewPage />} />
            <Route path="/request" element={<RequestModel />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/search" element={<Search />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="/write" element={<WriteReview />} />
        </Routes>
      </ConfirmProvider>
    </SignInProvider>
  );
}
