import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, Outlet } from 'react-router-dom';

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const VIEWPORT = { once: true, amount: 0.15 };

export function FadeUp({ children, delay = 0, className = '', ...props }) {
  return (
    <motion.div className={className} variants={fadeUp} initial="hidden" whileInView="visible" viewport={VIEWPORT} transition={{ duration: 0.5, ease: 'easeOut', delay }} {...props}>
      {children}
    </motion.div>
  );
}

export function FadeIn({ children, delay = 0, className = '', ...props }) {
  return (
    <motion.div className={className} variants={fadeIn} initial="hidden" whileInView="visible" viewport={VIEWPORT} transition={{ duration: 0.6, ease: 'easeOut', delay }} {...props}>
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className = '', amount = 0.12, ...props }) {
  return (
    <motion.div className={className} variants={{ hidden: {}, visible: { transition: { staggerChildren: amount } } }} initial="hidden" whileInView="visible" viewport={VIEWPORT} {...props}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '', ...props }) {
  return (
    <motion.div className={className} variants={fadeUp} transition={{ duration: 0.45, ease: 'easeOut' }} {...props}>
      {children}
    </motion.div>
  );
}

export function PageTransition({ children, ...props }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} {...props}>
      {children}
    </motion.div>
  );
}

export function AnimatedOutlet() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}
