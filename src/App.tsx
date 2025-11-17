import "./App.css";
import FooterBar from "./components/layout/FooterBar.tsx";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import HomePage from "./components/pages/HomePage.tsx";
import ProfilePage from "./components/pages/profile/ProfilePage.tsx";
import { ModalProvider } from "./context/ModalProvider.tsx";
import ModalManager from "./components/modal/ModalManager";
import SavedPage from "./components/pages/SavedPage.tsx";
import NotificationPage from "./components/pages/NotificationPage.tsx";
import FullTweet from "./components/tweet/FullTweet.tsx";
import { HeaderContentProvider } from "./context/HeaderContentProvider.tsx";
import { Toaster, type DefaultToastOptions } from "react-hot-toast";
import AboutPage from "./components/pages/AboutPage.tsx";
import ExplorePage from "./components/pages/ExplorePage.tsx";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { GOOGLE_CLIENT_ID } from "./constants/env.ts";
import { LeftDesktopLayout } from "./components/layout/desktop_aside/LeftDesktopLayout.tsx";
import { RightDesktopLayout } from "./components/layout/desktop_aside/RightDesktopLayout.tsx";
import { useEffect, useMemo } from "react";
import type { ThemeType } from "./types/ThemeType.ts";
import type { BackgroundType } from "./types/BackgroundType.ts";
import LoginPage from "./components/pages/LoginPage.tsx";
import { useCurrentUser } from "./hooks/auth/useCurrentUser.tsx";
import OnboardingPage from "./components/pages/OnboardingPage.tsx";

function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem("twitterTheme") as ThemeType | null;
    const savedBackground = localStorage.getItem(
      "twitterBackground"
    ) as BackgroundType | null;

    if (savedTheme) {
      document.documentElement.style.setProperty("--color-main", savedTheme);
    }

    if (savedBackground) {
      document.documentElement.style.setProperty(
        "--background-main",
        savedBackground
      );
    }
  }, []);

  const toastOptions: DefaultToastOptions = {
    style: {
      color: "white",
      borderRadius: "4px",
      backgroundColor: "var(--color-main)",
    },
    success: { duration: 4000 },
  };

  const token = useMemo(
    () => (typeof window !== "undefined" ? localStorage.getItem("jwt") : null),
    []
  );
  const { isLoading, isError, data: currentUser } = useCurrentUser();

  const ProtectedApp = () => {
    if (!token || isError) {
      return <Navigate to="/login" replace />;
    }

    if (isLoading) return null;
    if (!currentUser) return null;

    const needsOnboarding =
      !currentUser.username || !(currentUser as any).campus;

    if (needsOnboarding) {
      return <OnboardingPage onComplete={() => window.location.replace("/")} />;
    }

    return (
      <div className="min-h-screen w-full bg-(--background-main) text-twitterText flex justify-center">
        <div className="flex w-full max-w-[1600px] gap-6 px-3 xl:px-10">
          <LeftDesktopLayout />

          <div className="flex-1 xl:max-w-3xl h-screen flex flex-col border-x border-twitterBorder/40">
            <div className="flex-1 overflow-y-auto scrollbar-blue bg-(--background-main)">
              <Routes>
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/profile/:ID" element={<ProfilePage />} />
                <Route path="/tweet/:postId" element={<FullTweet />} />
                <Route path="/saved" element={<SavedPage />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/notifications" element={<NotificationPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="*" element={<Navigate to="/home" replace />} />
              </Routes>
              <Toaster
                position="bottom-center"
                toastOptions={toastOptions}
                containerClassName="mb-12 xs:mb-0"
              />
            </div>

            <div className="xl:hidden">
              <FooterBar />
            </div>
          </div>

          <RightDesktopLayout />
        </div>
      </div>
    );
  };

  return (
    <Router>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <ModalProvider>
          <HeaderContentProvider>
            <ModalManager />
            <Routes>
              <Route
                path="/"
                element={
                  token && !isError ? (
                    <Navigate to="/home" replace />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/login"
                element={
                  token && !isError ? (
                    <Navigate to="/home" replace />
                  ) : (
                    <LoginPage />
                  )
                }
              />
              <Route path="/*" element={<ProtectedApp />} />
            </Routes>
          </HeaderContentProvider>
        </ModalProvider>
      </GoogleOAuthProvider>
    </Router>
  );
}

export default App;
