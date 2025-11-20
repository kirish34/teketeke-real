import { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
}

export function Card({ title, children }: CardProps) {
  return (
    <section className="tt-card">
      {title && <div className="tt-card-title">{title}</div>}
      {children}
    </section>
  );
}

