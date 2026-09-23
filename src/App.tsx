import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { SignInProvider } from "./components/SignIn";
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
      <main>
        <Outlet />
      </main>
    </>
  );
}

/** Old /m/<family>/<version> links → /m/<version>. */
function LegacyModelRedirect() {
  const { versionId = "" } = useParams();
  return <Navigate to={`/m/${encodeURIComponent(versionId)}`} replace />;
}

export function App() {
  return (
    <SignInProvider>
      <Routes>
        <Route element={<Chrome />}>
          <Route path="/" element={<Home />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/models" element={<Models />} />
          <Route path="/m/:id" element={<ModelPage />} />
          <Route path="/m/:family/:versionId" element={<LegacyModelRedirect />} />
          <Route path="/u/:handle" element={<Profile />} />
          <Route path="/r/:id" element={<ReviewPage />} />
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
