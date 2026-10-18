"use client";
import { withLocale } from "../i18n/LocaleProvider.jsx";




import { useState } from "react";
import Navbar from "./Navbar.jsx";
import Hero from "./Hero.jsx";
import MenuSection from "./MenuSection.jsx";
import OffersSection from "./offers/OffersSection.jsx";
import About from "./About.jsx";
import Contact from "./Contact.jsx";
import VisitUs from "./VisitUs.jsx";
import LandingFooter from "./LandingFooter.jsx";
import CartDrawer from "./CartDrawer.jsx";
import PublicHashNavigation from "./PublicHashNavigation.jsx";
import { usePublicRestaurant } from "../context/PublicRestaurantContext.jsx";

const SHOW_CONTACT_SECTION = false;

const HomePageClient = ({
  initialMenuItems = [],
  initialCombos = [],
  initialOffers = [],
  restaurantSettings = null
}) => {
  const [cartOpen, setCartOpen] = useState(false);
  const { settings } = usePublicRestaurant();

  return (
    <div className="public-page bg-dune-gradient min-h-screen">
      <PublicHashNavigation />
      <Navbar onCartClick={() => setCartOpen(true)} />
      <main>
        <Hero />
        <MenuSection
          initialItems={initialMenuItems}
          initialCombos={initialCombos} />

        <OffersSection
          initialOffers={initialOffers}
          onCartOpen={() => setCartOpen(true)} />

        <About />
        {SHOW_CONTACT_SECTION && <Contact settings={restaurantSettings} />}
        <VisitUs settings={settings || restaurantSettings} />
      </main>
      <LandingFooter />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>);

};

export default withLocale(HomePageClient);
