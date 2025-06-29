"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          if (registrations.length === 0) {
            navigator.serviceWorker.register("/service-worker.js").catch((err) => {
              console.error("ServiceWorker registration failed:", err);
            });
          }
        });
      });
    }
  }, []);
  return null;
} 