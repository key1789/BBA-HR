"use client";

import { motion, type Variants } from "framer-motion";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AnimatedPageProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

const pageVariants = {
  initial: { opacity: 0, y: 15, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -15, scale: 0.99 },
};

export function AnimatedPage({ children, className, delay = 0 }: AnimatedPageProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{ 
        duration: 0.4, 
        ease: [0.22, 1, 0.36, 1],
        delay: delay
      }}
      className={cn("w-full h-full", className)}
    >
      {children}
    </motion.div>
  );
}

// Untuk list yang berurutan munculnya
export const STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 15, scale: 0.95 },
  show: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24
    }
  },
};
