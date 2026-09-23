import { Outlet, Route, Routes } from "react-router-dom";
import { SignInProvider } from "./components/SignIn";
import { TopBar } from "./components/TopBar";
import { Home } from "./pages/Home";
import { Models } from "./pages/Models";
import { ModelPage } from "./pages/ModelPage";
import { WriteReview } from "./pages/WriteReview";
import { Profile } from "./pages/Profile";
import { RequestModel } from "./pages/RequestModel";
import { Admin } from "./pages/Admin";
import { Search } from "./pages/Search";
import { NotFound } from "./pages/NotFound";

function Chrome() {
  return (
    <>
      <TopBar />
      <main>
        <Outlet />
      </main>
    </>
  );
}

export function App() {
  return (
    <SignInProvider>
      <Routes>
        <Route element={<Chrome />}>
          <Route path="/" element={<Home />} />
          <Route path="/models" element={<Models />} />
          <Route path="/m/:slug/:versionId?" element={<ModelPage />} />
          <Route path="/u/:handle" element={<Profile />} />
          <Route path="/request" element={<RequestModel />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/search" element={<Search />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="/write" element={<WriteReview />} />
      </Routes>
    </SignInProvider>
  );
}
