"use client";

import { useState, useCallback } from "react";
import CustomCursor from "@/components/CustomCursor";
import Preloader from "@/components/Preloader";
import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import StackingCards from "@/components/StackingCards";
import SplitPresets from "@/components/SplitPresets";
import LiveDemo from "@/components/LiveDemo";
import Footer from "@/components/Footer";

export default function Home() {
  const [animationsReady, setAnimationsReady] = useState(false);

  const handlePreloaderComplete = useCallback(() => {
    setAnimationsReady(true);
  }, []);

  return (
    <>
      <CustomCursor />
      <Preloader onComplete={handlePreloaderComplete} />
      <Navigation />
      <Hero animationsReady={animationsReady} />
      <Marquee />
      <StackingCards animationsReady={animationsReady} />
      <SplitPresets />
      <LiveDemo />
      <Footer />
    </>
  );
}
