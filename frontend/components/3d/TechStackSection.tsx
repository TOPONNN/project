"use client";

import SectionWrapper from "./SectionWrapper";

const TechStackSection = () => (
  <SectionWrapper
    id="skills"
    className="w-full h-screen md:h-[150dvh] pointer-events-none"
  >
    <div className="flex flex-col items-center justify-center h-full">
      <h2 className="text-4xl md:text-6xl font-bold text-white/90">
        Tech Stack
      </h2>
      <p className="mt-4 text-lg text-white/50">(hint: press a key)</p>
    </div>
  </SectionWrapper>
);

export default TechStackSection;
