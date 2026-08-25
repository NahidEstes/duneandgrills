"use client";

import React, { useState } from "react";
import { Phone, Mail, MapPin, Send } from "lucide-react";

const Contact = () => {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sent, setSent] = useState(false);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Wire this up to a real /api/contact endpoint when one exists.
    setSent(true);
    setForm({ name: "", email: "", message: "" });
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <section id="contact" className="relative bg-black py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-5 md:px-8 grid md:grid-cols-2 gap-14">
        <div>
          <p className="eyebrow">Get In Touch</p>
          <h2 className="mt-3 text-4xl md:text-5xl text-white leading-tight">
            LET&apos;S TALK <span className="text-gradient-amber">FLAVOR.</span>
          </h2>
          <p className="mt-5 text-neutral-400 leading-relaxed max-w-md">
            Questions about catering, private events, or just want to say hi?
            Reach out — we usually reply within a day.
          </p>

          <div className="mt-9 space-y-5">
            <a
              href="tel:+96605082140327"
              className="flex items-center gap-4"
              aria-label="Call Dune and Grills at +966 050 821 40327"
            >
              <div className="w-11 h-11 rounded-full bg-dune-amber/10 border border-dune-amber/40 flex items-center justify-center">
                <Phone className="w-5 h-5 text-dune-amber" />
              </div>
              <span className="text-neutral-300">+966 050 821 40327</span>
            </a>
            <a
              href="mailto:hello@duneandgrills.com"
              className="flex items-center gap-4"
              aria-label="Email Dune and Grills"
            >
              <div className="w-11 h-11 rounded-full bg-dune-amber/10 border border-dune-amber/40 flex items-center justify-center">
                <Mail className="w-5 h-5 text-dune-amber" />
              </div>
              <span className="text-neutral-300">hello@duneandgrills.com</span>
            </a>
            <a
              href="https://maps.app.goo.gl/fB8oDz42G7eb1JLs6"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4"
              aria-label="Open Dune and Grills location in Google Maps"
            >
              <div className="w-11 h-11 rounded-full bg-dune-amber/10 border border-dune-amber/40 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-dune-amber" />
              </div>
              <span className="text-neutral-300">
                Wadi As Sarh, Al Wadi, Riyadh 18738
              </span>
            </a>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-dune-border bg-dune-surface p-7 md:p-8"
        >
          <div className="space-y-5">
            <div>
              <label
                htmlFor="name"
                className="block text-sm text-neutral-400 mb-1.5"
              >
                Name
              </label>
              <input
                id="name"
                name="name"
                required
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white placeholder-neutral-600 focus:border-dune-amber outline-none transition-colors"
                placeholder="Your name"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="block text-sm text-neutral-400 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                name="email"
                required
                value={form.email}
                onChange={handleChange}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white placeholder-neutral-600 focus:border-dune-amber outline-none transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label
                htmlFor="message"
                className="block text-sm text-neutral-400 mb-1.5"
              >
                Message
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={4}
                value={form.message}
                onChange={handleChange}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white placeholder-neutral-600 focus:border-dune-amber outline-none transition-colors resize-none"
                placeholder="Tell us what's on your mind"
              />
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 bg-dune-amber hover:bg-dune-amberLight text-black font-semibold px-6 py-3.5 rounded-full transition-colors duration-300"
            >
              {sent ? "Message Sent" : "Send Message"}
              {!sent && <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default Contact;
