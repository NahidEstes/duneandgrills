"use client";

import { useState } from "react";
import Navbar from "./Navbar.jsx";
import Hero from "./Hero.jsx";
import MenuSection from "./MenuSection.jsx";
import OffersSection from "./offers/OffersSection.jsx";
import About from "./About.jsx";
import Contact from "./Contact.jsx";
import Footer from "./Footer.jsx";
import CartDrawer from "./CartDrawer.jsx";

const HomePageClient = ({ initialMenuItems = [], initialOffers = [] }) => {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="bg-dune-gradient min-h-screen">
      <Navbar onCartClick={() => setCartOpen(true)} />
      <main>
        <Hero />
        <MenuSection initialItems={initialMenuItems} />
        <OffersSection initialOffers={initialOffers} />
        <About />
        <Contact />
      </main>
      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default HomePageClient;
