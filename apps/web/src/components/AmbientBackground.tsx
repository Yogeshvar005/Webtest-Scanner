"use client";

import React, { useEffect, useRef } from "react";

export default function AmbientBackground() {
  const mouseGlowRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Interactive Mouse-following Ambient Glow & Console Tilt Parallax
    const mouseGlow = mouseGlowRef.current;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;
    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;

      const consoleCard = document.getElementById("audit-console-card");
      if (consoleCard) {
        const rect = consoleCard.getBoundingClientRect();
        const cardX = rect.left + rect.width / 2;
        const cardY = rect.top + rect.height / 2;
        const deltaX = (e.clientX - cardX) / (window.innerWidth / 2);
        const deltaY = (e.clientY - cardY) / (window.innerHeight / 2);

        // Subtle 3D magnetic tilt
        if (window.innerWidth > 768) {
          consoleCard.style.transform = `perspective(1000px) rotateX(${-deltaY * 1.5}deg) rotateY(${deltaX * 1.5}deg)`;
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    // Smooth lerp loop for ambient mouse glow
    function animateMouseGlow() {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      if (mouseGlow) {
        mouseGlow.style.left = `${currentX}px`;
        mouseGlow.style.top = `${currentY}px`;
      }
      animationFrameId = requestAnimationFrame(animateMouseGlow);
    }
    animateMouseGlow();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    // Dynamic Ambient Dust Particles Canvas
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: {
      x: number;
      y: number;
      radius: number;
      speedY: number;
      speedX: number;
      alpha: number;
      color: string;
    }[] = [];
    const particleCount = 28;
    let animationFrameId: number;

    function resizeCanvas() {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 1.6 + 0.4,
        speedY: Math.random() * -0.35 - 0.08,
        speedX: (Math.random() - 0.5) * 0.25,
        alpha: Math.random() * 0.5 + 0.15,
        color: Math.random() > 0.4 ? "245, 158, 11" : "56, 189, 248",
      });
    }

    function renderDust() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
        ctx.fill();

        p.y += p.speedY;
        p.x += p.speedX;

        if (p.y < -10) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
      });
      animationFrameId = requestAnimationFrame(renderDust);
    }
    renderDust();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <>
      <div
        aria-hidden="true"
        className="interactive-mouse-glow"
        id="mouse-glow"
        ref={mouseGlowRef}
      ></div>
      <canvas
        aria-hidden="true"
        className="dust-canvas"
        id="dust-canvas"
        ref={canvasRef}
      ></canvas>
    </>
  );
}
