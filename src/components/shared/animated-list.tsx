"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { STAGGER_CONTAINER, STAGGER_ITEM } from "./animated-page";

interface Props {
  children: ReactNode;
  className?: string;
}

export function AnimatedList({ children, className }: Props) {
  return (
    <motion.div
      variants={STAGGER_CONTAINER}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedListItem({ children, className }: Props) {
  return (
    <motion.div variants={STAGGER_ITEM} className={className}>
      {children}
    </motion.div>
  );
}
