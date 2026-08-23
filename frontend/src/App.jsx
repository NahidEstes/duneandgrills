import React, { useState } from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Hero from "./components/Hero.jsx";
import MenuSection from "./components/MenuSection.jsx";
import About from "./components/About.jsx";
import Contact from "./components/Contact.jsx";
import Footer from "./components/Footer.jsx";
import CartDrawer from "./components/CartDrawer.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import AuthPage from "./components/AuthPage.jsx";
import ProfilePage from "./components/ProfilePage.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import FullMenuPage from "./components/FullMenuPage.jsx";

function HomePage({ onCartClick, cartOpen, setCartOpen }) {
  return (
    <div className="bg-dune-gradient min-h-screen">
      <Navbar onCartClick={onCartClick} />
      <main>
        <Hero />
        <MenuSection />
        <About />
        <Contact />
      </main>
      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}

function App() {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <HomePage
            onCartClick={() => setCartOpen(true)}
            cartOpen={cartOpen}
            setCartOpen={setCartOpen}
          />
        }
      />
      <Route path="/menu" element={<FullMenuPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["admin", "manager"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
