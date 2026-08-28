"use client";

import { useState } from "react";
import BlogSidebar from "./BlogSidebar.jsx";
import CartDrawer from "./CartDrawer.jsx";
import Footer from "./Footer.jsx";
import Navbar from "./Navbar.jsx";

const BlogPostPage = ({ slug, sidebarData, children }) => {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="min-h-screen bg-black">
      <Navbar onCartClick={() => setCartOpen(true)} />

      <main className="mx-auto grid max-w-7xl gap-10 px-5 pb-20 pt-28 md:px-8 md:pb-28 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">{children}</div>
        <div className="min-w-0">
          <BlogSidebar currentSlug={slug} initialData={sidebarData} />
        </div>
      </main>

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default BlogPostPage;
